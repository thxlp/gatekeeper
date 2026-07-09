import type { Metadata } from 'next';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/bold';
import '@phosphor-icons/web/fill';
import './globals.css';
import AuthProvider from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'Gatekeeper — Deploy Platform',
  description:
    'Railway-style deploy platform where every deploy runs through a security scan + risk engine before going live.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
