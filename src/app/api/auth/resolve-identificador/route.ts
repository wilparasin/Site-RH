import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Traduz o que o funcionário digita no login (usuário, CPF ou e-mail) para o
 * e-mail interno usado pelo Supabase Auth e informa se a senha já foi criada.
 */
export async function POST(req: Request) {
  const { identificador } = await req.json()
  const entrada = String(identificador ?? '').trim()
  if (!entrada) return NextResponse.json({ error: 'Informe o usuário' }, { status: 400 })

  // E-mail: usado apenas por quem foi cadastrado com e-mail próprio
  if (entrada.includes('@')) {
    return NextResponse.json({ email: entrada.toLowerCase(), senhaDefinida: true })
  }

  const admin = createAdminClient()
  const somenteDigitos = entrada.replace(/\D/g, '')
  const eCPF = somenteDigitos.length === 11 && somenteDigitos === entrada.replace(/[.\-\s]/g, '')

  const consulta = admin
    .from('profiles')
    .select('id, nome, usuario, senha_definida, ativo')
    .eq('ativo', true)
    .limit(1)

  const { data: profile } = eCPF
    ? // O CPF pode ter sido gravado com ou sem os zeros à esquerda
      await consulta
        .or(`cpf.eq.${somenteDigitos},cpf.eq.${somenteDigitos.replace(/^0+/, '')}`)
        .maybeSingle()
    : await consulta.eq('usuario', entrada.toLowerCase()).maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
  }

  const { data: userData } = await admin.auth.admin.getUserById(profile.id)
  if (!userData?.user?.email) {
    return NextResponse.json({ error: 'Acesso não configurado' }, { status: 404 })
  }

  return NextResponse.json({
    email: userData.user.email,
    senhaDefinida: profile.senha_definida !== false,
    nome: profile.nome,
  })
}
