import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: 'http://localhost:5173', 
    methods: 'GET,POST,PUT,DELETE', 
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Backend berjalan di http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
