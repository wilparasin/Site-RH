import { createClient, createAdminClient } from '@/lib/supabase/server'
import { criarFuncionario, gerarUsuarioDisponivel } from '@/lib/funcionarios-server'
import { NextResponse } from 'next/server'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Usa admin client para evitar recursão no RLS
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function GET() {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('role', 'employee')
    .order('nome')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/**
 * Cria o acesso de um funcionário. Só o nome é obrigatório: o usuário é
 * derivado do nome e a senha é criada pelo próprio funcionário no primeiro
 * acesso (a menos que uma senha inicial seja informada).
 */
export async function POST(req: Request) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const nome = String(body.nome ?? '').trim()

  if (!nome) return NextResponse.json({ error: 'O nome é obrigatório' }, { status: 400 })

  const admin = createAdminClient()

  // Só valida colisão quando o admin digitou o usuário manualmente
  const usuarioInformado = String(body.usuario ?? '').trim().toLowerCase()
  if (usuarioInformado) {
    const { data: existente } = await admin
      .from('profiles')
      .select('id')
      .eq('usuario', usuarioInformado)
      .maybeSingle()
    if (existente) {
      return NextResponse.json({ error: `O usuário "${usuarioInformado}" já está em uso.` }, { status: 409 })
    }
  }

  const resultado = await criarFuncionario(admin, {
    nome,
    usuario: usuarioInformado || undefined,
    cargo: body.cargo || null,
    departamento: body.departamento || null,
    empresa: body.empresa || null,
    codigoFolha: body.codigoFolha || null,
    cpf: body.cpf || null,
    email: body.email || null,
    senha: body.senha || null,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 400 })
  }

  return NextResponse.json(resultado.funcionario, { status: 201 })
}

/** Sugere um usuário livre a partir do nome (usado pelo formulário). */
export async function PUT(req: Request) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { nome } = await req.json()
  if (!nome) return NextResponse.json({ usuario: '' })

  const admin = createAdminClient()
  const usuario = await gerarUsuarioDisponivel(admin, String(nome))
  return NextResponse.json({ usuario })
}
