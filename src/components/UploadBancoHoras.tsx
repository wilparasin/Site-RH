'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'
import { formatHorasCurto } from '@/lib/utils'

type StatusLinha = 'ok' | 'ambiguo' | 'duplicado' | 'nao_encontrado' | 'ignorado'

interface LinhaPreview {
  linha: number
  nome: string
  acumuladoMinutos: number | null
  mesMinutos: number | null
  totalMinutos: number
  observacao: string | null
  status: StatusLinha
  funcionarioId: string | null
  funcionarioNome: string | null
  candidatos: { id: string; nome: string }[]
  /** Saldo que já estava gravado neste período, se houver. */
  jaImportado: number | null
}

interface Preview {
  periodo: string
  periodoDetectado: string | null
  nomeArquivo: string
  funcionarios: { id: string; nome: string; usuario?: string | null }[]
  linhas: LinhaPreview[]
}

interface Resultado {
  total: number
  periodo: string
  naoImportados: { nome: string; status: string }[]
}

const IGNORAR = 'ignorar'

const AVISO: Record<StatusLinha, string | null> = {
  ok: null,
  ambiguo: 'Mais de um funcionário com esse nome — escolha qual é.',
  duplicado: 'Outra linha da planilha já ficou com esse funcionário.',
  nao_encontrado: 'Nenhum funcionário com esse nome no cadastro.',
  ignorado: null,
}

export default function UploadBancoHoras() {
  const router = useRouter()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [periodo, setPeriodo] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [escolhas, setEscolhas] = useState<Record<number, string>>({})
  const [carregandoPreview, setCarregandoPreview] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState('')

  function limpar() {
    setPreview(null)
    setEscolhas({})
    setResultado(null)
    setErro('')
  }

  async function enviar(modo: 'preview' | 'confirmar') {
    if (!arquivo) return
    const formData = new FormData()
    formData.append('arquivo', arquivo)
    formData.append('periodo', periodo)
    formData.append('modo', modo)
    if (modo === 'confirmar') formData.append('mapeamento', JSON.stringify(escolhas))

    const res = await fetch('/api/admin/banco-horas', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Erro ao processar a planilha.')
    return data
  }

  async function handlePreview() {
    setCarregandoPreview(true)
    setErro('')
    setPreview(null)
    try {
      const data: Preview = await enviar('preview')
      setPreview(data)
      // O período vem da própria planilha ("JULHO 2026" na primeira linha).
      if (!periodo) setPeriodo(data.periodo)
      setEscolhas(
        Object.fromEntries(
          data.linhas.map(l => [l.linha, l.funcionarioId ?? IGNORAR])
        )
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar a planilha.')
    }
    setCarregandoPreview(false)
  }

  async function handleConfirmar() {
    setEnviando(true)
    setErro('')
    try {
      const data: Resultado = await enviar('confirmar')
      setResultado(data)
      setPreview(null)
      setEscolhas({})
      setArquivo(null)
      setPeriodo('')
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao importar.')
    }
    setEnviando(false)
  }

  const selecionadas = preview
    ? preview.linhas.filter(l => {
        const escolha = escolhas[l.linha]
        return escolha && escolha !== IGNORAR
      })
    : []
  const pendentes = preview
    ? preview.linhas.filter(l => (escolhas[l.linha] ?? IGNORAR) === IGNORAR && l.status !== 'ignorado')
    : []

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-sm">Importar Planilha</h2>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Planilha Excel (.xlsx ou .xls)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={e => {
                setArquivo(e.target.files?.[0] || null)
                setPeriodo('')
                limpar()
              }}
              className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm hover:file:bg-slate-200 transition cursor-pointer border border-slate-300 rounded-lg py-1.5 px-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Período <span className="text-slate-400">(vem da planilha)</span>
            </label>
            <input
              type="text"
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
              placeholder="Julho/2026"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>

        {erro && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        {resultado && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <p className="text-sm text-emerald-700 font-medium">
                {resultado.total} funcionário(s) atualizados em {resultado.periodo}.
              </p>
            </div>
            {resultado.naoImportados.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                Fora da importação: {resultado.naoImportados.map(n => n.nome).join(', ')}
              </p>
            )}
          </div>
        )}

        {!preview && (
          <button
            onClick={handlePreview}
            disabled={!arquivo || carregandoPreview}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white text-sm px-5 py-2.5 rounded-lg transition"
          >
            {carregandoPreview ? 'Lendo planilha...' : 'Visualizar Dados'}
          </button>
        )}

        {preview && (
          <>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                <p className="text-xs font-medium text-slate-600">
                  {preview.linhas.length} linhas na planilha · {selecionadas.length} prontas para
                  importar{' '}
                  {pendentes.length > 0 && (
                    <span className="text-amber-600">· {pendentes.length} sem funcionário</span>
                  )}
                </p>
              </div>

              <div className="max-h-[26rem] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 shadow-[0_1px_0_0_theme(colors.slate.200)]">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">Na planilha</th>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">Funcionário</th>
                      <th className="px-3 py-2 text-right text-slate-500 font-medium">Acumulado</th>
                      <th className="px-3 py-2 text-right text-slate-500 font-medium">No mês</th>
                      <th className="px-3 py-2 text-right text-slate-500 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.linhas.map(l => {
                      const escolha = escolhas[l.linha] ?? IGNORAR
                      const semFuncionario = escolha === IGNORAR
                      const aviso = AVISO[l.status]
                      return (
                        <tr key={l.linha} className={semFuncionario ? 'bg-amber-50/60' : ''}>
                          <td className="px-3 py-2 align-top">
                            <p className="text-slate-700 font-medium">{l.nome}</p>
                            {l.observacao && (
                              <p className="text-slate-400 mt-0.5">{l.observacao}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <select
                              value={escolha}
                              onChange={e =>
                                setEscolhas(prev => ({ ...prev, [l.linha]: e.target.value }))
                              }
                              className={`w-full max-w-xs px-2 py-1 rounded border text-xs bg-white ${
                                semFuncionario
                                  ? 'border-amber-300 text-amber-700'
                                  : 'border-slate-200 text-slate-700'
                              }`}
                            >
                              <option value={IGNORAR}>Não importar esta linha</option>
                              {preview.funcionarios.map(f => (
                                <option key={f.id} value={f.id}>
                                  {f.nome}
                                </option>
                              ))}
                            </select>
                            {semFuncionario && aviso && (
                              <p className="text-amber-600 mt-1">{aviso}</p>
                            )}
                            {!semFuncionario && l.jaImportado !== null && (
                              <p className="text-slate-400 mt-1">
                                Já havia {formatHorasCurto(l.jaImportado)} neste período — será
                                substituído.
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right align-top text-slate-500 tabular-nums">
                            {formatHorasCurto(l.acumuladoMinutos)}
                          </td>
                          <td className="px-3 py-2 text-right align-top text-slate-500 tabular-nums">
                            {formatHorasCurto(l.mesMinutos)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right align-top font-medium tabular-nums ${
                              l.totalMinutos < 0 ? 'text-red-600' : 'text-emerald-600'
                            }`}
                          >
                            {formatHorasCurto(l.totalMinutos)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={limpar}
                className="border border-slate-300 text-slate-700 text-sm px-4 py-2 rounded-lg hover:bg-slate-50 transition"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={enviando || selecionadas.length === 0 || !periodo}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition"
              >
                <Upload className="w-4 h-4" />
                {enviando ? 'Importando...' : `Confirmar (${selecionadas.length} funcionários)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
