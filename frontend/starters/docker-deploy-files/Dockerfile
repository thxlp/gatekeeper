# Dockerfile template — แก้ตามภาษา/เฟรมเวิร์กของโปรเจคคุณ แล้ว deploy ด้วย runtime "Docker"
#
# หลักการที่ระบบ deploy คาดหวัง:
#   1. มี EXPOSE <port> เพื่อให้ระบบรู้ port อัตโนมัติ (ไม่ใส่ = ต้องกรอก port เองตอน deploy)
#   2. แอปฟัง port จาก env PORT ถ้าเป็นไปได้ และ bind ที่ 0.0.0.0 เสมอ
#   3. มี route ที่ตอบ HTTP 200 เร็วๆ (เช่น /health) เพื่อให้ healthcheck ผ่าน

# --- เลือก base image ตามภาษา เช่น ---
# FROM node:20-alpine
# FROM python:3.12-slim
# FROM golang:1.22-alpine AS build   (แล้วค่อย multi-stage ไป FROM alpine)
FROM node:20-alpine

WORKDIR /app

# copy ไฟล์ dependency ก่อนเพื่อใช้ Docker layer cache
# COPY package*.json ./
# RUN npm ci --omit=dev
# COPY requirements.txt ./
# RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
EXPOSE 8080

# แก้เป็นคำสั่ง start ของโปรเจคคุณ
CMD ["node", "server.js"]
