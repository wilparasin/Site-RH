'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Eye, EyeOff, KeyRound } from 'lucide-react'

type Modo = 'login' | 'primeiro-acesso' | 'trocar-senha'

interface Identificacao {
  email: string | null
  senhaDefinida: boolean
  nome?: string
  erro: string | null
}

async function resolveIdentifier(identifier: string): Promise<Identificacao> {
  const res = await fetch('/api/auth/resolve-identificador', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador: identifier.trim() }),
  })
  if (!res.ok) return { email: null, senhaDefinida: false, erro: 'Usuário não encontrado.' }
  const data = await res.json()
  return { email: data.email, senhaDefinida: data.senhaDefinida, nome: data.nome, erro: null }
}

function PasswordInput({ value, onChange, placeholder, autoComplete }: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  autoComplete?: string
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        type={visivel ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{ paddingRight: '2.5rem' }}
        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
      />
      <button
        type="button"
        onClick={() => setVisivel(v => !v)}
        tabIndex={-1}
        style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
      >
        {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>('login')

  // Login
  const [identifier, setIdentifier] = useState('')
  const [senha, setSenha] = useState('')
  const [erroLogin, setErroLogin] = useState('')
  const [carregandoLogin, setCarregandoLogin] = useState(false)

  // Primeiro acesso
  const [paIdentifier, setPaIdentifier] = useState('')
  const [paNome, setPaNome] = useState('')
  const [paSenha, setPaSenha] = useState('')
  const [paConfirmar, setPaConfirmar] = useState('')
  const [erroPa, setErroPa] = useState('')
  const [carregandoPa, setCarregandoPa] = useState(false)

  // Trocar senha
  const [tcIdentifier, setTcIdentifier] = useState('')
  const [tcSenhaAtual, setTcSenhaAtual] = useState('')
  const [tcNovaSenha, setTcNovaSenha] = useState('')
  const [tcConfirmar, setTcConfirmar] = useState('')
  const [erroTc, setErroTc] = useState('')
  const [carregandoTc, setCarregandoTc] = useState(false)
  const [trocaConcluida, setTrocaConcluida] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErroLogin('')
    setCarregandoLogin(true)

    const { email, senhaDefinida, nome, erro } = await resolveIdentifier(identifier)
    if (!email) {
      setErroLogin(erro || 'Usuário inválido.')
      setCarregandoLogin(false)
      return
    }

    // Ainda não criou a senha: leva direto para o primeiro acesso
    if (!senhaDefinida) {
      setPaIdentifier(identifier.trim())
      setPaNome(nome ?? '')
      setPaSenha('')
      setPaConfirmar('')
      setErroPa('')
      setModo('primeiro-acesso')
      setCarregandoLogin(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) {
      setErroLogin('Usuário ou senha incorretos.')
      setCarregandoLogin(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  async function handlePrimeiroAcesso(e: React.FormEvent) {
    e.preventDefault()
    setErroPa('')

    if (paSenha.length < 6) {
      setErroPa('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (paSenha !== paConfirmar) {
      setErroPa('A senha e a confirmação não coincidem.')
      return
    }

    setCarregandoPa(true)

    const res = await fetch('/api/auth/primeiro-acesso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificador: paIdentifier, senha: paSenha }),
    })
    const data = await res.json()

    if (!res.ok) {
      setErroPa(data.error || 'Não foi possível criar a senha.')
      setCarregandoPa(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: paSenha })
    setCarregandoPa(false)

    if (error) {
      setErroPa('Senha criada, mas houve um erro ao entrar. Faça login normalmente.')
      setModo('login')
      return
    }

    router.push('/')
    router.refresh()
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErroTc('')

    if (tcNovaSenha.length < 6) {
      setErroTc('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (tcNovaSenha !== tcConfirmar) {
      setErroTc('A nova senha e a confirmação não coincidem.')
      return
    }
    if (tcSenhaAtual === tcNovaSenha) {
      setErroTc('A nova senha deve ser diferente da atual.')
      return
    }

    setCarregandoTc(true)

    const { email, erro } = await resolveIdentifier(tcIdentifier)
    if (!email) {
      setErroTc(erro || 'Usuário inválido.')
      setCarregandoTc(false)
      return
    }

    const supabase = createClient()

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: tcSenhaAtual,
    })

    if (loginError) {
      setErroTc('Usuário ou senha atual incorretos.')
      setCarregandoTc(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: tcNovaSenha })
    if (updateError) {
      setErroTc('Erro ao atualizar a senha. Tente novamente.')
      setCarregandoTc(false)
      return
    }

    await supabase.auth.signOut()
    setTrocaConcluida(true)
    setCarregandoTc(false)
  }

  function voltarLogin() {
    setModo('login')
    setErroTc('')
    setErroPa('')
    setTrocaConcluida(false)
    setTcIdentifier('')
    setTcSenhaAtual('')
    setTcNovaSenha('')
    setTcConfirmar('')
    setPaSenha('')
    setPaConfirmar('')
  }

  const subtitulo =
    modo === 'login'
      ? 'Contra cheques & Banco de Horas'
      : modo === 'primeiro-acesso'
        ? 'Primeiro acesso'
        : 'Trocar senha'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="bg-slate-800 px-8 py-8 flex flex-col items-center gap-3">
            <img src="/logo.png" alt="Logo 2B" style={{ height: '90px', objectFit: 'contain' }} />
            <div className="text-center">
              <h1 className="text-white text-xl font-bold">Portal RH</h1>
              <p className="text-slate-400 text-sm mt-1">{subtitulo}</p>
            </div>
          </div>

          {/* ── LOGIN ── */}
          {modo === 'login' && (
            <form onSubmit={handleLogin} className="px-8 py-8 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Usuário</label>
                <input
                  type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
                  required autoComplete="username" placeholder="primeiro e segundo nome (ex: anaclara)"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
                <PasswordInput
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {erroLogin && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {erroLogin}
                </div>
              )}

              <button
                type="submit" disabled={carregandoLogin}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white font-medium py-2.5 px-4 rounded-lg transition text-sm"
              >
                {carregandoLogin ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => { setModo('primeiro-acesso'); setPaIdentifier(identifier); setPaNome('') }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline transition"
                >
                  Primeiro acesso
                </button>
                <span className="text-slate-300 text-xs">|</span>
                <button
                  type="button"
                  onClick={() => { setModo('trocar-senha'); setTcIdentifier(identifier) }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline transition"
                >
                  Trocar senha
                </button>
              </div>
            </form>
          )}

          {/* ── PRIMEIRO ACESSO ── */}
          {modo === 'primeiro-acesso' && (
            <form onSubmit={handlePrimeiroAcesso} className="px-8 py-8 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex gap-3">
                <KeyRound className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  {paNome ? <><strong className="font-medium text-slate-800">{paNome}</strong>, crie</> : 'Crie'} a sua
                  senha de acesso. Ela é pessoal — nem o RH consegue vê-la.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Usuário</label>
                <input
                  type="text" value={paIdentifier} onChange={e => setPaIdentifier(e.target.value)}
                  required autoComplete="username" placeholder="primeiro e segundo nome (ex: anaclara)"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Criar senha</label>
                <PasswordInput
                  value={paSenha}
                  onChange={e => setPaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar senha</label>
                <PasswordInput
                  value={paConfirmar}
                  onChange={e => setPaConfirmar(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>

              {erroPa && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {erroPa}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={voltarLogin}
                  className="flex-1 border border-slate-300 text-slate-700 text-sm py-2.5 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={carregandoPa}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white text-sm font-medium py-2.5 rounded-lg transition"
                >
                  {carregandoPa ? 'Criando...' : 'Criar senha e entrar'}
                </button>
              </div>
            </form>
          )}

          {/* ── TROCAR SENHA ── */}
          {modo === 'trocar-senha' && !trocaConcluida && (
            <form onSubmit={handleTrocarSenha} className="px-8 py-8 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Usuário</label>
                <input
                  type="text" value={tcIdentifier} onChange={e => setTcIdentifier(e.target.value)}
                  required placeholder="primeiro e segundo nome (ex: anaclara)"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha atual</label>
                <PasswordInput
                  value={tcSenhaAtual}
                  onChange={e => setTcSenhaAtual(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nova senha</label>
                <PasswordInput
                  value={tcNovaSenha}
                  onChange={e => setTcNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar nova senha</label>
                <PasswordInput
                  value={tcConfirmar}
                  onChange={e => setTcConfirmar(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {erroTc && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {erroTc}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={voltarLogin}
                  className="flex-1 border border-slate-300 text-slate-700 text-sm py-2.5 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={carregandoTc}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white text-sm font-medium py-2.5 rounded-lg transition"
                >
                  {carregandoTc ? 'Salvando...' : 'Salvar senha'}
                </button>
              </div>
            </form>
          )}

          {/* ── CONCLUÍDO ── */}
          {modo === 'trocar-senha' && trocaConcluida && (
            <div className="px-8 py-10 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Senha alterada com sucesso!</p>
                <p className="text-sm text-slate-500 mt-1">Faça login com a sua nova senha.</p>
              </div>
              <button
                onClick={voltarLogin}
                className="mt-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition"
              >
                Ir para o login
              </button>
            </div>
          )}

        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Problemas para acessar? Contate o administrador.
        </p>
      </div>
    </div>
  )
}
