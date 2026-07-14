import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wekelea — Programmable Escrow for Agreements',
  description: 'Wekelea securely holds funds in escrow and releases them only when agreed conditions are met. Conditional payments for freelance work, personal goals, business deals and more — funded by M-Pesa.',
  keywords: 'escrow, peer-to-peer, agreements, conditional payments, M-Pesa, Kenya, freelance, milestones, secure payments',
  authors: [{ name: 'Wekelea Team' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* PWA Tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <div className="w-full min-h-screen flex flex-col relative overflow-x-hidden">
          {/* Subtle decorative mesh background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none -z-10" />
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-glow rounded-full blur-[120px] pointer-events-none -z-10" />
          <div className="absolute bottom-10 left-1/4 w-96 h-96 bg-accent-glow rounded-full blur-[120px] pointer-events-none -z-10" />
          
          <main className="flex-1 flex flex-col w-full max-w-md mx-auto relative px-4 pb-24 md:pb-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
