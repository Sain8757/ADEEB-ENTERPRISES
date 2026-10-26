import type { Metadata, Viewport } from 'next';
import './globals.css';
import SessionProvider from '@/components/SessionProvider';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#000080',
};

export const metadata: Metadata = {
  title: 'ADEEB ENTERPRISES — Buffalo Trading Ledger',
  description: 'Professional buffalo trading and party ledger accounting system for ADEEB ENTERPRISES.',
  icons: { icon: '/logo.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ADEEB ENTERPRISES',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
