import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'BuscasML Pro | Inteligência de Mercado Mercado Livre',
  description:
    'Garimpo de produtos, Raio-X de anúncios e calculadora de margem para o Mercado Livre Brasil.',
};

export const viewport: Viewport = {
  themeColor: '#070b14',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#070b14] font-sans text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
