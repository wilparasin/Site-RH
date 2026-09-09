import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { MESES } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMes(mes: number, ano: number): string {
  return `${MESES[mes - 1]}/${ano}`
}

export function formatHoras(minutos: number): string {
  const sinal = minutos < 0 ? '-' : '+'
  const abs = Math.abs(minutos)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sinal}${h}h${m.toString().padStart(2, '0')}min`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function formatCPF(cpf: string | null | undefined): string {
  if (!cpf) return '—'
  const digits = String(cpf).replace(/\D/g, '')
  if (digits.length !== 11) return String(cpf)
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/** Remove acentos, pontuação e espaços duplicados; devolve em MAIÚSCULAS. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Partículas que não contam como "nome" na hora de montar o usuário. */
export const PARTICULAS_NOME = ['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'D']

/**
 * Usuário de acesso = primeiro nome + segundo nome, juntos e em minúsculas.
 * Partículas (de, da, dos...) são puladas: "MARIA DA CONCEICAO SARDINHA"
 * vira "mariaconceicao". Nomes com uma palavra só devolvem apenas ela.
 */
export function gerarUsuario(nome: string): string {
  const partes = normalizarNome(nome).split(' ').filter(Boolean)
  const significativas = partes.filter(p => !PARTICULAS_NOME.includes(p))
  const escolhidas = significativas.length >= 2 ? significativas.slice(0, 2) : partes.slice(0, 2)
  return escolhidas.join('').toLowerCase()
}

/** Gera um usuário livre, tentando o nome seguinte antes de recorrer a número. */
export function gerarUsuarioUnico(nome: string, emUso: Set<string>): string {
  const base = gerarUsuario(nome)
  if (base && !emUso.has(base)) return base

  const partes = normalizarNome(nome).split(' ').filter(p => p && !PARTICULAS_NOME.includes(p))
  for (let i = 2; i < partes.length; i++) {
    const alt = (partes[0] + partes[i]).toLowerCase()
    if (!emUso.has(alt)) return alt
  }
  let n = 2
  while (emUso.has(`${base}${n}`)) n++
  return `${base}${n}`
}

export function parseExcelHours(value: unknown): number {
  if (typeof value === 'number') return Math.round(value * 60)
  if (typeof value === 'string') {
    const match = value.match(/^(-?)(\d+):(\d+)$/)
    if (match) {
      const sign = match[1] === '-' ? -1 : 1
      return sign * (parseInt(match[2]) * 60 + parseInt(match[3]))
    }
    const num = parseFloat(value.replace(',', '.'))
    if (!isNaN(num)) return Math.round(num * 60)
  }
  return 0
}
