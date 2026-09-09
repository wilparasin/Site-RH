'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertCircle, X, FileText, Loader2, UserPlus, Copy } from 'lucide-react'
import { MESES } from '@/lib/types'
import DeleteContraChequeButton from '@/components/DeleteContraChequeButton'
import DownloadButton from '@/components/DownloadButton'
import { formatDateTime, formatCPF } from '@/lib/utils'

interface Funcionario {
  id: string
  nome: string
  cpf: string | null
  usuario: string | null
}

interface ContraCheque {
  id: string
  funcionario_id: string
  mes: number
  ano: number
  created_at: string
  nome_arquivo: string
  storage_path: string
}

interface Props {
  funcionarios: Funcionario[]
  contraCheques: ContraCheque[]
}

/** Um funcionário identificado dentro do PDF da contabilidade. */
interface ItemLote {
  chave: string
  nome: string
  codigo: string | null
  cargo: string | null
  departamento: string | null
  empresa: string | null
  paginas: number[]
  usuarioSugerido: string
  funcionarioId: string | null
  funcionarioNome: string | null
  encontradoPor: 'nome' | null
  /** Mais de um cadastro com o mesmo nome — exige escolha manual. */
  ambiguo?: boolean
  /** O que fazer no envio: id do funcionário, "criar" ou "ignorar". */
  destino: string
  status: 'pendente' | 'ok' | 'erro'
  erro?: string
  usuarioCriado?: string
}

interface Lote {
  lotePath: string
  nomeArquivo: string
  totalPaginas: number
  mes: number | null
  ano: number | null
  paginasIgnoradas: number[]
  itens: ItemLote[]
}

/** Resposta do envio, por funcionário. */
interface ResultadoItem {
  chave: string
  status: 'enviado' | 'erro'
  erro?: string
  usuario?: string
  criado?: boolean
}

/** Arquivo avulso, no formato antigo: o CPF vem no nome do arquivo. */
interface ArquivoAvulso {
  arquivo: File
  cpfExtraido: string
  funcionario: Funcionario | null
  status: 'pending' | 'ok' | 'error'
  erro?: string
}

function extractCPF(filename: string): string {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
  return nameWithoutExt.split('-')[0].replace(/\D/g, '')
}

/** Funcionários por requisição no envio — mantém cada chamada curta. */
const TAMANHO_BLOCO = 15

const anoAtual = new Date().getFullYear()
const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i)

