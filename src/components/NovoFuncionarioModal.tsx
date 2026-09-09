'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, KeyRound } from 'lucide-react'
import { gerarUsuario } from '@/lib/utils'

export default function NovoFuncionarioModal() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [usuarioEditado, setUsuarioEditado] = useState(false)
  const [form, setForm] = useState({
    nome: '', usuario: '', cargo: '', departamento: '', empresa: ''
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  /** O usuário acompanha o nome até o admin editá-lo à mão. */
  function setNome(value: string) {
    setForm(f => ({ ...f, nome: value, usuario: usuarioEditado ? f.usuario : gerarUsuario(value) }))
  }

  function fechar() {
    setAberto(false)
    setErro('')
    setUsuarioEditado(false)
    setForm({ nome: '', usuario: '', cargo: '', departamento: '', empresa: '' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const res = await fetch('/api/admin/funcionarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    if (!res.ok) {
      setErro(data.error || 'Erro ao criar funcionário.')
      setCarregando(false)
      return
    }

    setCarregando(false)
    fechar()
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
      >
        <UserPlus className="w-4 h-4" />
        Novo Funcionário
      </button>

      {aberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Novo Funcionário</h2>
              <button onClick={fechar} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nome completo *</label>
                  <input value={form.nome} onChange={e => setNome(e.target.value)} required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Usuário de acesso *</label>
                  <input
                    value={form.usuario}
                    onChange={e => { setUsuarioEditado(true); set('usuario', e.target.value.toLowerCase().replace(/\s/g, '')) }}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400" />
                  <p className="text-xs text-slate-400 mt-1">Primeiro e segundo nome, juntos e em minúsculas.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cargo</label>
                  <input value={form.cargo} onChange={e => set('cargo', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Departamento</label>
                  <input value={form.departamento} onChange={e => set('departamento', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex gap-3">
                <KeyRound className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  A senha é criada pelo próprio funcionário no primeiro acesso — basta informar o usuário na tela de login.
                </p>
              </div>

              {erro && <p className="text-red-600 text-xs">{erro}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={fechar}
                  className="flex-1 border border-slate-300 text-slate-700 text-sm py-2 rounded-lg hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={carregando}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white text-sm py-2 rounded-lg transition">
                  {carregando ? 'Criando...' : 'Criar Funcionário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
