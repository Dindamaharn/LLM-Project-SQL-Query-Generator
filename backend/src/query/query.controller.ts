import { Controller, Post, Body } from '@nestjs/common';
import { QueryService } from './query.service';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('run')
  async handleQuery(
    @Body('question') question: string,
    @Body('dbName') dbName: string,
  ) {
    return this.queryService.handleUserQuestion(question, dbName);
  }
}
