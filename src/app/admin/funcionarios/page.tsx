import { createAdminClient } from '@/lib/supabase/server'
import { formatDate, formatCPF } from '@/lib/utils'
import FuncionarioActions from '@/components/FuncionarioActions'
import NovoFuncionarioModal from '@/components/NovoFuncionarioModal'

export default async function FuncionariosPage() {
  const supabase = createAdminClient()

  const { data: funcionarios } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'employee')
    .order('nome')

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Funcionários</h1>
          <p className="text-slate-500 text-sm mt-1">{funcionarios?.length ?? 0} cadastrados</p>
        </div>
        <NovoFuncionarioModal />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {!funcionarios || funcionarios.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Nenhum funcionário cadastrado. Clique em &ldquo;Novo Funcionário&rdquo; para adicionar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Cargo</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Departamento</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Cadastrado</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Senha</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {funcionarios.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium text-slate-900 break-words">{f.nome}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap font-mono text-xs">
                      {f.usuario ?? formatCPF(f.cpf)}
                    </td>
                    <td className="px-6 py-4 text-slate-500 hidden md:table-cell">{f.cargo || '—'}</td>
                    <td className="px-6 py-4 text-slate-500 hidden lg:table-cell">{f.departamento || '—'}</td>
                    <td className="px-6 py-4 text-slate-400 hidden lg:table-cell">{formatDate(f.created_at)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${f.senha_definida === false ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {f.senha_definida === false ? 'Aguardando 1º acesso' : 'Definida'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${f.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {f.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <FuncionarioActions funcionario={f} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
