import type { Metadata } from 'next';
import Link from 'next/link';

import { AutoRefresh } from '@/components/auto-refresh';
import './globals.css';

export const metadata: Metadata = {
  title: 'Andina Cargo · Seguimiento',
  description: 'Una sola pantalla para ver la historia completa de un envio',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="es">
      <body>
        <header className="app">
          <div className="inner">
            <h1>
              <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                Andina Cargo
              </Link>
            </h1>
            <span className="sub">Seguimiento de envios · los tres transportistas en una pantalla</span>
            <span style={{ marginLeft: 'auto' }}>
              <AutoRefresh />
            </span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
