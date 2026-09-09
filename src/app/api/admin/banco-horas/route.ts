import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { read as xlsxRead } from 'xlsx'
import {
  lerPlanilhaBancoHoras,
  casarPorNome,
  interpretarPeriodo,
  type Correspondencia,
  type FuncionarioResumo,
} from '@/lib/banco-horas'

export const runtime = 'nodejs'

const AVISO_MIGRACAO =
  'O banco ainda não tem as colunas do banco de horas por mês. ' +
  'Rode supabase-migracao-banco-horas.sql no SQL Editor do Supabase e importe de novo.'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

/** Erro típico de quem ainda não rodou a migração das novas colunas. */
function faltaMigracao(erro: { code?: string; message?: string }): boolean {
  const msg = (erro.message ?? '').toLowerCase()
  return (
    erro.code === 'PGRST204' ||
    erro.code === '42703' ||
    erro.code === '42P10' ||
    msg.includes('acumulado_minutos') ||
    msg.includes('mes_minutos') ||
    msg.includes('nome_planilha') ||
    msg.includes('no unique or exclusion constraint')
  )
}

/**
 * Importa a planilha de banco de horas.
 *
 * O funcionário é identificado só pelo nome (a planilha traz o primeiro nome),
 * e de cada linha saem três números: o saldo acumulado até o mês anterior, o
 * saldo do mês e o total. Em `preview` nada é gravado — a resposta traz o que
 * casou, o que ficou em dúvida e a lista de funcionários para o admin
 * escolher à mão. Em `confirmar` os saldos são gravados, um registro por
 * funcionário e período (reimportar o mesmo mês corrige o que estava lá).
 */
