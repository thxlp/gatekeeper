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
  // ห้าม parse body ของ route ที่เป็น reverse proxy เข้าแอปลูกค้า (/live/<id>, /__domain) —
  // parser อ่าน request stream จนหมดไปแล้ว http-proxy เลยส่งต่อได้แค่ header (มี Content-Length)
  // โดยไม่มี body ตามไป แอปลูกค้ารอ body ที่ไม่มีวันมาจนหมดเวลา = POST แบบ JSON/ฟอร์มของ
  // ทุกแอปใช้ไม่ได้เลย ส่วน body ชนิดอื่น (text, multipart) ผ่านได้เพราะไม่มี parser แตะ (พบ 2026-09-22)
  // regex ไม่สนตัวพิมพ์ — router ของ Express case-insensitive (/Live/<id> ก็ถึง controller เดียวกัน)
  const PROXY_PATH_RE = /^\/(live|__domain)(\/|$)/i;
  const skipOnProxyPaths =
    (parser: express.RequestHandler): express.RequestHandler =>
    (req, res, next) =>
      PROXY_PATH_RE.test(req.path) ? next() : parser(req, res, next);
  app.use(skipOnProxyPaths(express.json({ limit: '25mb', verify: captureRawBody })));
  app.use(skipOnProxyPaths(express.urlencoded({ extended: true, limit: '25mb', verify: captureRawBody })));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Swagger เปิดเฉพาะนอก production — บน prod มันคือแผนที่ attack surface แจกฟรี
  // (53 route + shape ของ body ทุกตัว) ให้คนที่ยังไม่ได้ login
  // ⚠️ อย่าคิดว่าปิดด้วย nginx ได้: location /api/ rewrite /api/(.*) → /$1 แค่ชั้นเดียว
  // ใครยิง /api/api/docs ก็ทะลุมาถึง path 'api/docs' ตัวนี้อยู่ดี (เคยหลุดจริง พบ 2026-09-06)
  // ต้องปิดที่ต้นทางเท่านั้น
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Gatekeeper API')
      .setDescription('Security Deploy Gatekeeper')
      .setVersion('0.2.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }
  const port = process.env.PORT || 8089;
  // บน host ต้อง bind 127.0.0.1 เท่านั้น — กัน tenant container ยิงตรงเข้า backend ผ่าน
  // bridge gateway IP (ตอนอยู่ใน container เปิด 0.0.0.0 ได้เพราะ network แยกวงให้อยู่แล้ว)
  await app.listen(port, process.env.BIND_HOST || '0.0.0.0');
  console.log(`[gatekeeper] listening on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[gatekeeper] swagger docs at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
