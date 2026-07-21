import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { AppModule } from './app.module';
async function bootstrap() {
  // ปิด body parser อัตโนมัติของ Nest แล้วตั้งเอง เพื่อเก็บ raw body ไว้ตรวจ
  // X-Hub-Signature-256 ของ GitHub webhook (HMAC ต้องคำนวณจาก raw bytes ก่อน parse เป็น JSON)
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // ไม่เปิด trust proxy: production อยู่หลัง Cloudflare → nginx → backend การ trust แค่ 1 hop
  // ทำให้ req.ip กลายเป็น IP ของ Cloudflare edge ที่เปลี่ยนทุก request → challenge token ที่
  // bind IP จะ mismatch แล้ว login พังทั้งระบบ ปล่อยให้ req.ip = IP ของ nginx (คงที่) เหมือนเดิม
  // challenge IP-binding เป็นแค่ bot speed-bump ผลต่ำ ไม่คุ้มกับการทำ login ผู้ใช้จริงล่ม
  // ต้องเก็บ rawBody ทั้ง json และ urlencoded parser — GitHub webhook ตั้งได้ทั้ง
  // Content-Type: application/json หรือ application/x-www-form-urlencoded (เป็นค่า default
  // ตอนสร้าง webhook จาก GitHub UI เอง) ถ้า capture แค่ json parser ตัวเดียว webhook แบบ
  // form-urlencoded จะ verify signature ไม่ผ่านตลอดเวลา (rawBody หายไปเงียบๆ ไม่ error ให้เห็น)
  const captureRawBody = (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf;
  };
  app.use(express.json({ limit: '25mb', verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, limit: '25mb', verify: captureRawBody }));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const config = new DocumentBuilder()
    .setTitle('Gatekeeper API')
    .setDescription('Security Deploy Gatekeeper')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  const port = process.env.PORT || 8089;
  // บน host ต้อง bind 127.0.0.1 เท่านั้น — กัน tenant container ยิงตรงเข้า backend ผ่าน
  // bridge gateway IP (ตอนอยู่ใน container เปิด 0.0.0.0 ได้เพราะ network แยกวงให้อยู่แล้ว)
  await app.listen(port, process.env.BIND_HOST || '0.0.0.0');
  console.log(`[gatekeeper] listening on http://localhost:${port}`);
  console.log(`[gatekeeper] swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
