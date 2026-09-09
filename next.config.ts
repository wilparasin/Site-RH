import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Bibliotecas de PDF rodam apenas no servidor, fora do bundle do Next
  serverExternalPackages: ['pdfjs-dist', 'pdf-lib'],

  // O pdf.js carrega o worker por importação dinâmica, que o rastreador de
  // arquivos não enxerga — sem isto, o arquivo fica de fora do deploy e a
  // leitura do PDF falha com "Setting up fake worker failed".
  outputFileTracingIncludes: {
    '/api/admin/contra-cheques/**': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    '/api/admin/contra-cheques/analisar': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    '/api/admin/contra-cheques/processar': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
}

export default nextConfig
