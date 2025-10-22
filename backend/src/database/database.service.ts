import { Injectable, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService {
  private pools: Record<string, Pool> = {}; // cache koneksi per database
  private readonly baseConfig = {
    user: 'postgres',
    host: 'localhost',
    password: 'postgres',
    port: 5433,
  };

  /** 🔁 Ambil pool untuk database tertentu */
  getPool(dbName: string): Pool {
    if (!dbName) {
      throw new BadRequestException('Database belum dipilih.');
    }

    // kalau belum ada pool-nya, buat baru
    if (!this.pools[dbName]) {
      this.pools[dbName] = new Pool({
        ...this.baseConfig,
        database: dbName,
      });
      console.log(`📦 Pool baru dibuat untuk database: ${dbName}`);
    }

    return this.pools[dbName];
  }

  /** 🧠 Jalankan query ke DB tertentu */
  async query(sql: string, params: any[] = [], dbName?: string) {
    if (!dbName) {
      throw new BadRequestException('Database belum dipilih.');
    }

    const pool = this.getPool(dbName);
    return pool.query(sql, params);
  }
}