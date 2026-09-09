import { createClient, createAdminClient } from '@/lib/supabase/server'
import { analisarPdf, normalizarNome } from '@/lib/contracheque-pdf'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

const BUCKET = 'contra-cheques'
const PASTA_LOTES = '_lotes'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

interface PerfilResumo {
  id: string
  nome: string
  usuario: string | null
  codigo_folha: string | null
  empresa: string | null
}

/**
 * Analisa um PDF com vários contra cheques: identifica os funcionários,
 * quais páginas pertencem a cada um e tenta casar com os cadastros.
 * O arquivo fica guardado temporariamente para a etapa de envio.
 */
export async function POST(req: Request) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await req.formData()
  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const bytes = new Uint8Array(await arquivo.arrayBuffer())

  let analise
  try {
    analise = await analisarPdf(bytes)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha ao ler o PDF'
    return NextResponse.json({ error: `Não foi possível ler o PDF: ${msg}` }, { status: 400 })
  }

  if (analise.grupos.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum contra cheque reconhecido neste PDF.' },
      { status: 422 }
    )
  }

  const admin = createAdminClient()
  const { data: perfis } = await admin
    .from('profiles')
    .select('id, nome, usuario, codigo_folha, empresa')
    .eq('role', 'employee')
    .eq('ativo', true)

  // O nome completo é o único dado confiável para casar o recibo com o
  // cadastro. O código da folha NÃO serve: ele se repete entre as filiais
  // (o código 7 é de uma pessoa na Loja 2 e de outra na Matriz), e a razão
  // social é a mesma nas duas — usá-lo entregaria o contra cheque ao colega.
  const lista = (perfis ?? []) as PerfilResumo[]
  const porNome = new Map<string, PerfilResumo[]>()
  for (const p of lista) {
    const chave = normalizarNome(p.nome)
    porNome.set(chave, [...(porNome.get(chave) ?? []), p])
  }

  const itens = analise.grupos.map(g => {
    const candidatos = porNome.get(normalizarNome(g.nome)) ?? []
    // Dois cadastros com o mesmo nome: ninguém é escolhido automaticamente
    const ambiguo = candidatos.length > 1
    const encontrado = candidatos.length === 1 ? candidatos[0] : null

    return {
      chave: g.chave,
      nome: g.nome,
      codigo: g.codigo,
      cargo: g.cargo,
      departamento: g.departamento,
      empresa: g.empresa,
      paginas: g.paginas,
      usuarioSugerido: g.usuarioSugerido,
      funcionarioId: encontrado?.id ?? null,
      funcionarioNome: encontrado?.nome ?? null,
      encontradoPor: encontrado ? ('nome' as const) : null,
      ambiguo,
    }
  })

  // Remove lotes antigos de análises que nunca chegaram a ser enviadas
  const { data: antigos } = await admin.storage.from(BUCKET).list(PASTA_LOTES, { limit: 100 })
  const limite = Date.now() - 24 * 60 * 60 * 1000
  const expirados = (antigos ?? [])
    .filter(o => o.created_at && new Date(o.created_at).getTime() < limite)
    .map(o => `${PASTA_LOTES}/${o.name}`)
  if (expirados.length > 0) await admin.storage.from(BUCKET).remove(expirados)

  // Guarda o PDF original para a etapa de divisão/envio
  const lotePath = `${PASTA_LOTES}/${crypto.randomUUID()}.pdf`
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(lotePath, bytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  return NextResponse.json({
    lotePath,
    nomeArquivo: arquivo.name,
    totalPaginas: analise.totalPaginas,
    mes: analise.mes,
    ano: analise.ano,
    paginasIgnoradas: analise.paginasIgnoradas,
    itens,
  })
}