export default function UploadContraCheque({ funcionarios, contraCheques }: Props) {
  const router = useRouter()
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [ano, setAno] = useState(anoAtual)
  const [lotes, setLotes] = useState<Lote[]>([])
  const [avulsos, setAvulsos] = useState<ArquivoAvulso[]>([])
  const [analisando, setAnalisando] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erroGeral, setErroGeral] = useState('')
  const [resultado, setResultado] = useState<{ ok: number; erro: number; criados: { nome: string; usuario: string }[] } | null>(null)
  const [filtroFuncionario, setFiltroFuncionario] = useState('')

  const funcMapByCPF = new Map(
    funcionarios.filter(f => f.cpf).map(f => [String(f.cpf).replace(/\D/g, ''), f])
  )
  const funcMapById = new Map(funcionarios.map(f => [f.id, f]))

  function limpar() {
    setLotes([])
    setAvulsos([])
    setErroGeral('')
    setResultado(null)
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    limpar()

    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    const novosLotes: Lote[] = []
    const novosAvulsos: ArquivoAvulso[] = []

    for (let i = 0; i < pdfs.length; i++) {
      const arquivo = pdfs[i]
      setAnalisando(`Analisando ${i + 1} de ${pdfs.length}: ${arquivo.name}`)

      const formData = new FormData()
      formData.append('arquivo', arquivo)

      try {
        const res = await fetch('/api/admin/contra-cheques/analisar', { method: 'POST', body: formData })
        const data = await res.json()

        if (res.ok && data.itens?.length) {
          novosLotes.push({
            lotePath: data.lotePath,
            nomeArquivo: data.nomeArquivo,
            totalPaginas: data.totalPaginas,
            mes: data.mes,
            ano: data.ano,
            paginasIgnoradas: data.paginasIgnoradas ?? [],
            itens: (data.itens as Omit<ItemLote, 'destino' | 'status'>[]).map(it => ({
              ...it,
              destino: it.funcionarioId ?? (it.ambiguo ? 'ignorar' : 'criar'),
              status: 'pendente' as const,
            })),
          })
        } else {
          // Não é um recibo do sistema da contabilidade: trata como arquivo avulso
          const cpfExtraido = extractCPF(arquivo.name)
          novosAvulsos.push({
            arquivo,
            cpfExtraido,
            funcionario: funcMapByCPF.get(cpfExtraido) ?? null,
            status: 'pending',
          })
        }
      } catch {
        setErroGeral('Falha de comunicação ao analisar os arquivos.')
      }
    }

    setAnalisando('')
    setLotes(novosLotes)
    setAvulsos(novosAvulsos)

    // Usa a competência lida do próprio PDF
    const comCompetencia = novosLotes.find(l => l.mes && l.ano)
    if (comCompetencia?.mes && comCompetencia?.ano) {
      setMes(comCompetencia.mes)
      setAno(comCompetencia.ano)
    }
  }

  function alterarDestino(loteIdx: number, chave: string, destino: string) {
    setLotes(prev =>
      prev.map((l, i) =>
        i !== loteIdx ? l : { ...l, itens: l.itens.map(it => (it.chave === chave ? { ...it, destino } : it)) }
      )
    )
  }

  function removerAvulso(idx: number) {
    setAvulsos(prev => prev.filter((_, i) => i !== idx))
  }

  const totalEnviar =
    lotes.reduce((n, l) => n + l.itens.filter(i => i.destino !== 'ignorar' && i.status === 'pendente').length, 0) +
    avulsos.filter(a => a.funcionario && a.status === 'pending').length
  const totalCriar = lotes.reduce(
    (n, l) => n + l.itens.filter(i => i.destino === 'criar' && i.status === 'pendente').length,
    0
  )

  async function handleEnviar() {
    if (totalEnviar === 0) return
    setEnviando(true)
    setErroGeral('')
    setResultado(null)

    let ok = 0
    let erro = 0
    const criados: { nome: string; usuario: string }[] = []
    const lotesAtualizados = [...lotes]

    // 1) PDFs da contabilidade: dividir e enviar
    for (let i = 0; i < lotesAtualizados.length; i++) {
      const lote = lotesAtualizados[i]
      const itensEnvio = lote.itens
        .filter(it => it.destino !== 'ignorar' && it.status === 'pendente')
        .map(it => ({
          chave: it.chave,
          nome: it.nome,
          paginas: it.paginas,
          funcionarioId: it.destino === 'criar' ? null : it.destino,
          dados: {
            nome: it.nome,
            usuario: it.usuarioSugerido,
            cargo: it.cargo,
            departamento: it.departamento,
            empresa: it.empresa,
            codigoFolha: it.codigo,
          },
        }))

      if (itensEnvio.length === 0) continue

      // Envia em blocos: lotes grandes estouram o tempo limite de função
      const resultados: ResultadoItem[] = []
      let falhou = false

      for (let inicio = 0; inicio < itensEnvio.length; inicio += TAMANHO_BLOCO) {
        const bloco = itensEnvio.slice(inicio, inicio + TAMANHO_BLOCO)
        const ultimo = inicio + TAMANHO_BLOCO >= itensEnvio.length
        setProgresso(`Enviando ${Math.min(inicio + bloco.length, itensEnvio.length)} de ${itensEnvio.length} — ${lote.nomeArquivo}`)

        const res = await fetch('/api/admin/contra-cheques/processar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lotePath: lote.lotePath,
            mes,
            ano,
            itens: bloco,
            finalizar: ultimo,
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          setErroGeral(data.error || 'Erro ao processar o lote.')
          erro += bloco.length
          falhou = true
          break
        }

        resultados.push(...((data.resultados ?? []) as ResultadoItem[]))
      }

      if (falhou && resultados.length === 0) continue

      const porChave = new Map(resultados.map(r => [r.chave, r] as const))

      lotesAtualizados[i] = {
        ...lote,
        itens: lote.itens.map(it => {
          const r = porChave.get(it.chave)
          if (!r) return it
          if (r.status === 'enviado') {
            ok++
            if (r.criado && r.usuario) criados.push({ nome: it.nome, usuario: r.usuario })
            return { ...it, status: 'ok' as const, usuarioCriado: r.criado ? r.usuario : undefined }
          }
          erro++
          return { ...it, status: 'erro' as const, erro: r.erro }
        }),
      }
    }

    setLotes(lotesAtualizados)

    // 2) Arquivos avulsos, no formato antigo
    const avulsosAtualizados = [...avulsos]
    for (let i = 0; i < avulsosAtualizados.length; i++) {
      const item = avulsosAtualizados[i]
      if (!item.funcionario || item.status !== 'pending') continue

      const formData = new FormData()
      formData.append('funcionarioId', item.funcionario.id)
      formData.append('mes', String(mes))
      formData.append('ano', String(ano))
      formData.append('arquivo', item.arquivo)

      const res = await fetch('/api/admin/contra-cheques', { method: 'POST', body: formData })
      if (res.ok) {
        avulsosAtualizados[i] = { ...item, status: 'ok' }
        ok++
      } else {
        const data = await res.json()
        avulsosAtualizados[i] = { ...item, status: 'error', erro: data.error || 'Erro' }
        erro++
      }
    }
    setAvulsos(avulsosAtualizados)

    setResultado({ ok, erro, criados })
    setProgresso('')
    setEnviando(false)
    if (ok > 0) router.refresh()
  }

  function copiarAcessos() {
    if (!resultado?.criados.length) return
    const texto = resultado.criados
      .map(c => `${c.nome}\t${c.usuario}\tsenha: criada no primeiro acesso`)
      .join('\n')
    navigator.clipboard.writeText(texto)
  }

  const docsFiltrados = filtroFuncionario
    ? contraCheques.filter(cc => cc.funcionario_id === filtroFuncionario)
    : contraCheques

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-sm">Adicionar Contra Cheques</h2>
      </div>

      <div className="p-6 space-y-4">
        {/* Mês e Ano */}
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Mês</label>
            <select
              value={mes}
              onChange={e => setMes(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Ano</label>
            <select
              value={ano}
              onChange={e => setAno(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Seleção de arquivos */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Arquivos PDF</label>
          <input
            id="arquivos-input"
            type="file"
            accept=".pdf"
            multiple
            onChange={e => handleFiles(e.target.files)}
            disabled={!!analisando || enviando}
            className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm hover:file:bg-slate-200 transition cursor-pointer border border-slate-300 rounded-lg py-1.5 px-2"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Pode ser o <strong className="font-medium text-slate-500">PDF único da contabilidade</strong> com todos os
            funcionários — o sistema separa as páginas e entrega a cada um. Arquivos individuais também funcionam; se não
            forem recibos do sistema da contabilidade, o CPF deve ser a primeira parte do nome, como{' '}
            <span className="font-mono bg-slate-100 px-1 rounded">08084426605-Maio2026.pdf</span>.
          </p>
        </div>

        {analisando && (
          <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            {analisando}
          </div>
        )}

        {erroGeral && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{erroGeral}</div>
        )}

        {/* Revisão dos lotes */}
        {lotes.map((lote, loteIdx) => {
          const naoCadastrados = lote.itens.filter(i => i.destino === 'criar').length
          return (
            <div key={lote.lotePath} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-800 truncate">{lote.nomeArquivo}</span>
                <span className="text-xs text-slate-500">
                  {lote.itens.length} funcionário(s) · {lote.totalPaginas} páginas
                  {lote.mes && lote.ano ? ` · ${MESES[lote.mes - 1]}/${lote.ano}` : ''}
                </span>
                {naoCadastrados > 0 && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {naoCadastrados} sem cadastro
                  </span>
                )}
              </div>

              {lote.paginasIgnoradas.length > 0 && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                  Páginas sem funcionário identificado (não serão enviadas): {lote.paginasIgnoradas.join(', ')}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white border-b border-slate-100">
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Funcionário no PDF</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Páginas</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lote.itens.map(item => (
                      <tr key={item.chave} className={item.destino === 'ignorar' ? 'opacity-50' : ''}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-start gap-2">
                            {item.status === 'ok' && <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />}
                            {item.status === 'erro' && <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />}
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{item.nome}</p>
                              <p className="text-xs text-slate-400">
                                {[item.cargo, item.departamento, item.codigo ? `cód. ${item.codigo}` : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                              {item.erro && <p className="text-xs text-red-500 mt-0.5">{item.erro}</p>}
                              {item.status === 'ok' && item.usuarioCriado && (
                                <p className="text-xs text-emerald-600 mt-0.5">
                                  acesso criado — usuário <span className="font-mono">{item.usuarioCriado}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs hidden lg:table-cell whitespace-nowrap">
                          {item.paginas.join(', ')}
                        </td>
                        <td className="px-4 py-2.5">
                          {item.status === 'ok' ? (
                            <span className="text-xs text-emerald-600">Enviado</span>
                          ) : (
                            <select
                              value={item.destino}
                              onChange={e => alterarDestino(loteIdx, item.chave, e.target.value)}
                              disabled={enviando}
                              className={`w-full max-w-xs px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                                item.destino === 'criar'
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : item.destino === 'ignorar'
                                    ? 'border-slate-200 text-slate-400'
                                    : 'border-slate-300 text-slate-700'
                              }`}
                            >
                              <option value="criar">➕ Criar acesso — usuário: {item.usuarioSugerido}</option>
                              {funcionarios.map(f => (
                                <option key={f.id} value={f.id}>
                                  {f.nome}
                                  {f.usuario ? ` (${f.usuario})` : ''}
                                </option>
                              ))}
                              <option value="ignorar">Ignorar este funcionário</option>
                            </select>
                          )}
                          {item.encontradoPor && item.status === 'pendente' && item.destino === item.funcionarioId && (
                            <p className="text-xs text-emerald-600 mt-0.5">cadastro encontrado pelo nome</p>
                          )}
                          {item.ambiguo && item.status === 'pendente' && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              há mais de um cadastro com este nome — escolha manualmente
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {/* Arquivos avulsos (CPF no nome) */}
        {avulsos.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              Arquivos individuais (funcionário identificado pelo CPF no nome do arquivo)
            </div>
            <div className="divide-y divide-slate-100">
              {avulsos.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.status === 'ok' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    {item.status === 'pending' && !item.funcionario && (
                      <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{item.arquivo.name}</p>
                      {item.funcionario ? (
                        <p className="text-xs text-emerald-600">
                          {item.funcionario.nome} · CPF {formatCPF(item.cpfExtraido)}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600">
                          Não foi possível identificar o funcionário — será ignorado.
                        </p>
                      )}
                      {item.erro && <p className="text-xs text-red-500 mt-0.5">{item.erro}</p>}
                    </div>
                  </div>
                  {item.status === 'pending' && (
                    <button onClick={() => removerAvulso(idx)} className="text-slate-300 hover:text-red-400 flex-shrink-0 transition">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div className="space-y-3">
            <div className={`rounded-lg px-4 py-3 text-sm ${resultado.erro === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {resultado.ok} contra cheque(s) enviado(s).
              {resultado.criados.length > 0 && ` ${resultado.criados.length} acesso(s) criado(s).`}
              {resultado.erro > 0 && ` ${resultado.erro} com erro.`}
            </div>

            {resultado.criados.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-600 flex items-center gap-2">
                    <UserPlus className="w-3.5 h-3.5" /> Acessos criados — a senha é definida pelo funcionário no primeiro acesso
                  </span>
                  <button onClick={copiarAcessos} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition">
                    <Copy className="w-3.5 h-3.5" /> Copiar lista
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {resultado.criados.map(c => (
                    <div key={c.usuario} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-700 truncate">{c.nome}</span>
                      <span className="font-mono text-xs text-slate-500">{c.usuario}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleEnviar}
            disabled={enviando || !!analisando || totalEnviar === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {enviando ? 'Enviando...' : `Enviar ${totalEnviar} contra cheque(s)`}
          </button>
          {enviando && progresso && (
            <span className="text-xs text-slate-500">{progresso}</span>
          )}
          {totalCriar > 0 && !enviando && (
            <span className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
              {totalCriar} acesso(s) serão criados automaticamente
            </span>
          )}
          {(lotes.length > 0 || avulsos.length > 0) && !enviando && (
            <button onClick={limpar} className="text-xs text-slate-400 hover:text-slate-600 transition">
              Limpar seleção
            </button>
          )}
        </div>
      </div>

      {/* Documentos Enviados */}
      <div className="border-t border-slate-100">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-semibold text-slate-900 text-sm whitespace-nowrap">Documentos Enviados</h2>
          <select
            value={filtroFuncionario}
            onChange={e => setFiltroFuncionario(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="">Todos os funcionários</option>
            {funcionarios.map(f => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </div>
        {docsFiltrados.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            {filtroFuncionario ? 'Nenhum documento enviado para este funcionário.' : 'Nenhum documento enviado ainda.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Funcionário</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Período</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Enviado em</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docsFiltrados.map(cc => {
                  const func = funcMapById.get(cc.funcionario_id)
                  return (
                    <tr key={cc.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium text-slate-900">{func?.nome ?? '—'}</td>
                      <td className="px-6 py-3 text-slate-500 font-mono text-xs">
                        {func?.usuario ?? (func?.cpf ? formatCPF(func.cpf) : '—')}
                      </td>
                      <td className="px-6 py-3 text-slate-700">{MESES[cc.mes - 1]}/{cc.ano}</td>
                      <td className="px-6 py-3 text-slate-400 hidden md:table-cell">{formatDateTime(cc.created_at)}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <DownloadButton contraChequeId={cc.id} nomeArquivo={cc.nome_arquivo} />
                          <DeleteContraChequeButton contraChequeId={cc.id} storagePath={cc.storage_path} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
