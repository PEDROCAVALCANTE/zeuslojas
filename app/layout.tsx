import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ZEUS - Gestão SaaS de Casas de Ração',
  description: 'Sistema multi-tenant para controle de estoque, financeiro e relatórios.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br" className={inter.className}>
      <body suppressHydrationWarning className="bg-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
