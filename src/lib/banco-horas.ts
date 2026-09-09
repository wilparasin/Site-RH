import { utils as xlsxUtils, type CellObject, type WorkSheet } from 'xlsx'
import { normalizarNome, PARTICULAS_NOME } from './utils'
import { MESES } from './types'

/**
 * Leitura das planilhas de banco de horas ("SOLUÇÃO H.E.").
 *
 * O layout é sempre o mesmo:
 *
 *   JULHO 2026
 *   FUNCIONÁRIO | ACUMULADO | JULHO | TOTAL | MOTIVO ATUAL
 *   ALBERTO     |     0:00  | -0:22 | -0:22 |
 *
 * ACUMULADO é o saldo que vinha dos meses anteriores, a coluna do meio é o
 * saldo do próprio mês e TOTAL é a soma dos dois. O funcionário é
 * identificado só pelo nome — normalmente o primeiro, com o segundo entrando
 * quando existe mais de uma pessoa com o mesmo primeiro nome.
 */

const MESES_NORMALIZADOS = MESES.map(m => normalizarNome(m))

const CABECALHO_NOME = ['FUNCIONARIO', 'FUNCIONARIA', 'NOME', 'COLABORADOR', 'EMPREGADO']
const CABECALHO_ACUMULADO = ['ACUMULADO', 'SALDO ACUMULADO', 'SALDO ANTERIOR', 'ANTERIOR']
const CABECALHO_TOTAL = ['TOTAL', 'SALDO TOTAL', 'SALDO ATUAL', 'SALDO FINAL', 'SALDO']
const CABECALHO_MES = ['MES', 'SALDO DO MES', 'SALDO MES', 'HORAS', 'HORA EXTRA', 'HE', 'H E']
const CABECALHO_OBSERVACAO = [
  'MOTIVO', 'MOTIVO ATUAL', 'O QUE SERA FEITO', 'OBSERVACAO', 'OBSERVACOES', 'OBS', 'SITUACAO',
]

/** Linhas que aparecem no meio da planilha mas não são gente. */
const NAO_E_FUNCIONARIO = ['TOTAL', 'TOTAIS', 'GERAL', 'SOMA']

/** Colunas depois disso são sobra de formatação, não dados. */
const MAX_COLUNAS = 40

export interface LinhaPlanilha {
  /** Número da linha na planilha (1 = primeira), usado como chave estável. */
  linha: number
  /** Nome como veio escrito na planilha. */
  nome: string
  acumuladoMinutos: number | null
  mesMinutos: number | null
  totalMinutos: number
  observacao: string | null
}

export interface PlanilhaBancoHoras {
  /** "Julho/2026" — nulo quando não dá para descobrir pela planilha. */
  periodo: string | null
  mes: number | null
  ano: number | null
  /** Cabeçalho da coluna do mês, como veio na planilha ("JULHO"). */
  rotuloMes: string | null
  linhas: LinhaPlanilha[]
}

/** Texto de uma célula, já sem espaços sobrando. */
function texto(cell?: CellObject): string {
  if (!cell || cell.v === undefined || cell.v === null) return ''
  return String(cell.v).trim()
}

/**
 * Converte a célula em minutos.
 *
 * Células com formato de hora (`h:mm`, `[h]:mm`...) guardam a duração como
 * fração de um dia — 0.2569 é 6h10 — e é assim que as planilhas do RH vêm.
 * Saldos negativos aparecem como número negativo. Sem formato de hora, o
 * número é lido como horas decimais (2.5 = 2h30), que é o formato das
 * planilhas antigas.
 */
export function minutosDaCelula(cell?: CellObject): number | null {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === '') return null

  if (typeof cell.v === 'number') {
    const formatoHora = typeof cell.z === 'string' && /h|:/i.test(cell.z)
    return Math.round(cell.v * (formatoHora ? 24 * 60 : 60))
  }

  if (cell.v instanceof Date) {
    // Só acontece se a planilha for lida com cellDates; a referência do Excel
    // é 30/12/1899 e valores negativos caem antes dela.
    const epoch = Date.UTC(1899, 11, 30)
    const utc = Date.UTC(
      cell.v.getFullYear(), cell.v.getMonth(), cell.v.getDate(),
      cell.v.getHours(), cell.v.getMinutes(), cell.v.getSeconds()
    )
    return Math.round((utc - epoch) / 60000)
  }

  if (typeof cell.v === 'string') return minutosDoTexto(cell.v)
  return null
}

