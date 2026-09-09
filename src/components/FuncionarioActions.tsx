'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, PowerOff, Power, Pencil, Trash2, X, Eye, KeyRound } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { gerarUsuario } from '@/lib/utils'

interface Props {
  funcionario: Profile
}

export default function FuncionarioActions({ funcionario }: Props) {
  const router = useRouter()
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const [editando, setEditando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [redefinindo, setRedefinindo] = useState(false)
  const [form, setForm] = useState({
    nome: funcionario.nome,
    usuario: funcionario.usuario || gerarUsuario(funcionario.nome),
    cargo: funcionario.cargo || '',
    departamento: funcionario.departamento || '',
    senha: '',
  })
  const [erro, setErro] = useState('')

  function abrirMenu() {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function toggleAtivo() {
    setCarregando(true)
    await fetch(`/api/admin/funcionarios/${funcionario.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !funcionario.ativo }),
    })
    setMenuPos(null)
    router.refresh()
    setCarregando(false)
  }

  async function handleEditar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const res = await fetch(`/api/admin/funcionarios/${funcionario.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: form.nome,
        usuario: form.usuario,
        cargo: form.cargo || null,
        departamento: form.departamento || null,
        ...(form.senha ? { senha: form.senha } : {}),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setErro(data.error || 'Erro ao salvar.')
      setCarregando(false)
      return
    }
    setEditando(false)
    router.refresh()
    setCarregando(false)
  }

  async function handleRedefinirSenha() {
    setCarregando(true)
    const res = await fetch(`/api/admin/funcionarios/${funcionario.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redefinirSenha: true }),
    })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || 'Erro ao redefinir a senha.')
    }
    setRedefinindo(false)
    router.refresh()
    setCarregando(false)
  }

  async function handleExcluir() {
    setCarregando(true)
    const res = await fetch(`/api/admin/funcionarios/${funcionario.id}`, { method: 'DELETE' })
    if (res.ok) {
      setExcluindo(false)
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error || 'Erro ao excluir.')
    }
    setCarregando(false)
  }

  return (
    <>
      {/* Menu três pontos */}
      <div className="relative">
        <button
          ref={btnRef}
          onClick={abrirMenu}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuPos && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} />
            <div
              className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg w-44 py-1 overflow-hidden"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <button
                onClick={() => { setMenuPos(null); router.push(`/admin/funcionarios/${funcionario.id}/visualizar`) }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-slate-50 transition"
              >
                <Eye className="w-4 h-4 text-slate-500" /> Visualizar
              </button>
              <button
                onClick={() => { setMenuPos(null); setEditando(true) }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-slate-50 transition"
              >
                <Pencil className="w-4 h-4 text-slate-500" /> Editar
              </button>
              <button
                onClick={toggleAtivo}
                disabled={carregando}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-slate-50 transition disabled:opacity-50"
              >
                {funcionario.ativo
                  ? <><PowerOff className="w-4 h-4 text-amber-500" /> Desativar</>
                  : <><Power className="w-4 h-4 text-emerald-500" /> Reativar</>}
              </button>
              <button
                onClick={() => { setMenuPos(null); setRedefinindo(true) }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-slate-50 transition"
              >
                <KeyRound className="w-4 h-4 text-slate-500" /> Redefinir senha
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => { setMenuPos(null); setExcluindo(true) }}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-red-50 text-red-600 transition"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal Editar */}
      {editando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Editar Funcionário</h2>
              <button onClick={() => setEditando(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditar} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <div className="flex justify-end mb-1"><label className="text-xs font-medium text-slate-700">Nome completo *</label></div>
                  <input value={form.nome} onChange={e => set('nome', e.target.value)} required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <div className="flex justify-end mb-1"><label className="text-xs font-medium text-slate-700">Usuário *</label></div>
                  <input value={form.usuario} onChange={e => set('usuario', e.target.value.toLowerCase().replace(/\s/g, ''))} required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <div className="flex justify-end mb-1"><label className="text-xs font-medium text-slate-700">Nova senha</label></div>
                  <input type="password" value={form.senha} onChange={e => set('senha', e.target.value)}
                    placeholder="Deixe em branco para manter"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <div className="flex justify-end mb-1"><label className="text-xs font-medium text-slate-700">Cargo</label></div>
                  <input value={form.cargo} onChange={e => set('cargo', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
                <div>
                  <div className="flex justify-end mb-1"><label className="text-xs font-medium text-slate-700">Departamento</label></div>
                  <input value={form.departamento} onChange={e => set('departamento', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
                </div>
              </div>
              {erro && <p className="text-red-600 text-xs">{erro}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditando(false)}
                  className="flex-1 border border-slate-300 text-slate-700 text-sm py-2 rounded-lg hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={carregando}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white text-sm py-2 rounded-lg transition">
                  {carregando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redefinir Senha */}
      {redefinindo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Redefinir senha</h2>
                <p className="text-xs text-slate-500 mt-0.5">Use quando o funcionário esquecer a senha.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              A senha atual de <strong>{funcionario.nome}</strong> será apagada. No próximo login, com o usuário{' '}
              <span className="font-mono text-slate-800">{funcionario.usuario ?? ''}</span>, ele mesmo cria uma nova senha.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRedefinindo(false)}
                className="flex-1 border border-slate-300 text-slate-700 text-sm py-2 rounded-lg hover:bg-slate-50 transition">
                Cancelar
              </button>
              <button onClick={handleRedefinirSenha} disabled={carregando}
                className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm py-2 rounded-lg transition">
                {carregando ? 'Redefinindo...' : 'Redefinir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão */}
      {excluindo && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Excluir funcionário</h2>
                <p className="text-xs text-slate-500 mt-0.5">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Tem certeza que deseja excluir <strong>{funcionario.nome}</strong>? Todos os contra cheques e registros de banco de horas serão apagados permanentemente.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setExcluindo(false)}
                className="flex-1 border border-slate-300 text-slate-700 text-sm py-2 rounded-lg hover:bg-slate-50 transition">
                Cancelar
              </button>
              <button onClick={handleExcluir} disabled={carregando}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm py-2 rounded-lg transition">
                {carregando ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
