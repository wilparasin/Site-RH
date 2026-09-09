/**
 * Leitura e divisão de PDFs de contra cheque emitidos pelo sistema Domínio.
 *
 * O arquivo que a contabilidade envia é um PDF único com todos os recibos:
 * cada página contém o recibo de UM funcionário (impresso em duas vias) e,
 * ao final do arquivo, podem existir páginas de "Comunicado" endereçadas a
 * funcionários específicos.
 *
 * Layout de cada recibo (posições estáveis no PDF gerado pelo Domínio):
 *
 *   RAZAO SOCIAL LTDA
 *   CNPJ: 00.000.000/0001-00      CC: DEPARTAMENTO            Folha Mensal
 *                                     Mensalista              Julho de 2026
 *   Código | Nome do Funcionário | CBO | Departamento | Filial   <- rótulos
 *      8   | ALEX PEREIRA NUNES  |782305|      2      |   1      <- valores
 *          | MOTORISTA                    Admissão: 28/08/2021
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { PDFDocument } from 'pdf-lib'
import { gerarUsuario, gerarUsuarioUnico, normalizarNome } from './utils'

export { gerarUsuario, gerarUsuarioUnico, normalizarNome }

export const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export type TipoPagina = 'recibo' | 'comunicado' | 'desconhecido'

export interface PaginaPdf {
  pagina: number
  tipo: TipoPagina
  nome: string | null
  codigo: string | null
  cargo: string | null
  departamento: string | null
  filial: string | null
  cnpj: string | null
  empresa: string | null
  admissao: string | null
  cpf: string | null
  mes: number | null
  ano: number | null
}

export interface GrupoContraCheque {
  /** Identificador estável do grupo dentro do lote (cnpj + código + nome). */
  chave: string
  nome: string
  codigo: string | null
  cargo: string | null
  departamento: string | null
  filial: string | null
  empresa: string | null
  cnpj: string | null
  /** Páginas (1-based) que compõem o contra cheque deste funcionário. */
  paginas: number[]
  mes: number | null
  ano: number | null
  usuarioSugerido: string
}

export interface AnalisePdf {
  totalPaginas: number
  grupos: GrupoContraCheque[]
  /** Páginas que não puderam ser atribuídas a nenhum funcionário. */
  paginasIgnoradas: number[]
  mes: number | null
  ano: number | null
}

interface ItemTexto {
  s: string
  x: number
  y: number
}

// ─────────────────────────────────────────────────────────────
// Leitura do PDF
// ─────────────────────────────────────────────────────────────

async function lerItensPorPagina(data: Uint8Array): Promise<ItemTexto[][]> {
  const tarefa = getDocument({
    // O pdf.js assume a posse do buffer e o esvazia; a cópia preserva o
    // original para quem ainda precisa dele (guardar o lote, dividir o PDF).
    data: data.slice(),
    useSystemFonts: false,
    // Silencia avisos de fonte em ambiente Node
    verbosity: 0,
  })
  const doc = await tarefa.promise

  const paginas: ItemTexto[][] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const conteudo = await page.getTextContent()
    const itens: ItemTexto[] = []
    for (const item of conteudo.items) {
      if (!('str' in item)) continue
      const texto = item.str
      if (!texto || !texto.trim()) continue
      itens.push({ s: texto, x: item.transform[4], y: item.transform[5] })
    }
    paginas.push(itens)
    page.cleanup()
  }
  await tarefa.destroy()
  return paginas
}

