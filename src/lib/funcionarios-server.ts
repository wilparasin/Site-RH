import type { SupabaseClient } from '@supabase/supabase-js'
import { gerarUsuario, normalizarNome } from './utils'

/**
 * O acesso do funcionário é feito pelo usuário (primeiro + segundo nome).
 * O Supabase Auth exige um e-mail, então usamos um endereço interno que
 * nunca recebe mensagens — o funcionário nunca precisa conhecê-lo.
 */
export const DOMINIO_INTERNO = 'funcionarios.2b.local'

export function emailInterno(usuario: string): string {
  return `${usuario}@${DOMINIO_INTERNO}`
}

export interface NovoFuncionario {
  nome: string
  usuario?: string | null
  cargo?: string | null
  departamento?: string | null
  empresa?: string | null
  codigoFolha?: string | null
  cpf?: string | null
  email?: string | null
  senha?: string | null
}

/** Busca um usuário livre a partir do nome, considerando o que já existe no banco. */
export async function gerarUsuarioDisponivel(
  admin: SupabaseClient,
  nome: string,
  reservados: Set<string> = new Set()
): Promise<string> {
  const base = gerarUsuario(nome)
  const { data } = await admin
    .from('profiles')
    .select('usuario')
    .like('usuario', `${base}%`)

  const emUso = new Set<string>([
    ...reservados,
    ...(data ?? []).map(r => String(r.usuario ?? '')).filter(Boolean),
  ])

  if (base && !emUso.has(base)) return base

  const partes = normalizarNome(nome)
    .split(' ')
    .filter(p => p && !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(p))
  for (let i = 2; i < partes.length; i++) {
    const alt = (partes[0] + partes[i]).toLowerCase()
    if (!emUso.has(alt)) return alt
  }
  let n = 2
  while (emUso.has(`${base}${n}`)) n++
  return `${base}${n}`
}

export interface ResultadoCriacao {
  id: string
  usuario: string
  senhaDefinida: boolean
}

/**
 * Cria o acesso do funcionário.
 *
 * Sem senha informada, a conta nasce com senha aleatória e
 * `senha_definida = false`: o funcionário define a própria senha no primeiro
 * acesso, informando apenas o usuário.
 */
export async function criarFuncionario(
  admin: SupabaseClient,
  dados: NovoFuncionario,
  reservados: Set<string> = new Set()
): Promise<{ ok: true; funcionario: ResultadoCriacao } | { ok: false; erro: string }> {
  const nome = dados.nome?.trim()
  if (!nome) return { ok: false, erro: 'Nome é obrigatório' }

  // O usuário sugerido pode já pertencer a outra pessoa (xarás em lojas
  // diferentes, por exemplo): nesse caso, gera um livre a partir do nome.
  const desejado = dados.usuario?.trim().toLowerCase()
  let usuario = desejado || (await gerarUsuarioDisponivel(admin, nome, reservados))

  if (desejado) {
    const { data: emUso } = await admin
      .from('profiles')
      .select('id')
      .eq('usuario', desejado)
      .maybeSingle()
    if (emUso || reservados.has(desejado)) {
      usuario = await gerarUsuarioDisponivel(admin, nome, reservados)
    }
  }

  const senhaDefinida = Boolean(dados.senha)
  const email = dados.email?.trim() || emailInterno(usuario)
  const senha = dados.senha || crypto.randomUUID()
  const cpf = dados.cpf ? String(dados.cpf).replace(/\D/g, '') : null

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: {
      nome,
      usuario,
      role: 'employee',
      cargo: dados.cargo ?? null,
      departamento: dados.departamento ?? null,
      empresa: dados.empresa ?? null,
      codigo_folha: dados.codigoFolha ?? null,
      cpf,
      senha_definida: senhaDefinida,
    },
  })

  if (authError || !authUser?.user) {
    return { ok: false, erro: authError?.message ?? 'Erro ao criar acesso' }
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: authUser.user.id,
    nome,
    usuario,
    cpf,
    cargo: dados.cargo ?? null,
    departamento: dados.departamento ?? null,
    empresa: dados.empresa ?? null,
    codigo_folha: dados.codigoFolha ?? null,
    role: 'employee',
    ativo: true,
    senha_definida: senhaDefinida,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    return { ok: false, erro: profileError.message }
  }

  return { ok: true, funcionario: { id: authUser.user.id, usuario, senhaDefinida } }
}
