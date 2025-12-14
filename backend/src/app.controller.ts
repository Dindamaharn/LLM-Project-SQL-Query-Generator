import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  // Endpoint testing internal, tidak digunakan pada sistem produksi
  constructor(private readonly db: DatabaseService) {}

  @Get('test-db')
  async getUsers() {
    const result = await this.db.query('SELECT NOW()');
    return result.rows;
  }
}
