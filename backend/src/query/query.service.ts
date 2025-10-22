import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UserEmbeddingService } from '../embedding/user-embed.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class QueryService {
  private readonly OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly OPENROUTER_MODEL = 'google/gemma-2-9b-it';

  private readonly KNOWLEDGE_BASE_PATHS = [
    path.join(process.cwd(), '../knowledge-base'),
  ];

  constructor(
    private readonly db: DatabaseService,
    private readonly embedService: UserEmbeddingService,
  ) {}

  // Fungsi utama
  async handleUserQuestion(question: string, hospitalCode: string) {
    if (!hospitalCode) {
      return { success: false, error: '⚠️ Harap pilih rumah sakit terlebih dahulu.' };
    }

    const dbName = `${hospitalCode}`; // contoh: rs_a_db, rs_b_db
    console.log(`🏥 Menggunakan database: ${dbName}`);

    console.log('\n==================================================');
    console.log(`🧠 [Auto Query] Pertanyaan user: "${question}"`);
    console.log('==================================================');

    // [1] Buat embedding pertanyaan user
    console.log('⚙️  [1] Membuat embedding...');
    const { vector: userEmbedding } = await this.embedService.generateEmbedding(question, 'bge-m3');
    console.log(`✅  Embedding berhasil dibuat (${userEmbedding.length} dimensi)`);

    // [2] Deteksi domain relevan
    console.log('\n⚙️  [2] Mendeteksi domain paling relevan...');
    const vectorString = `[${userEmbedding.join(',')}]`;

    const { rows: domainCandidates } = await this.db.query(
      `
      SELECT domain, MAX(1 - (embedding <=> $1::vector)) AS similarity
      FROM rag."KnowledgeBaseEmbeddingBGE"
      GROUP BY domain
      ORDER BY similarity DESC
      LIMIT 1;
      `,
      [vectorString],
      dbName, // ⬅️ pake DB sesuai RS
    );

    if (domainCandidates.length === 0) {
      return { success: false, error: '❌ Tidak ada domain relevan ditemukan.' };
    }

    const detectedDomain = domainCandidates[0].domain;
    console.log(`✅ Domain terdeteksi: ${detectedDomain}`);

    // [3] Load knowledge base domain
    console.log('\n⚙️  [3] Memuat knowledge base...');
    const kb = this.loadKnowledgeBase(detectedDomain);
    if (!kb) {
      return { success: false, error: `❌ Knowledge base "${detectedDomain}" tidak ditemukan.` };
    }
    console.log('✅  Knowledge base berhasil dimuat.');

    // [4] Ambil 3 konteks paling relevan
    console.log('\n⚙️  [4] Mengambil 3 konteks paling relevan...');
    const { rows: similarItems } = await this.db.query(
      `
      SELECT id, title, content, 1 - (embedding <=> $1::vector) AS similarity
      FROM rag."KnowledgeBaseEmbeddingBGE"
      WHERE domain = $2
      ORDER BY similarity DESC
      LIMIT 3;
      `,
      [vectorString, detectedDomain],
      dbName, // ⬅️ pake DB sesuai RS
    );

    const contextTexts = similarItems
      .map((i) => `(${i.similarity.toFixed(3)}) ${i.title}: ${i.content}`)
      .join('\n\n');

    // [5] Siapkan prompt
    console.log('\n⚙️  [5] Menyusun prompt untuk LLM...');
    let schemaDescription = JSON.stringify(kb.tables, null, 2);
    if (schemaDescription.length > 4000)
      schemaDescription = schemaDescription.slice(0, 4000) + '\n... [schema truncated]';

    // [6] Kirim ke OpenRouter
    console.log('⚙️  [6] Mengirim prompt ke OpenRouter...');
    const response = await fetch(this.OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `
            Kamu adalah asisten AI ahli SQL PostgreSQL.
            Buat query SQL valid berdasarkan schema dan konteks.
            Gunakan JOIN yang sesuai jika dibutuhkan.
            Jangan pernah memodifikasi data (hanya SELECT).
            `,
          },
          {
            role: 'user',
            content: `
            🧱 SCHEMA DATABASE:
            ${schemaDescription}

            📚 KONTEKS:
            ${contextTexts}

            Pertanyaan user:
            "${question}"

            Format output:
            \`\`\`sql
            SELECT ...
            \`\`\`
            `,
          },
        ],
      }),
    });

    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      return { success: false, sql: '-- Gagal parse respons model.' };
    }

    let sql = data?.choices?.[0]?.message?.content?.trim() || '-- Tidak ada SQL dihasilkan';
    sql = sql.replace(/```(sql)?/g, '').trim();
    console.log(`\n🧾 [Generated SQL]\n${sql}`);

    // [7] Jalankan query
    const dangerousKeywords = ['DROP', 'DELETE', 'ALTER', 'UPDATE', 'INSERT'];
    if (dangerousKeywords.some((kw) => sql.toUpperCase().includes(kw))) {
      return {
        success: true,
        sql,
        warning: '⚠️ Query berpotensi mengubah data, tidak dijalankan otomatis.',
      };
    }

    console.log('\n⚙️  [7] Menjalankan query di database...');
    try {
      const result = await this.db.query(sql, [], dbName);
      return {
        success: true,
        sql,
        data: result.rows,
        detectedDomain,
        usedModel: this.OPENROUTER_MODEL,
      };
    } catch (err) {
      return {
        success: false,
        sql,
        error: `❌ Gagal menjalankan query: ${err.message}`,
      };
    }
  }

  private loadKnowledgeBase(domain: string) {
    for (const basePath of this.KNOWLEDGE_BASE_PATHS) {
      const filePath = path.join(basePath, `knowledge-base-${domain}.json`);
      if (fs.existsSync(filePath)) {
        try {
          return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (err) {
          console.error(`❌ Error parsing file ${filePath}:`, err);
          return null;
        }
      }
    }
    return null;
  }
}