/** Lê "2:30", "-1:15", "2,5" ou "150" (minutos não, horas decimais). */
export function minutosDoTexto(valor: string): number | null {
  const t = valor.trim()
  if (!t) return null

  const hm = t.match(/^([+-]?)\s*(\d+):([0-5]?\d)(?::[0-5]?\d)?$/)
  if (hm) {
    const sinal = hm[1] === '-' ? -1 : 1
    return sinal * (parseInt(hm[2], 10) * 60 + parseInt(hm[3], 10))
  }

  const numero = Number(t.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isNaN(numero)) return Math.round(numero * 60)
  return null
}

function combina(cabecalho: string, opcoes: string[]): boolean {
  return opcoes.includes(cabecalho)
}

/** Mês pelo nome: "JULHO" → 7. */
function mesPeloNome(valor: string): number | null {
  const i = MESES_NORMALIZADOS.indexOf(normalizarNome(valor))
  return i >= 0 ? i + 1 : null
}

/** Procura "JULHO 2026", "JULHO/2026" ou "07/2026" em um texto solto. */
export function interpretarPeriodo(valor: string): { mes: number; ano: number } | null {
  const normalizado = normalizarNome(valor)
  for (let i = 0; i < MESES_NORMALIZADOS.length; i++) {
    if (!normalizado.includes(MESES_NORMALIZADOS[i])) continue
    const ano = valor.match(/(20\d{2})/)
    if (ano) return { mes: i + 1, ano: parseInt(ano[1], 10) }
    // "JULHO 26" — dois dígitos no fim
    const curto = valor.match(/\b(\d{2})\b\s*$/)
    if (curto) return { mes: i + 1, ano: 2000 + parseInt(curto[1], 10) }
    return { mes: i + 1, ano: new Date().getFullYear() }
  }
  const numerico = valor.match(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/)
  if (numerico) return { mes: parseInt(numerico[1], 10), ano: parseInt(numerico[2], 10) }
  return null
}

export function formatarPeriodo(mes: number, ano: number): string {
  return `${MESES[mes - 1]}/${ano}`
}

/**
 * Histórico do mais recente para o mais antigo. A ordem sai do mês/ano do
 * período — assim importar Junho depois de Julho não faz Junho virar o saldo
 * atual — e a data de importação desempata os registros antigos, que foram
 * gravados sem mês/ano.
 */
