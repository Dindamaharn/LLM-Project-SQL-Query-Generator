import { Injectable } from '@nestjs/common';

@Injectable()
export class UserEmbeddingService {
  private OLLAMA_URL = `${process.env.OLLAMA_URL || 'http://172.20.80.1:11434'}/api/embed`;

  async generateEmbedding(text: string, modelName: string): Promise<{ vector: number[]; model: string }> {
    console.log('🧠 Full embed endpoint:', this.OLLAMA_URL);

    const res = await fetch(this.OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        input: text,
      }),
    });

    const data = await res.json();
    if (!data.embeddings || !data.embeddings[0]) {
      throw new Error('Gagal generate embedding untuk input user');
    }

    return { vector: data.embeddings[0], model: modelName };
  }
}
