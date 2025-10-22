import { Injectable } from '@nestjs/common';
import { PrismaClient as PrismaRS } from '.prisma/rs-client';
import { PrismaClient as PrismaRAG } from '.prisma/rag-client';
import { UserEmbeddingService } from '../embedding/user-embed.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class QueryService {
  private readonly OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly OPENROUTER_MODEL = 'google/gemma-2-9b-it';
  private readonly prismaRag = new PrismaRAG(); // koneksi tetap ke rag_db

  private readonly KNOWLEDGE_BASE_PATHS = [
    path.join(process.cwd(), '../knowledge-base'),
  ];

  constructor(private readonly embedService: UserEmbeddingService) {}

  async handleUserQuestion(question: string, hospitalCode: string) {
    if (!hospitalCode)
      return { success: false, error: '⚠️ Harap pilih rumah sakit terlebih dahulu.' };

    const cleanCode = hospitalCode.endsWith('_db')
  ? hospitalCode.slice(0, -3)
  : hospitalCode;

const dbUrl = `postgresql://postgres:postgres@localhost:5433/${cleanCode}_db`;
    const prismaRS = new PrismaRS({ datasources: { db: { url: dbUrl } } });

    console.log(`🏥 Menggunakan database: ${hospitalCode}_db`);
    console.log('\n==================================================');
    console.log(`🧠 [Auto Query] Pertanyaan user: "${question}"`);
    console.log('==================================================');

    try {
      // [1] Embedding
      console.log('⚙️ [1] Membuat embedding...');
      const { vector: userEmbedding } = await this.embedService.generateEmbedding(
        question,
        'bge-m3',
      );
      console.log(`✅ Embedding berhasil dibuat (${userEmbedding.length} dimensi)`);

      const vectorString = `[${userEmbedding.join(',')}]`;

     // [2] Domain detection
      console.log('\n⚙️ [2] Mendeteksi domain paling relevan...');
      // pastikan schema rag aktif
      await this.prismaRag.$executeRawUnsafe(`SET search_path TO rag, public;`);

      // ubah vector array jadi string literal yang valid di PostgreSQL
      const vectorLiteral = `'[${userEmbedding.join(',')}]'::vector`;

      const domainCandidates: any[] = await this.prismaRag.$queryRawUnsafe(`
        SELECT domain, MAX(1 - (embedding <=> ${vectorLiteral})) AS similarity
        FROM "KnowledgeBaseEmbeddingBGE"
        GROUP BY domain
        ORDER BY similarity DESC
        LIMIT 1;
      `);

      if (!domainCandidates.length)
        return { success: false, error: '❌ Tidak ada domain relevan ditemukan.' };

      const detectedDomain = domainCandidates[0].domain;
      console.log(`✅ Domain terdeteksi: ${detectedDomain}`);

      // [3] Load knowledge base file JSON
      console.log('\n⚙️ [3] Memuat knowledge base...');
      const kb = this.loadKnowledgeBase(detectedDomain);
      if (!kb)
        return {
          success: false,
          error: `❌ Knowledge base "${detectedDomain}" tidak ditemukan.`,
        };
      console.log('✅ Knowledge base berhasil dimuat.');

      // [4] Similar context
      console.log('\n⚙️ [4] Mengambil 3 konteks paling relevan...');
      await this.prismaRag.$executeRawUnsafe(`SET search_path TO rag, public;`);

      const similarItems: any[] = await this.prismaRag.$queryRawUnsafe(`
        SELECT id, title, content, 1 - (embedding <=> ${vectorLiteral}) AS similarity
        FROM "KnowledgeBaseEmbeddingBGE"
        WHERE domain = '${detectedDomain}'
        ORDER BY similarity DESC
        LIMIT 3;
      `);

      const contextTexts = similarItems
        .map((i) => `(${i.similarity.toFixed(3)}) ${i.title}: ${i.content}`)
        .join('\n\n');

      // [5] Prompt untuk LLM
      let schemaDescription = JSON.stringify(kb.tables, null, 2);
      if (schemaDescription.length > 4000)
        schemaDescription = schemaDescription.slice(0, 4000) + '\n... [schema truncated]';

      // [6] Panggil OpenRouter
      console.log('\n⚙️ [6] Mengirim prompt ke OpenRouter...');
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
              Gunakan JOIN jika perlu.
              Jangan pernah melakukan perubahan data.
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
        console.error('❌ Gagal parse respons OpenRouter:', rawText);
        return { success: false, sql: '-- Gagal parse respons model.' };
      }

      let sql = data?.choices?.[0]?.message?.content?.trim() || '-- Tidak ada SQL dihasilkan';
      sql = sql.replace(/```(sql)?/g, '').trim();
      console.log(`\n🧾 [Generated SQL]\n${sql}`);

      // [7] Eksekusi query ke database RS
      const dangerous = ['DROP', 'DELETE', 'ALTER', 'UPDATE', 'INSERT'];
      if (dangerous.some((kw) => sql.toUpperCase().includes(kw))) {
        return { success: true, sql, warning: '⚠️ Query berpotensi ubah data, tidak dijalankan.' };
      }

      console.log('\n⚙️ [7] Menjalankan query ke database rumah sakit...');
      const result = await prismaRS.$queryRawUnsafe<any[]>(sql);

      return {
        success: true,
        sql,
        data: result,
        detectedDomain,
        usedModel: this.OPENROUTER_MODEL,
      };
    } catch (err) {
      console.error('❌ Error handleUserQuestion:', err);
      return { success: false, error: err.message };
    } finally {
      await prismaRS.$disconnect();
      await this.prismaRag.$disconnect();
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
