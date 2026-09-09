import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatMes, formatDateTime, formatCPF } from '@/lib/utils'
import LogoutButton from '@/components/LogoutButton'
import DownloadButton from '@/components/DownloadButton'
import { CardBancoHoras, HistoricoBancoHoras } from '@/components/BancoHorasResumo'
import { ordenarBancoHoras } from '@/lib/banco-horas'
import type { BancoHoras } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role === 'admin') redirect('/admin')

  const { data: contraCheques } = await admin
    .from('contra_cheques')
    .select('*')
    .eq('funcionario_id', user.id)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })

  // Só os registros do próprio funcionário.
  const { data: bancoHoras } = await admin
    .from('banco_horas')
    .select('*')
    .eq('funcionario_id', user.id)

  const registros = ordenarBancoHoras((bancoHoras ?? []) as BancoHoras[])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo 2B" style={{ height: '40px', objectFit: 'contain' }} />
            <div className="h-5 w-px bg-slate-600" />
            <span className="text-sm font-medium text-slate-300">Portal RH</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300 hidden sm:block">{profile.nome}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Boas vindas */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Olá, {profile.nome.split(' ')[0]}!</h1>
          <p className="text-slate-500 text-sm mt-1">
            {profile.usuario ? `Usuário ${profile.usuario}` : `CPF ${formatCPF(profile.cpf)}`}
            {profile.cargo && ` · ${profile.cargo}`}
            {profile.departamento && ` · ${profile.departamento}`}
          </p>
        </div>

        {/* Cards superiores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Banco de horas */}
          <CardBancoHoras registros={registros} />

          {/* Contra cheques */}
          <div className="bg-white rounded-xl p-6 border border-slate-200">
            <p className="text-sm font-medium text-slate-500">Contra Cheques</p>
            <p className="text-4xl font-bold text-slate-900 mt-2">{contraCheques?.length ?? 0}</p>
            <p className="text-xs text-slate-400 mt-2">documentos disponíveis</p>
          </div>
        </div>

        {/* Contra Cheques */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Contra Cheques</h2>
          </div>
          {!contraCheques || contraCheques.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm">
              Nenhum contra cheque disponível ainda.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {contraCheques.map(cc => (
                <div key={cc.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{formatMes(cc.mes, cc.ano)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Disponível desde {formatDateTime(cc.created_at)}</p>
                  </div>
                  <DownloadButton contraChequeId={cc.id} nomeArquivo={cc.nome_arquivo} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Histórico Banco de Horas */}
        <HistoricoBancoHoras registros={registros} />
      </main>
    </div>
  )
}
