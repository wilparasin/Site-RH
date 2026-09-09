// Mantém a pasta .next fora da sincronização do iCloud.
//
// O projeto vive dentro do iCloud Drive. A cada compilação o Next reescreve
// centenas de megabytes em .next, e o iCloud tenta sincronizar tudo isso sem
// parar — o que deixa o `next dev` inutilizável e chega a travar a máquina.
//
// Pastas terminadas em ".nosync" são ignoradas pelo iCloud. Então a pasta real
// é .next.nosync e .next passa a ser um link para ela.
//
// O node_modules NÃO entra nessa brincadeira de propósito: com ele como link,
// o Next deixa de reconhecer os pacotes listados em serverExternalPackages
// (o pdfjs quebra ao procurar o pdf.worker.mjs em tempo de execução).
//
// Roda sozinho antes de `npm run dev`. Fora do iCloud (outro Mac, Vercel, CI)
// não faz nada.
import { renameSync, rmSync, symlinkSync, mkdirSync, lstatSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Só faz sentido dentro do iCloud Drive
if (!raiz.includes('Mobile Documents')) process.exit(0)

const link = resolve(raiz, '.next')
const real = resolve(raiz, '.next.nosync')

if (existsSync(link) && lstatSync(link).isSymbolicLink()) process.exit(0)

if (existsSync(link)) {
  // Pasta real deixada por um build antigo: vira a .nosync
  if (existsSync(real)) rmSync(real, { recursive: true, force: true })
  renameSync(link, real)
} else if (!existsSync(real)) {
  mkdirSync(real, { recursive: true })
}

symlinkSync('.next.nosync', link)
console.log('✅ .next agora aponta para .next.nosync (fora do iCloud)')
