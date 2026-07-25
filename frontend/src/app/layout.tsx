import type { Metadata } from 'next';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/bold';
import '@phosphor-icons/web/fill';
import './globals.css';
import AuthProvider from '@/components/auth/AuthProvider';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
