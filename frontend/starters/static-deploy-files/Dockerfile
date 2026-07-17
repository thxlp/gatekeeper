# Dockerfile ตัวอย่างสำหรับเว็บ static — ใช้กับ runtime "Docker" (คุมเองทั้งหมด)
# หมายเหตุ: ปกติใช้ runtime "Static" ได้เลย ไม่ต้องมีไฟล์นี้ ระบบจัดการให้
FROM nginx:alpine

COPY . /usr/share/nginx/html

# ถ้าเป็น SPA (client-side routing) ให้เปิดใช้บรรทัดนี้ พร้อมไฟล์ nginx-spa.conf
# COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
