import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { QueryService } from './query.service';
import { RunQueryDto } from './dto/run-query.dto';

@ApiTags('Query')
@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('run')
  @ApiBody({ type: RunQueryDto })
  async handleQuery(@Body() body: RunQueryDto) {
    return this.queryService.handleUserQuestion(
      body.question,
      body.dbName,
    );
  }
}
