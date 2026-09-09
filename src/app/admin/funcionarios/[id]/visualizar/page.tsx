import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { formatMes, formatHoras, formatDateTime, formatCPF } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DownloadButton from '@/components/DownloadButton'

export default async function VisualizarFuncionarioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: adminProfile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (adminProfile?.role !== 'admin') redirect('/dashboard')

  const { id } = await params

  const { data: profile } = await admin.from('profiles').select('*').eq('id', id).single()
  if (!profile) redirect('/admin/funcionarios')

  const [{ data: contraCheques }, { data: bancoHoras }] = await Promise.all([
    admin.from('contra_cheques').select('*').eq('funcionario_id', id).order('ano', { ascending: false }).order('mes', { ascending: false }),
    admin.from('banco_horas').select('*').eq('funcionario_id', id).order('created_at', { ascending: false }),
  ])

  const saldoAtual = bancoHoras?.[0]?.saldo_minutos ?? null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Banner admin */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-800 text-sm">
          <span className="font-medium">Visualizando como:</span>
          <span>{profile.nome}</span>
          <span className="text-amber-500">·</span>
          <span className="text-amber-600">{profile.usuario ?? formatCPF(profile.cpf)}</span>
        </div>
        <Link
          href="/admin/funcionarios"
          className="flex items-center gap-1.5 text-amber-700 hover:text-amber-900 text-sm font-medium transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
      </div>

      {/* Header igual ao do funcionário */}
      <header className="bg-slate-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo 2B" style={{ height: '40px', objectFit: 'contain' }} />
            <div className="h-5 w-px bg-slate-600" />
            <span className="text-sm font-medium text-slate-300">Portal RH</span>
          </div>
          <span className="text-sm text-slate-300 hidden sm:block">{profile.nome}</span>
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
          <div className={`rounded-xl p-6 text-white ${saldoAtual !== null && saldoAtual < 0 ? 'bg-red-600' : 'bg-emerald-600'}`}>
            <p className="text-sm font-medium opacity-80">Saldo do Banco de Horas</p>
            <p className="text-4xl font-bold mt-2">
              {saldoAtual !== null ? formatHoras(saldoAtual) : '—'}
            </p>
            {bancoHoras?.[0] && (
              <p className="text-xs mt-2 opacity-70">Atualizado em: {new Date(bancoHoras[0].created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            )}
          </div>

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
        {bancoHoras && bancoHoras.length > 0 && (
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Histórico do Banco de Horas</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {bancoHoras.map(bh => (
                <div key={bh.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{bh.periodo}</p>
                    {bh.observacao && (
                      <p className="text-xs text-slate-400 mt-0.5">{bh.observacao}</p>
                    )}
                  </div>
                  <span className={`font-bold text-sm ${bh.saldo_minutos < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatHoras(bh.saldo_minutos)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
