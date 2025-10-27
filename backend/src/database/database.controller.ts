import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('api/databases')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Endpoint untuk ambil semua database RS */
  @Get()
  async getAllDatabases() {
    try {
      const databases = await this.databaseService.listAllDatabases();
      return { success: true, data: databases };
    } catch (err) {
      console.error('❌ Gagal mengambil daftar database:', err);
      return { success: false, error: err.message };
    }
  }
}
