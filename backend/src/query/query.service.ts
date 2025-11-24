import { Injectable } from '@nestjs/common';
import { PrismaClient as PrismaRS } from '.prisma/rs-client';
import { PrismaClient as PrismaRAG } from '.prisma/rag-client';
import { UserEmbeddingService } from '../embedding/user-embed.service';
import * as fs from 'fs';
import * as path from 'path';

type ModelResponse = {
  reasoning?: string | null;
  sql?: string | null;
  raw?: string | null; // raw content from the model (for debugging)
};

@Injectable()
export class QueryService {
  private readonly OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
  private readonly OPENROUTER_MODEL = 'deepseek/deepseek-r1-distill-qwen-32b'; // ganti sesuai aksesmu
  private readonly prismaRag = new PrismaRAG(); // koneksi ke rag_db
  private readonly KNOWLEDGE_BASE_PATHS = [
    path.join(process.cwd(), '../knowledge-base'),
  ];

  constructor(private readonly embedService: UserEmbeddingService) {}

  async handleUserQuestion(question: string, hospitalCode: string) {
    if (!hospitalCode)
      return { success: false, error: '⚠️ Harap pilih rumah sakit terlebih dahulu.' };

    const cleanCode = hospitalCode.endsWith('_db') ? hospitalCode.slice(0, -3) : hospitalCode;
    const dbUrl = `postgresql://postgres:postgres@localhost:5433/${cleanCode}_db`;
    let prismaRS: PrismaRS | null = null;

    console.log(`🏥 Menggunakan database: ${cleanCode}_db`);
    console.log('==================================================');
    console.log(`🧠 [Auto Query] Pertanyaan user: "${question}"`);
    console.log('==================================================');

    try {
      prismaRS = new PrismaRS({ datasources: { db: { url: dbUrl } } });

      // [1] Embedding
      console.log('⚙️ [1] Membuat embedding...');
      const { vector: userEmbedding } = await this.embedService.generateEmbedding(question, 'bge-m3');
      console.log(`✅ Embedding berhasil dibuat (${userEmbedding.length} dimensi)`);

      const vectorLiteral = `'[${userEmbedding.join(',')}]'::vector`;

      // [2] Domain detection
      console.log('\n⚙️ [2] Mendeteksi domain paling relevan...');
      await this.prismaRag.$executeRawUnsafe(`SET search_path TO rag, public;`);
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

      // [3] Load KB
      console.log('\n⚙️ [3] Memuat knowledge base...');
      const kb = this.loadKnowledgeBase(detectedDomain);
      if (!kb) return { success: false, error: `❌ Knowledge base "${detectedDomain}" tidak ditemukan.` };
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
      const contextTexts = similarItems.map((i) => `(${i.similarity.toFixed(3)}) ${i.title}: ${i.content}`).join('\n\n');

      // [5] Schema
      let schemaDescription = JSON.stringify(kb.tables || {}, null, 2);
      if (schemaDescription.length > 4000) schemaDescription = schemaDescription.slice(0, 4000) + '\n... [schema truncated]';

      // [6] Call model
      console.log('\n⚙️ [6] Meminta model menghasilkan SQL + reasoning...');
      const promptMessages = this.buildReasoningPrompt(schemaDescription, contextTexts, question);
      const modelResp = await this.callOpenRouterModel(promptMessages);

      // --- At this point modelResp.raw may contain anything.
      // We must robustly extract reasoning + sql as strings.
      console.log('\n🧾 Raw model content (for debugging):\n', modelResp.raw ?? '(no raw)');
      // If modelResp.sql is not a string yet, try to extract from raw
      if (!modelResp.sql) {
        const extractedFromRaw = this.extractModelJsonOrSql(modelResp.raw || '');
        modelResp.sql = extractedFromRaw.sql;
        modelResp.reasoning = extractedFromRaw.reasoning || modelResp.reasoning;
      }

      // Final safety: ensure sql is a string and clean (remove fences)
      if (!modelResp.sql || typeof modelResp.sql !== 'string') {
        return {
          success: false,
          error: '❌ Model tidak mengembalikan SQL string yang dapat dieksekusi.',
          rawModelContent: modelResp.raw,
        };
      }

      // sanitize SQL string (remove fences and leading/trailing junk)
      let sql = modelResp.sql.replace(/^\s*json\s*/i, ''); // remove leading "json" if any
      sql = sql.replace(/```(?:sql)?\s*/gi, '').replace(/\s*```$/gi, '').trim();

      // Final check again
      if (!sql || sql.length < 5) {
        return {
          success: false,
          error: '❌ SQL yang dihasilkan kosong atau terlalu pendek.',
          rawModelContent: modelResp.raw,
        };
      }

      console.log('\n🧠 [Model Reasoning]\n', modelResp.reasoning ?? '(no reasoning)');
      console.log('\n🧾 [Model SQL]\n', sql);

      // [7] Safety: prevent DML/DDL (basic)
      const dangerous = this.findDangerousKeywords(sql);
      if (dangerous.length) {
        return {
          success: true,
          sql,
          warning: `⚠️ Query mengandung kata kunci berbahaya (${dangerous.join(', ')}). Tidak dijalankan.`,
          reasoning: modelResp.reasoning,
          rawModelContent: modelResp.raw,
        };
      }

      // [8] Execute (single attempt — no fallback)
      console.log('\n⚙️ Menjalankan SQL (single attempt):');
      try {
        const result = await prismaRS.$queryRawUnsafe<any[]>(sql);
        console.log('✅ Query berhasil dieksekusi. rows=', Array.isArray(result) ? result.length : 'unknown');
        return {
          success: true,
          sql,
          data: result,
          detectedDomain,
          usedModel: this.OPENROUTER_MODEL,
          reasoning: modelResp.reasoning,
          rawModelContent: modelResp.raw,
        };
      } catch (execErr: any) {
        console.error('❌ Eksekusi SQL gagal:', execErr?.message || execErr);
        return {
          success: false,
          error: `Eksekusi SQL gagal: ${execErr?.message || String(execErr)}`,
          sql,
          reasoning: modelResp.reasoning,
          rawModelContent: modelResp.raw,
        };
      }
    } catch (err: any) {
      console.error('❌ Error handleUserQuestion:', err);
      return { success: false, error: err?.message || String(err) };
    } finally {
      try {
        if (prismaRS) await prismaRS.$disconnect();
      } catch (e) {
        console.warn('⚠️ Gagal disconnect prismaRS:', e);
      }
      try {
        await this.prismaRag.$disconnect();
      } catch (e) {
        console.warn('⚠️ Gagal disconnect prismaRag:', e);
      }
    }
  }

