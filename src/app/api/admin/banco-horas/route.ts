import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx'
import { parseExcelHours, normalizarNome } from '@/lib/utils'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

export async function POST(req: Request) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await req.formData()
  const arquivo = formData.get('arquivo') as File
  const periodo = (formData.get('periodo') as string)?.trim()
  const modo = formData.get('modo') as 'preview' | 'confirmar'

  if (!arquivo || !periodo) {
    return NextResponse.json({ error: 'Arquivo e período são obrigatórios' }, { status: 400 })
  }

  const bytes = await arquivo.arrayBuffer()
  let wb
  try {
    wb = xlsxRead(bytes, { type: 'buffer' })
  } catch {
    return NextResponse.json({ error: 'Arquivo inválido ou corrompido' }, { status: 400 })
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = xlsxUtils.sheet_to_json(ws, { defval: '' })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Planilha vazia ou sem dados reconhecíveis' }, { status: 400 })
  }

  function getField(row: Record<string, unknown>, ...names: string[]): string {
    for (const name of names) {
      const key = Object.keys(row).find(k =>
        k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() === name.toLowerCase()
      )
      if (key) return String(row[key] || '')
    }
    return ''
  }

  const admin = createAdminClient()
  const { data: funcionarios } = await admin
    .from('profiles')
    .select('id, nome, cpf, usuario')
    .eq('role', 'employee')
    .eq('ativo', true)

  const normalizeCPF = (m: string) => String(m).trim().replace(/^0+/, '').toLowerCase()

  // A planilha pode trazer CPF, matrícula, usuário ou o nome do funcionário
  const funcMap = new Map<string, { id: string; nome: string }>()
  for (const f of funcionarios || []) {
    if (f.cpf) funcMap.set(normalizeCPF(f.cpf), f)
    if (f.usuario) funcMap.set(String(f.usuario).toLowerCase(), f)
  }
  const funcPorNome = new Map((funcionarios || []).map(f => [normalizarNome(f.nome), f]))

  const previewRows = rows.map(row => {
    // Aceita colunas "CPF", "Matricula" ou "Mat" na planilha
    const cpf = getField(row, 'cpf', 'matricula', 'mat').trim()
    const nome = getField(row, 'nome', 'name', 'funcionario').trim()
    const saldo = getField(row, 'saldo', 'horas', 'banco', 'banco de horas', 'saldo horas')
    const saldo_minutos = parseExcelHours(saldo)
    const func =
      funcMap.get(normalizeCPF(cpf)) ??
      funcMap.get(cpf.toLowerCase()) ??
      (nome ? funcPorNome.get(normalizarNome(nome)) : undefined)
    return {
      cpf,
      nome: func?.nome || nome,
      saldo_minutos,
      periodo,
      encontrado: !!func,
      funcionario_id: func?.id,
    }
  }).filter(r => r.cpf)

  if (modo === 'preview') {
    return NextResponse.json({
      preview: previewRows.map(({ funcionario_id: _fid, ...rest }) => rest)
    })
  }

  const toInsert = previewRows.filter(r => r.encontrado)
  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'Nenhum funcionário da planilha foi encontrado no sistema' }, { status: 400 })
  }

  const batchId = crypto.randomUUID()

  const { error: uploadError } = await admin.from('banco_horas_uploads').insert({
    id: batchId,
    nome_arquivo: arquivo.name,
    periodo,
    total_funcionarios: toInsert.length,
    uploaded_by: user.id,
  })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: insertError } = await admin.from('banco_horas').insert(
    toInsert.map(r => ({
      funcionario_id: r.funcionario_id,
      saldo_minutos: r.saldo_minutos,
      periodo,
      upload_batch_id: batchId,
      uploaded_by: user.id,
    }))
  )

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const naoEncontrados = previewRows.filter(r => !r.encontrado).map(r => r.cpf)
  return NextResponse.json({ total: toInsert.length, naoEncontrados })
}
