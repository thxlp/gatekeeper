import type { Metadata } from 'next';
import './globals.css';
import AuthProvider from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'Gatekeeper',
  description: 'Security & Plugin Management Gatekeeper',
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
