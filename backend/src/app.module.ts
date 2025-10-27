import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database/database.service';
import { DatabaseController } from './database/database.controller'; 
import { QueryController } from './query/query.controller';
import { QueryService } from './query/query.service';
import { UserEmbeddingService } from './embedding/user-embed.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController, QueryController, DatabaseController],
  providers: [
    AppService,
    DatabaseService,
    QueryService,
    UserEmbeddingService,
  ],
})
export class AppModule {}
