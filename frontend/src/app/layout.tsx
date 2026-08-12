import type { Metadata, Viewport } from 'next';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/bold';
import '@phosphor-icons/web/fill';
import './globals.css';
import AuthProvider from '@/components/auth/AuthProvider';
import ToastProvider from '@/components/ui/Toast';
import ConfirmProvider from '@/components/ui/ConfirmDialog';

// title ตรงนี้คือค่าตั้งต้นที่ติดมากับ HTML ตอน prerender (เห็นแวบแรกก่อน JS ทำงาน และเป็น
// ค่าที่ search engine/ตัว preview ลิงก์อ่าน) — ชื่อรายหน้าตั้งทีหลังฝั่ง client ผ่าน
// lib/use-document-title.ts เพราะทุกหน้าเป็น client component จึง export metadata เองไม่ได้
export const metadata: Metadata = {
  title: 'Gatekeeper',
  description:
    'Railway-style deploy platform where every deploy runs through a security scan + risk engine before going live.',
  // ไอคอนเดียวเป็น SVG ใช้ได้ทั้ง favicon และไอคอนใน manifest (ดูข้อจำกัดฝั่ง iOS ใน manifest.ts)
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
};

// viewportFit: 'cover' = ให้หน้าเว็บกินพื้นที่ถึงขอบจริงบนเครื่องจอบาก/ขอบมน (ไม่งั้นจะเหลือ
// แถบดำคาดหัวท้าย) แลกกับที่ของ fixed ติดขอบจะไปอยู่ใต้ home indicator — ชดเชยด้วยคลาส
// .gk-safe-bottom / .gk-safe-x ใน globals.css ที่ MobileTabBar, ปุ่มลอย, Toast และ layout
// ค่า width/initialScale เท่ากับ default ของ Next แต่ต้องเขียนเองเพราะพอ export viewport
// แล้ว Next จะไม่ใส่ default ให้อีก (ห้ามใส่ maximumScale/userScalable=no — คนสายตาไม่ดี
// จะซูมอ่านไม่ได้)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // สีแถบ address bar บนมือถือ ให้เป็นสีเดียวกับ --color-surface (พื้นของแถบบน) ทั้งสองธีม
  // ไม่งั้นแถบขาวจะคาดอยู่เหนือแอปตอนใช้ธีมมืด — ค่าต้องตามพาเลตใน globals.css
  // ข้อจำกัดที่ยอมรับ: อิงจาก prefers-color-scheme ของเครื่อง ตามปุ่มสลับธีมในแอปไม่ได้
  // (meta ตัวนี้ถูกอ่านตอนโหลดหน้า ก่อน JS ของ use-theme.ts จะทำงาน)
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#2A2822' },
  ],
};

// Runs before paint so the page never flashes the wrong theme. Keep this in
// sync with the resolve/apply logic in lib/use-theme.ts.
const NO_FLASH_THEME_SCRIPT = `(function(){try{
  var t=localStorage.getItem('gk_theme');
  var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark',dark);
}catch(e){}})();`;

// ตั้ง <html lang> ให้ตรงภาษาที่จะ render จริงตั้งแต่ก่อน paint (screen reader / spellcheck /
// การตัดคำของเบราว์เซอร์ใช้ค่านี้) — ตัวข้อความเองสลับโดย lib/i18n.ts ซึ่งใช้ลำดับการเลือก
// ภาษาเดียวกัน: ค่าที่เคยเลือก → ภาษาเบราว์เซอร์ → th
const NO_FLASH_LANG_SCRIPT = `(function(){try{
  var l=localStorage.getItem('gk_lang');
  if(l!=='th'&&l!=='en'){
    var n=(navigator.languages&&navigator.languages[0])||navigator.language||'';
    l=n.toLowerCase().indexOf('th')===0?'th':'en';
  }
  document.documentElement.lang=l;
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_LANG_SCRIPT }} />
      </head>
      <body>
        {/* Toast + Confirm อยู่ชั้นนอกสุดใต้ AuthProvider — ทุกหน้า (รวมหน้า login) เรียกใช้ได้
            ผ่าน useToast() / useConfirm() โดยไม่ต้อง mount ซ้ำ */}
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
