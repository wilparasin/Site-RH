import { createAdminClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import UploadBancoHoras from '@/components/UploadBancoHoras'
import type { BancoHorasUpload } from '@/lib/types'

export default async function BancoHorasAdminPage() {
  const supabase = createAdminClient()

  const { data: uploads } = await supabase
    .from('banco_horas_uploads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Banco de Horas</h1>
        <p className="text-slate-500 text-sm mt-1">
          Envie a planilha do mês (uma por loja). Cada funcionário vê apenas o próprio saldo.
        </p>
      </div>

      {/* Instruções do formato */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 mb-6">
        <h3 className="font-semibold text-blue-900 text-sm mb-2">Formato da planilha</h3>
        <p className="text-blue-700 text-xs mb-2">
          É a planilha &ldquo;SOLUÇÃO H.E.&rdquo; como o RH já monta — o mês na primeira linha e o
          cabeçalho na segunda:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {['FUNCIONÁRIO', 'ACUMULADO', 'JULHO (o mês)', 'TOTAL'].map(col => (
            <div key={col} className="bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-center">
              <code className="text-xs font-mono text-blue-800">{col}</code>
            </div>
          ))}
        </div>
        <ul className="text-blue-600 text-xs mt-3 space-y-1 list-disc list-inside">
          <li>
            O funcionário é reconhecido <strong>pelo nome</strong> — o primeiro nome basta, e o
            sobrenome entra quando duas pessoas têm o mesmo primeiro nome.
          </li>
          <li>
            O <strong>período</strong> é lido da própria planilha; o campo ao lado só é usado se
            você quiser mudá-lo.
          </li>
          <li>
            As horas podem estar no formato <code className="font-mono">H:MM</code> (2:30, -1:15),
            como hora do Excel ou em horas decimais (2.5). Saldo negativo é aceito.
          </li>
          <li>
            Quem não for reconhecido fica na tela de conferência para você escolher — nada é
            gravado por adivinhação. Reimportar o mesmo mês corrige os saldos daquele mês.
          </li>
        </ul>
      </div>

      {/* Upload form */}
      <UploadBancoHoras />

      {/* Histórico de uploads */}
      {uploads && uploads.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900 text-sm">Histórico de Importações</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(uploads as BancoHorasUpload[]).map(u => (
              <div key={u.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{u.nome_arquivo}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Período: <strong>{u.periodo}</strong> · {u.total_funcionarios} funcionários atualizados
                  </p>
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap ml-4">{formatDate(u.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
