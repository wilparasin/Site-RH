import { createAdminClient } from '@/lib/supabase/server'
import { formatDate, formatCPF } from '@/lib/utils'
import Link from 'next/link'
import { Users, FileText, Clock, Upload } from 'lucide-react'

export default async function AdminHomePage() {
  const supabase = createAdminClient()

  const [
    { count: totalFuncionarios },
    { count: totalContraCheques },
    { data: ultimosCC },
    { data: ultimosBH },
    { data: todosFuncionarios },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('ativo', true),
    supabase.from('contra_cheques').select('*', { count: 'exact', head: true }),
    supabase.from('contra_cheques').select('*').order('created_at', { ascending: false }).limit(5),
    supabase.from('banco_horas_uploads').select('*').order('created_at', { ascending: false }).limit(3),
    supabase.from('profiles').select('id, nome, cpf, usuario').eq('role', 'employee'),
  ])

  const funcMap = new Map((todosFuncionarios ?? []).map(f => [f.id, f]))

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Painel Administrativo</h1>
      <p className="text-slate-500 text-sm mb-8">Gerencie funcionários, contra cheques e banco de horas.</p>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-slate-500">Funcionários Ativos</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalFuncionarios ?? 0}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm text-slate-500">Contra Cheques</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalContraCheques ?? 0}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm text-slate-500">Uploads de BH</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{ultimosBH?.length ?? 0} recentes</p>
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <Link href="/admin/funcionarios" className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-white px-5 py-3 rounded-xl transition">
          <Users className="w-4 h-4" />
          <span className="text-sm font-medium">Gerenciar Funcionários</span>
        </Link>
        <Link href="/admin/contra-cheques" className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-white px-5 py-3 rounded-xl transition">
          <Upload className="w-4 h-4" />
          <span className="text-sm font-medium">Upload Contra Cheques</span>
        </Link>
        <Link href="/admin/banco-horas" className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-white px-5 py-3 rounded-xl transition">
          <Upload className="w-4 h-4" />
          <span className="text-sm font-medium">Upload Banco de Horas</span>
        </Link>
      </div>

      {/* Últimos contra cheques enviados */}
      {ultimosCC && ultimosCC.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 text-sm">Contra Cheques Recentes</h2>
            <Link href="/admin/contra-cheques" className="text-xs text-slate-500 hover:text-slate-800">Ver tudo</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {ultimosCC.map((cc: any) => {
              const func = funcMap.get(cc.funcionario_id)
              return (
                <div key={cc.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{func?.nome ?? '—'}</p>
                    <p className="text-xs text-slate-400">{func?.usuario ?? formatCPF(func?.cpf)} · {String(cc.mes).padStart(2,'0')}/{cc.ano}</p>
                  </div>
                  <p className="text-xs text-slate-400">{formatDate(cc.created_at)}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
