import type { NextConfig } from 'next';

const config: NextConfig = {
  // El paquete del contrato vive en el mismo espacio de trabajo y se publica ya
  // compilado, pero declararlo evita sorpresas cuando Next resuelve el enlace
  // simbolico del monorepo.
  transpilePackages: ['@andina/contracts'],

  // La imagen de produccion se construye con la salida minima: solo lo que hace
  // falta para ejecutar, sin el node_modules entero.
  output: 'standalone',
};

export default config;
