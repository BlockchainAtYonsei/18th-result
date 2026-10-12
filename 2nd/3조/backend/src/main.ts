import 'dotenv/config';
import { configureApp } from './common/http';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
  });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
