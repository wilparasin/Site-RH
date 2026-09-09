import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Bibliotecas de PDF rodam apenas no servidor, fora do bundle do Next
  serverExternalPackages: ['pdfjs-dist', 'pdf-lib'],
}

export default nextConfig
