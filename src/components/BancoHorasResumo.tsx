import { formatHoras, formatHorasCurto, formatDateTime } from '@/lib/utils'
import type { BancoHoras } from '@/lib/types'

/**
 * O saldo do funcionário, do jeito que a planilha do RH mostra: o que vinha
 * acumulado, o que ele fez no mês e o total. Usado na tela do funcionário e
 * na visualização do admin, para que os dois vejam exatamente a mesma coisa.
 */

export function CardBancoHoras({ registros }: { registros: BancoHoras[] }) {
  const atual = registros[0] ?? null
  const total = atual?.saldo_minutos ?? null
  const negativo = total !== null && total < 0

  return (
    <div className={`rounded-xl p-6 text-white ${negativo ? 'bg-red-600' : 'bg-emerald-600'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium opacity-80">Saldo do Banco de Horas</p>
        {atual && <p className="text-xs opacity-80">{atual.periodo}</p>}
      </div>

      <p className="text-4xl font-bold mt-2">{total !== null ? formatHoras(total) : '—'}</p>

      {atual && (atual.acumulado_minutos != null || atual.mes_minutos != null) && (
        <div className="flex gap-6 mt-4 pt-4 border-t border-white/25">
          <div>
            <p className="text-xs opacity-70">Acumulado anterior</p>
            <p className="text-sm font-semibold mt-0.5">
              {formatHorasCurto(atual.acumulado_minutos)}
            </p>
          </div>
          <div>
            <p className="text-xs opacity-70">No mês</p>
            <p className="text-sm font-semibold mt-0.5">{formatHorasCurto(atual.mes_minutos)}</p>
          </div>
        </div>
      )}

      {atual && (
        <p className="text-xs mt-3 opacity-70">Atualizado em: {formatDateTime(atual.created_at)}</p>
      )}
    </div>
  )
}

export function HistoricoBancoHoras({ registros }: { registros: BancoHoras[] }) {
  if (registros.length === 0) return null

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">Histórico do Banco de Horas</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 border-b border-slate-100">
              <th className="px-6 py-2 text-left font-medium">Período</th>
              <th className="px-4 py-2 text-right font-medium">Acumulado</th>
              <th className="px-4 py-2 text-right font-medium">No mês</th>
              <th className="px-6 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {registros.map(bh => (
              <tr key={bh.id}>
                <td className="px-6 py-3">
                  <p className="font-medium text-slate-900">{bh.periodo}</p>
                  {bh.observacao && <p className="text-xs text-slate-400 mt-0.5">{bh.observacao}</p>}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                  {formatHorasCurto(bh.acumulado_minutos)}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                  {formatHorasCurto(bh.mes_minutos)}
                </td>
                <td
                  className={`px-6 py-3 text-right font-bold tabular-nums ${
                    bh.saldo_minutos < 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {formatHorasCurto(bh.saldo_minutos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