/** Junta os itens de uma faixa horizontal/vertical, na ordem da esquerda para a direita. */
function textoNaFaixa(itens: ItemTexto[], x0: number, x1: number, y: number, tolY = 3): string {
  return itens
    .filter(i => Math.abs(i.y - y) <= tolY && i.x >= x0 && i.x < x1)
    .sort((a, b) => a.x - b.x)
    .map(i => i.s)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function acharItem(itens: ItemTexto[], texto: string): ItemTexto | undefined {
  return itens.find(i => i.s.trim() === texto)
}

function extrairCompetencia(itens: ItemTexto[]): { mes: number | null; ano: number | null } {
  for (const item of itens) {
    const m = item.s
      .trim()
      .toLowerCase()
      .match(/^([a-zç]+)\s+de\s+(\d{4})$/)
    if (!m) continue
    const idx = MESES_EXTENSO.indexOf(m[1])
    if (idx >= 0) return { mes: idx + 1, ano: Number(m[2]) }
  }
  return { mes: null, ano: null }
}

function extrairRecibo(itens: ItemTexto[], pagina: number): PaginaPdf | null {
  const rotuloNome = acharItem(itens, 'Nome do Funcionário')
  if (!rotuloNome) return null

  const rotuloCodigo = acharItem(itens, 'Código')
  const rotuloCbo = acharItem(itens, 'CBO')
  const rotuloDepto = acharItem(itens, 'Departamento')
  const rotuloFilial = acharItem(itens, 'Filial')

  const yRotulos = rotuloNome.y
  const yValores = yRotulos - 10.5 // linha imediatamente abaixo dos rótulos
  const yCargo = yRotulos - 21 // linha do cargo / admissão

  const xNome = rotuloNome.x - 4
  // O valor do CBO é alinhado à direita e começa antes do próprio rótulo,
  // por isso a margem maior — senão o número entraria no nome.
  const xCbo = (rotuloCbo?.x ?? xNome + 320) - 20
  const xDepto = (rotuloDepto?.x ?? xCbo + 50) - 6
  const xFilial = (rotuloFilial?.x ?? xDepto + 50) - 6

  // Nome nunca termina em número: o que sobrar de código/CBO é descartado
  const nome = textoNaFaixa(itens, xNome, xCbo, yValores).replace(/[\s\d]+$/, '')
  if (!nome) return null

  const codigo = rotuloCodigo
    ? textoNaFaixa(itens, rotuloCodigo.x - 8, xNome, yValores)
    : ''
  const departamento = textoNaFaixa(itens, xDepto, xFilial, yValores)
  const filial = textoNaFaixa(itens, xFilial, xFilial + 60, yValores)

  const linhaCargo = textoNaFaixa(itens, xNome, xNome + 300, yCargo)
  const linhaAdmissao = textoNaFaixa(itens, xNome + 300, xNome + 600, yCargo)
  const admissao = linhaAdmissao.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null

  // Empresa e CNPJ ficam no topo do bloco (mesma via do recibo)
  const itemCnpj = itens
    .filter(i => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(i.s.trim()) && i.y > yRotulos)
    .sort((a, b) => a.y - b.y)[0]
  const cnpj = itemCnpj?.s.trim() ?? null
  const empresa = itemCnpj ? textoNaFaixa(itens, 0, 250, itemCnpj.y + 11) || null : null
  // O nome do centro de custo aparece à direita do "CC:" na mesma linha do CNPJ
  const centroCusto = itemCnpj ? textoNaFaixa(itens, 270, 440, itemCnpj.y) || null : null

  const { mes, ano } = extrairCompetencia(itens)

  return {
    pagina,
    tipo: 'recibo',
    nome,
    codigo: codigo || null,
    cargo: linhaCargo || null,
    departamento: centroCusto || departamento || null,
    filial: filial || null,
    cnpj,
    empresa,
    admissao,
    cpf: null,
    mes,
    ano,
  }
}

function extrairComunicado(itens: ItemTexto[], pagina: number): PaginaPdf | null {
  // O destinatário está numa linha própria: "Prezado(a) FULANO DE TAL"
  const saudacao = itens.find(i => i.s.trim().startsWith('Prezado(a)'))
  if (!saudacao) return null

  const nome = textoNaFaixa(itens, saudacao.x, saudacao.x + 500, saudacao.y)
    .replace(/^Prezado\(a\)\s*/, '')
    .trim()
  if (!nome) return null

  const texto = itens
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map(i => i.s)
    .join(' ')
    .replace(/\s+/g, ' ')

  const cpf = texto.match(/CPF:\s*([\d.\-]{11,14})/)?.[1] ?? null
  const cnpj = texto.match(/CNPJ:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/)?.[1] ?? null
  const competencia = texto.match(/compet[êe]ncia\s+(\d{2})\/(\d{4})/i)

  return {
    pagina,
    tipo: 'comunicado',
    nome: nome.replace(/\s+/g, ' ').trim(),
    codigo: null,
    cargo: null,
    departamento: null,
    filial: null,
    cnpj,
    empresa: null,
    admissao: null,
    cpf: cpf ? cpf.replace(/\D/g, '') : null,
    mes: competencia ? Number(competencia[1]) : null,
    ano: competencia ? Number(competencia[2]) : null,
  }
}

/** Lê todas as páginas do PDF e identifica o que há em cada uma. */
export async function lerPaginas(data: Uint8Array): Promise<PaginaPdf[]> {
  const porPagina = await lerItensPorPagina(data)
  return porPagina.map((itens, idx) => {
    const numero = idx + 1
    return (
      extrairRecibo(itens, numero) ??
      extrairComunicado(itens, numero) ?? {
        pagina: numero,
        tipo: 'desconhecido' as const,
        nome: null,
        codigo: null,
        cargo: null,
        departamento: null,
        filial: null,
        cnpj: null,
        empresa: null,
        admissao: null,
        cpf: null,
        mes: null,
        ano: null,
      }
    )
  })
}

/** Agrupa as páginas por funcionário e anexa os comunicados a quem pertencem. */
export function agruparPorFuncionario(paginas: PaginaPdf[]): AnalisePdf {
  const grupos = new Map<string, GrupoContraCheque>()
  const porNome = new Map<string, GrupoContraCheque>()
  const ignoradas: number[] = []
  const usuariosNoLote = new Set<string>()

  for (const p of paginas) {
    if (p.tipo !== 'recibo' || !p.nome) continue
    const nomeNorm = normalizarNome(p.nome)
    const chave = `${p.cnpj ?? '-'}|${p.codigo ?? '-'}|${nomeNorm}`

    const existente = grupos.get(chave)
    if (existente) {
      existente.paginas.push(p.pagina)
      continue
    }

    const grupo: GrupoContraCheque = {
      chave,
      nome: p.nome,
      codigo: p.codigo,
      cargo: p.cargo,
      departamento: p.departamento,
      filial: p.filial,
      empresa: p.empresa,
      cnpj: p.cnpj,
      paginas: [p.pagina],
      mes: p.mes,
      ano: p.ano,
      usuarioSugerido: gerarUsuarioUnico(p.nome, usuariosNoLote),
    }
    usuariosNoLote.add(grupo.usuarioSugerido)
    grupos.set(chave, grupo)
    porNome.set(nomeNorm, grupo)
  }

  // Comunicados entram no PDF do funcionário a quem são endereçados
  for (const p of paginas) {
    if (p.tipo === 'recibo') continue
    const alvo = p.nome ? porNome.get(normalizarNome(p.nome)) : undefined
    if (alvo) alvo.paginas.push(p.pagina)
    else ignoradas.push(p.pagina)
  }

  const lista = [...grupos.values()]
  for (const g of lista) g.paginas.sort((a, b) => a - b)
  lista.sort((a, b) => a.paginas[0] - b.paginas[0])

  // Competência predominante do lote
  const contagem = new Map<string, number>()
  for (const p of paginas) {
    if (p.mes && p.ano) {
      const k = `${p.mes}/${p.ano}`
      contagem.set(k, (contagem.get(k) ?? 0) + 1)
    }
  }
  const maisComum = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const [mes, ano] = maisComum ? maisComum.split('/').map(Number) : [null, null]

  return { totalPaginas: paginas.length, grupos: lista, paginasIgnoradas: ignoradas, mes, ano }
}

/** Lê e agrupa em uma única chamada. */
export async function analisarPdf(data: Uint8Array): Promise<AnalisePdf> {
  return agruparPorFuncionario(await lerPaginas(data))
}

// ─────────────────────────────────────────────────────────────
// Divisão do PDF
// ─────────────────────────────────────────────────────────────

/** Extrai as páginas indicadas (1-based) para um novo PDF. */
export async function extrairPaginasPdf(
  origem: PDFDocument,
  paginas: number[]
): Promise<Uint8Array> {
  const destino = await PDFDocument.create()
  const copiadas = await destino.copyPages(origem, paginas.map(p => p - 1))
  for (const pg of copiadas) destino.addPage(pg)
  return destino.save()
}

export async function carregarPdf(data: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(data, { ignoreEncryption: true })
}
