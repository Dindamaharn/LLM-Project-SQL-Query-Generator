import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS (tetap dipertahankan)
  app.enableCors({
    origin: 'http://localhost:5173',
    methods: 'GET,POST,PUT,DELETE',
  });

  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('SQL Query Generator API')
    .setDescription(
      'API untuk menghasilkan dan mengeksekusi query SQL dari pertanyaan bahasa natural menggunakan LLM dan semantic embedding'
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Backend berjalan di http://localhost:${port}`);
  console.log(`Swagger tersedia di http://localhost:${port}/api-docs`);
}

bootstrap();
