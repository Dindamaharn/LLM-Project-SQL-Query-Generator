import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const OLLAMA_URL = `${process.env.OLLAMA_URL}/api/embed`;

// split text panjang 
function splitText(text: string, maxLength: number = 500): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    parts.push(text.slice(i, i + maxLength));
  }
  return parts;
}

// Generate embedding dengan safe parsing
async function generateEmbedding(model: string, text: string) {
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });

    const raw = await res.text();
    console.log('Raw response length:', raw.length);

    try {
      const data = JSON.parse(raw);
      if (!data.embeddings || !data.embeddings[0]) {
        throw new Error(`Model ${model} gagal mengembalikan embedding`);
      }
      return data.embeddings[0];
    } catch (err) {
      console.error('Failed to parse JSON from Ollama:', raw);
      throw err;
    }
  } catch (err) {
    console.error('Error generating embedding:', err);
    throw err;
  }
}

// Fungsi utama untuk read knowledge base
async function processKnowledgeBase(filePath: string, domain: string) {
  console.log(`\n📘 Loading knowledge base from ${filePath}`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const kb = JSON.parse(raw);

  const contents: string[] = [];

  if (kb.tables) {
    const tables = Object.entries(kb.tables as Record<string, any>);
    for (const [tableName, table] of tables) {
      contents.push(`Table ${tableName}: ${table.description || ''}`);
      if (table.business_context)
        contents.push(`Business context: ${table.business_context}`);
      if (table.common_queries)
        (Array.isArray(table.common_queries)
          ? table.common_queries
          : [table.common_queries]
        ).forEach((q: string) => contents.push(`Query example: ${q}`));
      if (table.key_columns)
        Object.entries(table.key_columns).forEach(([col, desc]) =>
          contents.push(`Key column ${col}: ${desc}`)
        );
      if (table.foreign_keys)
        table.foreign_keys.forEach((f: string) =>
          contents.push(`Foreign key: ${f}`)
        );
    }
  }

  if (kb.domainMappings) {
    for (const [name, map] of Object.entries(
      kb.domainMappings as Record<string, any>
    )) {
      contents.push(
        `Domain mapping ${name}: ${map.rule || ''}, keywords: ${(map.keywords || []).join(', ')}`
      );
    }
  }

  if (kb.relationships) {
    for (const [name, rel] of Object.entries(
      kb.relationships as Record<string, any>
    )) {
      contents.push(
        `Relationship ${name}: ${rel.description || ''}. Join pattern: ${rel.join_pattern}.`
      );
    }
  }

  console.log(`🔹 Total ${contents.length} items to embed from ${domain}`);

  // --- Loop embedding setiap item
  for (const [index, text] of contents.entries()) {
    const chunks = splitText(text, 500);
    for (const [i, chunk] of chunks.entries()) {
      try {
        console.log(
          `\n[${index + 1}/${contents.length}] Chunk ${i + 1}/${chunks.length}: ${chunk.slice(0, 80)}...`
        );

        // generate dua model embedding
        const embBGE = await generateEmbedding('bge-m3', chunk);
        const embNomic = await generateEmbedding('nomic-embed-text', chunk);

        // cek info embedding
        console.log('Type of embBGE:', typeof embBGE);
        console.log('Length of embBGE:', embBGE?.length);
        console.log('Sample data:', embBGE?.slice(0, 5));

        // ubah array ke format string pgvector
        const embBGEVector = `[${embBGE.join(',')}]`;
        const embNomicVector = `[${embNomic.join(',')}]`;

        // simpan ke tabel menggunakan raw SQL
        await prisma.$executeRawUnsafe(
          `INSERT INTO rag."KnowledgeBaseEmbeddingBGE" (domain, title, content, model, embedding)
            VALUES ($1, $2, $3, $4, $5::vector)`,
          domain,
          chunk.slice(0, 50),
          chunk,
          'bge-m3',
          embBGEVector
        );

        await prisma.$executeRawUnsafe(
          `INSERT INTO rag."KnowledgeBaseEmbeddingNomic" (domain, title, content, model, embedding)
            VALUES ($1, $2, $3, $4, $5::vector)`,
          domain,
          chunk.slice(0, 50),
          chunk,
          'nomic-embed-text',
          embNomicVector
        );

      } catch (err) {
        console.error('Skipping chunk due to error:', err);
      }
    }
  }
}

// 🔹 Eksekusi utama
(async () => {
  try {
    await processKnowledgeBase('../knowledge-base/knowledge-base-mbarang.json', 'mbarang');
    await processKnowledgeBase('../knowledge-base/knowledge-base-mpasien.json', 'mpasien');
    console.log('\n✅ Done generating all embeddings!');
  } catch (err) {
    console.error('❌ Fatal error:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