export async function POST(req: Request) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await req.formData()
  const arquivo = formData.get('arquivo') as File | null
  const periodoInformado = (formData.get('periodo') as string | null)?.trim() || ''
  const modo = (formData.get('modo') as 'preview' | 'confirmar') ?? 'preview'

  if (!arquivo) return NextResponse.json({ error: 'Selecione a planilha.' }, { status: 400 })

  const bytes = await arquivo.arrayBuffer()
  let planilha
  try {
    const wb = xlsxRead(bytes, { type: 'buffer', cellNF: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    planilha = lerPlanilhaBancoHoras(ws, arquivo.name)
  } catch {
    return NextResponse.json({ error: 'Arquivo inválido ou corrompido.' }, { status: 400 })
  }

  if (planilha.linhas.length === 0) {
    return NextResponse.json(
      {
        error:
          'Não encontrei os saldos na planilha. Ela precisa de uma linha de cabeçalho com ' +
          'FUNCIONÁRIO e as colunas ACUMULADO, o mês e TOTAL.',
      },
      { status: 400 }
    )
  }

  const periodo = periodoInformado || planilha.periodo
  if (!periodo) {
    return NextResponse.json(
      { error: 'Não consegui identificar o mês da planilha. Informe o período à mão.' },
      { status: 400 }
    )
  }

  // Mês e ano deixam o histórico do funcionário em ordem mesmo quando as
  // planilhas são importadas fora de sequência.
  const referencia = periodoInformado ? interpretarPeriodo(periodoInformado) : null
  const mesReferencia = periodoInformado ? referencia?.mes ?? null : planilha.mes
  const anoReferencia = periodoInformado ? referencia?.ano ?? null : planilha.ano

  const admin = createAdminClient()
  const { data: perfis } = await admin
    .from('profiles')
    .select('id, nome, usuario')
    .eq('role', 'employee')
    .eq('ativo', true)
    .order('nome')

  const funcionarios = (perfis ?? []) as FuncionarioResumo[]
  const correspondencias = casarPorNome(planilha.linhas, funcionarios)

  // O admin pode corrigir o casamento na tela de conferência: a chave é o
  // número da linha da planilha, que não muda entre a prévia e o envio.
  const mapeamentoBruto = formData.get('mapeamento') as string | null
  let mapeamento: Record<string, string> = {}
  if (mapeamentoBruto) {
    try {
      mapeamento = JSON.parse(mapeamentoBruto)
    } catch {
      return NextResponse.json({ error: 'Correções inválidas.' }, { status: 400 })
    }
  }

  const porId = new Map(funcionarios.map(f => [f.id, f]))
  const escolhidas: (Correspondencia & { ignorado: boolean })[] = correspondencias.map(c => {
    const escolha = mapeamento[String(c.linha)]
    if (escolha === 'ignorar') return { ...c, funcionario: null, ignorado: true }
    if (escolha && porId.has(escolha)) {
      return { ...c, funcionario: porId.get(escolha)!, status: 'ok', ignorado: false }
    }
    return { ...c, ignorado: false }
  })

  // Saldos já gravados neste período: reimportar substitui, e é bom o admin
  // ver isso antes (a mesma pessoa pode aparecer em planilhas de duas lojas).
  const idsCasados = escolhidas.map(c => c.funcionario?.id).filter(Boolean) as string[]
  const jaGravados = new Map<string, number>()
  if (idsCasados.length > 0) {
    const { data: existentes } = await admin
      .from('banco_horas')
      .select('funcionario_id, saldo_minutos')
      .eq('periodo', periodo)
      .in('funcionario_id', idsCasados)
    for (const r of existentes ?? []) jaGravados.set(r.funcionario_id, r.saldo_minutos)
  }

  if (modo === 'preview') {
    return NextResponse.json({
      periodo,
      periodoDetectado: planilha.periodo,
      mes: planilha.mes,
      ano: planilha.ano,
      rotuloMes: planilha.rotuloMes,
      nomeArquivo: arquivo.name,
      funcionarios,
      linhas: escolhidas.map(c => ({
        linha: c.linha,
        nome: c.nome,
        acumuladoMinutos: c.acumuladoMinutos,
        mesMinutos: c.mesMinutos,
        totalMinutos: c.totalMinutos,
        observacao: c.observacao,
        status: c.ignorado ? 'ignorado' : c.status,
        funcionarioId: c.funcionario?.id ?? null,
        funcionarioNome: c.funcionario?.nome ?? null,
        candidatos: c.candidatos.map(x => ({ id: x.id, nome: x.nome })),
        jaImportado: c.funcionario ? jaGravados.get(c.funcionario.id) ?? null : null,
      })),
    })
  }

  const paraGravar = escolhidas.filter(c => c.funcionario && !c.ignorado)
  if (paraGravar.length === 0) {
    return NextResponse.json(
      { error: 'Nenhuma linha da planilha está ligada a um funcionário.' },
      { status: 400 }
    )
  }

  // Duas linhas apontando para a mesma pessoa deixariam o saldo do mês
  // indefinido — o admin precisa escolher qual vale.
  const repetidos = paraGravar
    .map(c => c.funcionario!.nome)
    .filter((nome, i, todos) => todos.indexOf(nome) !== i)
  if (repetidos.length > 0) {
    return NextResponse.json(
      {
        error:
          'Mais de uma linha da planilha está ligada ao mesmo funcionário: ' +
          `${[...new Set(repetidos)].join(', ')}. Ajuste a escolha antes de importar.`,
      },
      { status: 400 }
    )
  }

  const batchId = crypto.randomUUID()
  const agora = new Date().toISOString()

  const { error: erroSaldos } = await admin.from('banco_horas').upsert(
    paraGravar.map(c => ({
      funcionario_id: c.funcionario!.id,
      saldo_minutos: c.totalMinutos,
      acumulado_minutos: c.acumuladoMinutos,
      mes_minutos: c.mesMinutos,
      periodo,
      mes: mesReferencia,
      ano: anoReferencia,
      observacao: c.observacao,
      nome_planilha: c.nome,
      upload_batch_id: batchId,
      uploaded_by: user.id,
      // Reimportar o mês atualiza a data que o funcionário vê como "atualizado em".
      created_at: agora,
    })),
    { onConflict: 'funcionario_id,periodo' }
  )

  if (erroSaldos) {
    const msg = faltaMigracao(erroSaldos) ? AVISO_MIGRACAO : erroSaldos.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { error: erroUpload } = await admin.from('banco_horas_uploads').insert({
    id: batchId,
    nome_arquivo: arquivo.name,
    periodo,
    total_funcionarios: paraGravar.length,
    uploaded_by: user.id,
  })

  if (erroUpload) return NextResponse.json({ error: erroUpload.message }, { status: 500 })

  return NextResponse.json({
    total: paraGravar.length,
    periodo,
    naoImportados: escolhidas
      .filter(c => !c.funcionario || c.ignorado)
      .map(c => ({ nome: c.nome, status: c.ignorado ? 'ignorado' : c.status })),
  })
}
