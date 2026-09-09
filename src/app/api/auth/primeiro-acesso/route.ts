import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Primeiro acesso: o funcionário informa o usuário e cria a própria senha.
 * Só funciona enquanto a senha nunca foi definida — depois disso, a troca de
 * senha exige a senha atual.
 */
export async function POST(req: Request) {
  const { identificador, senha } = await req.json()
  const entrada = String(identificador ?? '').trim().toLowerCase()
  const novaSenha = String(senha ?? '')

  if (!entrada) return NextResponse.json({ error: 'Informe o usuário' }, { status: 400 })
  if (novaSenha.length < 6) {
    return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }

  const admin = createAdminClient()
  const somenteDigitos = entrada.replace(/\D/g, '')
  const eCPF = somenteDigitos.length === 11

  const consulta = admin
    .from('profiles')
    .select('id, nome, senha_definida')
    .eq('ativo', true)
    .limit(1)

  const { data: profile } = eCPF
    ? await consulta
        .or(`cpf.eq.${somenteDigitos},cpf.eq.${somenteDigitos.replace(/^0+/, '')}`)
        .maybeSingle()
    : await consulta.eq('usuario', entrada).maybeSingle()

  if (!profile) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  if (profile.senha_definida !== false) {
    return NextResponse.json(
      { error: 'Este usuário já tem senha. Use "Trocar senha" se precisar alterá-la.' },
      { status: 409 }
    )
  }

  const { data: userData } = await admin.auth.admin.getUserById(profile.id)
  if (!userData?.user?.email) {
    return NextResponse.json({ error: 'Acesso não configurado' }, { status: 404 })
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, {
    password: novaSenha,
  })
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  await admin.from('profiles').update({ senha_definida: true }).eq('id', profile.id)

  return NextResponse.json({ email: userData.user.email, nome: profile.nome })
}
