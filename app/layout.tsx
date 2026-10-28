import React from 'react';

export const metadata = {
  title: 'BuscasML - Inteligência de Mercado Livre',
  description: 'Plataforma de análise de anúncios, concorrência e tendências no Mercado Livre',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-[#0b0f19] text-slate-100 antialiased selection:bg-yellow-400 selection:text-black">
        {children}
      </body>
    </html>
  );
}
