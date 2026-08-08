import type { Metadata } from 'next';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/bold';
import '@phosphor-icons/web/fill';
import './globals.css';
import AuthProvider from '@/components/auth/AuthProvider';
import ToastProvider from '@/components/ui/Toast';
import ConfirmProvider from '@/components/ui/ConfirmDialog';

export const metadata: Metadata = {
  title: 'Deploy Platform',
  description:
    'Railway-style deploy platform where every deploy runs through a security scan + risk engine before going live.',
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
