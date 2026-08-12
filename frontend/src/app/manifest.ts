import type { MetadataRoute } from 'next';

// Web app manifest — เสิร์ฟที่ /manifest.webmanifest ให้ Chrome/Android รู้จักแอปตอน
// "เพิ่มลงหน้าจอโฮม" (เปิดแบบ standalone ไม่มีแถบ address bar + ใช้ไอคอนของเราแทนภาพจอ)
//
// ⚠️ iOS ไม่อ่าน icons ในไฟล์นี้ — Safari ใช้ <link rel="apple-touch-icon"> ที่เป็น PNG
// เท่านั้น (ไม่รองรับ SVG) ถ้าจะให้ไอคอนบนจอโฮมของ iPhone สวยด้วย ต้องเพิ่มไฟล์
// public/apple-touch-icon.png (180×180) แล้วประกาศใน metadata.icons.apple ที่ layout.tsx
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gatekeeper',
    short_name: 'Gatekeeper',
    description:
      'Railway-style deploy platform where every deploy runs through a security scan + risk engine before going live.',
    start_url: '/',
    display: 'standalone',
    // ต้องตรงกับ --color-page / --color-surface ใน globals.css (ธีมสว่าง)
    background_color: '#F3F1EA',
    theme_color: '#FBFAF7',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
