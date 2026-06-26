import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Gatekeeper API')
    .setDescription('Security & Plugin Management Gatekeeper')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 8089;
  await app.listen(port);
  console.log(`[gatekeeper] listening on http://localhost:${port}`);
  console.log(`[gatekeeper] swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