  private buildReasoningPrompt(schemaDescription: string, contextTexts: string, question: string) {
    return [
      {
        role: 'system',
        content: `
Kamu adalah AI reasoning assistant ahli SQL PostgreSQL.
TUGAS: Berikan output JSON yang valid dengan 2 field: "reasoning" (ringkas) dan "sql" (query final).
- "reasoning": singkat, menjelaskan asumsi utama dan tabel/kolom yang dipakai (max ~150 kata).
- "sql": hanya query SELECT PostgreSQL yang valid. Jangan mengubah data.
Format jawaban harus berupa JSON, contoh:
{
  "reasoning": "Saya memilih tabel A JOIN B ...",
  "sql": "SELECT ... FROM ...;"
}
Jika kamu menempatkan code fences, wrapper, atau penjelasan lain, model pengambilan akan mencoba parsing; namun usahakan hanya JSON.
        `,
      },
      {
        role: 'user',
        content: `
SCHEMA:
${schemaDescription}

KONTEKS:
${contextTexts}

Pertanyaan user:
"${question}"
        `,
      },
    ];
  }

  /**
   * Call OpenRouter and return ModelResponse
   * We keep rawText to help debugging.
   */
  private async callOpenRouterModel(messages: any[]): Promise<ModelResponse> {
    const payload: any = {
      model: this.OPENROUTER_MODEL,
      messages,
      reasoning: { effort: 'medium' },
      max_tokens: 1500,
      temperature: 0.0,
    };

    const resp = await fetch(this.OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const rawText = await resp.text();

    // try parse OpenRouter envelope to get content
    try {
      const parsed = JSON.parse(rawText);
      const content = parsed?.choices?.[0]?.message?.content;
      if (!content) return { raw: rawText };
      // attempt to parse content as JSON directly
      try {
        const asJson = JSON.parse(content);
        return {
          reasoning: typeof asJson.reasoning === 'string' ? asJson.reasoning : null,
          sql: typeof asJson.sql === 'string' ? asJson.sql : null,
          raw: content,
        };
      } catch {
        // not pure JSON; return raw content for extraction
        return { raw: content };
      }
    } catch {
      // rawText itself is not JSON envelope; return it
      return { raw: rawText };
    }
  }

  /**
   * Try to extract JSON (reasoning+sql) or just SQL from arbitrary model text.
   * Handles:
   * - JSON inside code fences
   * - text starting with "json\n{...}"
   * - plain JSON
   * - fenced sql blocks ```sql ... ```
   * - plain SELECT ... ;
   */
  private extractModelJsonOrSql(text: string): { reasoning?: string | null; sql?: string | null } {
    if (!text) return { reasoning: null, sql: null };

    // 1) remove surrounding whitespace
    let t = text.trim();

    // 2) if it starts with literal "json" + newline, remove that marker
    if (/^json\s*[\r\n]+/i.test(t)) {
      t = t.replace(/^json\s*[\r\n]+/i, '').trim();
    }

    // 3) try extract JSON object inside (code fence or raw)
    // search for {...} block that looks like JSON
    const jsonFenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const jsonRawMatch = t.match(/({[\s\S]*})/m);

    let jsonCandidate: string | null = null;
    if (jsonFenceMatch) jsonCandidate = jsonFenceMatch[1].trim();
    else if (jsonRawMatch) jsonCandidate = jsonRawMatch[1].trim();

    if (jsonCandidate) {
      try {
        const js = JSON.parse(jsonCandidate);
        return {
          reasoning: typeof js.reasoning === 'string' ? js.reasoning : null,
          sql: typeof js.sql === 'string' ? js.sql : null,
        };
      } catch {
        // fallthrough to other attempts
      }
    }

    // 4) try extract fenced SQL block ```sql ... ```
    const sqlFence = t.match(/```sql\s*([\s\S]*?)\s*```/i) || t.match(/```([\s\S]*?)```/i);
    if (sqlFence) {
      const candidate = sqlFence[1].trim();
      // if candidate contains JSON-looking object, try parse that first
      const maybeJson = candidate.match(/({[\s\S]*})/);
      if (maybeJson) {
        try {
          const js = JSON.parse(maybeJson[1]);
          return {
            reasoning: typeof js.reasoning === 'string' ? js.reasoning : null,
            sql: typeof js.sql === 'string' ? js.sql : null,
          };
        } catch {
          // continue and return candidate as sql
        }
      }
      return { reasoning: null, sql: candidate };
    }

    // 5) try simple SELECT ...; match first SELECT..;
    const selectMatch = t.match(/(SELECT[\s\S]*?;)/i);
    if (selectMatch) {
      return { reasoning: null, sql: selectMatch[1].trim() };
    }

    // 6) as last resort, if text contains "sql": "..." pattern, try extracting
    const sqlFieldMatch = t.match(/"sql"\s*:\s*"([\s\S]*?)"/i);
    const reasoningFieldMatch = t.match(/"reasoning"\s*:\s*"([\s\S]*?)"/i);
    const maybeSqlFromField = sqlFieldMatch ? sqlFieldMatch[1].replace(/\\"/g, '"') : null;
    const maybeReasoning = reasoningFieldMatch ? reasoningFieldMatch[1].replace(/\\"/g, '"') : null;
    if (maybeSqlFromField) {
      return { reasoning: maybeReasoning || null, sql: maybeSqlFromField.trim() };
    }

    // nothing found
    return { reasoning: null, sql: null };
  }

  private extractSqlFromText(text: string): string | null {
    const r = this.extractModelJsonOrSql(text);
    return r.sql || null;
  }

  private findDangerousKeywords(sql: string): string[] {
    const dangerous = ['DROP', 'DELETE', 'ALTER', 'UPDATE', 'INSERT', 'TRUNCATE', 'CREATE'];
    const found = new Set<string>();
    const up = sql.toUpperCase();
    for (const kw of dangerous) if (up.includes(kw)) found.add(kw);
    return Array.from(found);
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