export function ordenarBancoHoras<T extends { mes?: number | null; ano?: number | null; created_at: string }>(
  registros: T[]
): T[] {
  return [...registros].sort((a, b) => {
    const temA = a.ano != null && a.mes != null
    const temB = b.ano != null && b.mes != null
    if (temA && temB) {
      return b.ano! - a.ano! || b.mes! - a.mes! || b.created_at.localeCompare(a.created_at)
    }
    // Registro sem mês/ano fica depois de quem tem.
    if (temA !== temB) return temA ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
}

interface Cabecalho {
  linha: number
  colunaNome: number
  colunaAcumulado: number | null
  colunaMes: number | null
  colunaTotal: number | null
  colunaObservacao: number | null
  rotuloMes: string | null
}

/**
 * Acha a linha de cabeçalho e o que cada coluna significa. A planilha começa
 * com uma linha de título ("JULHO 2026"), então o cabeçalho não é a primeira
 * linha — ele é encontrado pelo texto "FUNCIONÁRIO"/"NOME".
 */
function acharCabecalho(
  celula: (linha: number, coluna: number) => CellObject | undefined,
  primeiraLinha: number,
  ultimaLinha: number,
  ultimaColuna: number
): Cabecalho | null {
  for (let l = primeiraLinha; l <= Math.min(ultimaLinha, primeiraLinha + 15); l++) {
    const titulos: { coluna: number; titulo: string }[] = []
    for (let c = 0; c <= ultimaColuna; c++) {
      const t = texto(celula(l, c))
      if (t) titulos.push({ coluna: c, titulo: normalizarNome(t) })
    }

    const nome = titulos.find(t => combina(t.titulo, CABECALHO_NOME))
    if (!nome) continue

    const acumulado = titulos.find(t => combina(t.titulo, CABECALHO_ACUMULADO))
    const total = titulos.find(t => combina(t.titulo, CABECALHO_TOTAL))
    const mes =
      titulos.find(t => mesPeloNome(t.titulo) !== null) ??
      titulos.find(t => combina(t.titulo, CABECALHO_MES)) ??
      // Sem nome reconhecível, o saldo do mês é a coluna entre as outras duas
      (acumulado && total
        ? titulos.find(t => t.coluna > acumulado.coluna && t.coluna < total.coluna)
        : undefined)
    const observacao = titulos.find(t => combina(t.titulo, CABECALHO_OBSERVACAO))

    if (!acumulado && !total && !mes) continue

    return {
      linha: l,
      colunaNome: nome.coluna,
      colunaAcumulado: acumulado?.coluna ?? null,
      colunaMes: mes?.coluna ?? null,
      colunaTotal: total?.coluna ?? null,
      colunaObservacao: observacao?.coluna ?? null,
      rotuloMes: mes ? texto(celula(l, mes.coluna)) : null,
    }
  }
  return null
}

/**
 * Lê a planilha inteira: período, saldos e nomes.
 * A aba precisa ser lida com `cellNF: true` para que o formato das células
 * (hora × número) chegue aqui.
 */
export function lerPlanilhaBancoHoras(ws: WorkSheet, nomeArquivo = ''): PlanilhaBancoHoras {
  const vazia: PlanilhaBancoHoras = { periodo: null, mes: null, ano: null, rotuloMes: null, linhas: [] }
  if (!ws['!ref']) return vazia

  const range = xlsxUtils.decode_range(ws['!ref'])
  const ultimaColuna = Math.min(range.e.c, MAX_COLUNAS)
  const celula = (linha: number, coluna: number) =>
    ws[xlsxUtils.encode_cell({ r: linha, c: coluna })] as CellObject | undefined

  const cabecalho = acharCabecalho(celula, range.s.r, range.e.r, ultimaColuna)
  if (!cabecalho) return vazia

  // Período: título acima do cabeçalho ("JULHO 2026"), senão o nome da coluna
  // do mês combinado com o ano do título/arquivo, senão o nome do arquivo.
  let periodo: { mes: number; ano: number } | null = null
  for (let l = range.s.r; l < cabecalho.linha && !periodo; l++) {
    for (let c = 0; c <= ultimaColuna && !periodo; c++) {
      const t = texto(celula(l, c))
      if (t) periodo = interpretarPeriodo(t)
    }
  }
  if (!periodo && cabecalho.rotuloMes) {
    const mes = mesPeloNome(cabecalho.rotuloMes)
    const anoArquivo = nomeArquivo.match(/(20\d{2})/)
    if (mes) periodo = { mes, ano: anoArquivo ? parseInt(anoArquivo[1], 10) : new Date().getFullYear() }
  }
  if (!periodo && nomeArquivo) periodo = interpretarPeriodo(nomeArquivo)

  const linhas: LinhaPlanilha[] = []
  for (let l = cabecalho.linha + 1; l <= range.e.r; l++) {
    const nome = texto(celula(l, cabecalho.colunaNome))
    if (!nome || NAO_E_FUNCIONARIO.includes(normalizarNome(nome))) continue

    const acumuladoMinutos =
      cabecalho.colunaAcumulado !== null ? minutosDaCelula(celula(l, cabecalho.colunaAcumulado)) : null
    const mesMinutos =
      cabecalho.colunaMes !== null ? minutosDaCelula(celula(l, cabecalho.colunaMes)) : null
    const totalCelula =
      cabecalho.colunaTotal !== null ? minutosDaCelula(celula(l, cabecalho.colunaTotal)) : null

    if (acumuladoMinutos === null && mesMinutos === null && totalCelula === null) continue

    const observacao =
      cabecalho.colunaObservacao !== null ? texto(celula(l, cabecalho.colunaObservacao)) : ''

    linhas.push({
      linha: l + 1,
      nome,
      acumuladoMinutos,
      mesMinutos,
      // Quando a planilha não traz TOTAL, ele é o acumulado mais o mês.
      totalMinutos: totalCelula ?? (acumuladoMinutos ?? 0) + (mesMinutos ?? 0),
      observacao: observacao || null,
    })
  }

  return {
    periodo: periodo ? formatarPeriodo(periodo.mes, periodo.ano) : null,
    mes: periodo?.mes ?? null,
    ano: periodo?.ano ?? null,
    rotuloMes: cabecalho.rotuloMes,
    linhas,
  }
}

// ────────────────────────────────────────────────────────────────
// Casamento pelo nome
// ────────────────────────────────────────────────────────────────

export interface FuncionarioResumo {
  id: string
  nome: string
  usuario?: string | null
}

export type StatusCorrespondencia = 'ok' | 'ambiguo' | 'duplicado' | 'nao_encontrado'

export interface Correspondencia extends LinhaPlanilha {
  funcionario: FuncionarioResumo | null
  /** Quem poderia ser, quando a planilha não deixa claro. */
  candidatos: FuncionarioResumo[]
  status: StatusCorrespondencia
}

const EXATO = 4
const POR_USUARIO = 3
const PREFIXO = 2
const PARCIAL = 1

/** Nome em palavras, sem acento e sem "de/da/dos". */
function palavras(nome: string): string[] {
  return normalizarNome(nome)
    .split(' ')
    .filter(p => p && !PARTICULAS_NOME.includes(p))
}

function comecaCom(nome: string[], busca: string[]): boolean {
  return busca.length > 0 && busca.length <= nome.length && busca.every((p, i) => nome[i] === p)
}

/** "RAFAELA BOTTARO" cabe em "RAFAELA SOFIA BOTTARO DE SOUZA". */
function contemNaOrdem(nome: string[], busca: string[]): boolean {
  if (busca.length === 0) return false
  let i = 0
  for (const p of nome) if (p === busca[i]) i++
  return i === busca.length
}

interface FuncionarioPreparado {
  funcionario: FuncionarioResumo
  nomeNormalizado: string
  palavras: string[]
}

function pontuar(
  buscaNormalizada: string,
  buscaPalavras: string[],
  candidato: FuncionarioPreparado
): number {
  if (buscaPalavras.length === 0) return 0
  if (buscaNormalizada === candidato.nomeNormalizado) return EXATO
  if (candidato.funcionario.usuario && buscaPalavras.join('').toLowerCase() === candidato.funcionario.usuario) {
    return POR_USUARIO
  }
  if (comecaCom(candidato.palavras, buscaPalavras)) return PREFIXO
  if (contemNaOrdem(candidato.palavras, buscaPalavras)) return PARCIAL
  return 0
}

/**
 * Liga cada linha da planilha a um funcionário usando só o nome.
 *
 * A planilha traz o primeiro nome ("ALBERTO"), às vezes com o sobrenome que
 * desempata ("RAFAELA BOTTARO"). As linhas mais específicas são resolvidas
 * primeiro e a pessoa escolhida sai da disputa: assim "RAFAELA BOTTARO" fica
 * com Rafaela Sofia Bottaro e "RAFAELA", sozinha, sobra para Rafaela Soares.
 * O que continuar em dúvida volta como `ambiguo`/`nao_encontrado` para o
 * admin decidir — nunca é chutado.
 */
export function casarPorNome(
  linhas: LinhaPlanilha[],
  funcionarios: FuncionarioResumo[]
): Correspondencia[] {
  const preparados: FuncionarioPreparado[] = funcionarios.map(f => ({
    funcionario: f,
    nomeNormalizado: normalizarNome(f.nome),
    palavras: palavras(f.nome),
  }))

  const analise = linhas.map(linha => {
    const buscaNormalizada = normalizarNome(linha.nome)
    const buscaPalavras = palavras(linha.nome)

    let melhor = 0
    const candidatos: FuncionarioResumo[] = []
    for (const p of preparados) {
      const pontos = pontuar(buscaNormalizada, buscaPalavras, p)
      if (pontos === 0) continue
      if (pontos > melhor) {
        melhor = pontos
        candidatos.length = 0
      }
      if (pontos === melhor) candidatos.push(p.funcionario)
    }
    return { linha, candidatos, pontos: melhor, palavras: buscaPalavras.length }
  })

  // Quem tem menos dúvida escolhe primeiro; entre iguais, o nome mais completo.
  const ordem = analise
    .map((a, i) => ({ ...a, indice: i }))
    .sort((a, b) =>
      a.candidatos.length - b.candidatos.length ||
      b.pontos - a.pontos ||
      b.palavras - a.palavras
    )

  const resultado: Correspondencia[] = new Array(linhas.length)
  const usados = new Set<string>()

  for (const item of ordem) {
    const disponiveis = item.candidatos.filter(c => !usados.has(c.id))
    let funcionario: FuncionarioResumo | null = null
    let status: StatusCorrespondencia

    if (disponiveis.length === 1) {
      funcionario = disponiveis[0]
      usados.add(funcionario.id)
      status = 'ok'
    } else if (disponiveis.length > 1) {
      status = 'ambiguo'
    } else {
      // Sem ninguém livre: ou o nome não existe no cadastro, ou a pessoa já
      // foi levada por uma linha mais específica.
      status = item.candidatos.length > 0 ? 'duplicado' : 'nao_encontrado'
    }

    resultado[item.indice] = {
      ...item.linha,
      funcionario,
      candidatos: disponiveis.length > 1 ? disponiveis : [],
      status,
    }
  }

  return resultado
}
