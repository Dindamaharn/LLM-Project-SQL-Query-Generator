import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
        user: 'postgres',       
        host: 'localhost',      
        database: 'rsmu_db',    
        password: 'postgres',  
        port: 5433,            
        });
    }

    async query(sql: string, params?: any[]) {
        return this.pool.query(sql, params);
    }
}