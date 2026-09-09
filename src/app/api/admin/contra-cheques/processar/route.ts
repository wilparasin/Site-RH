import { createClient, createAdminClient } from '@/lib/supabase/server'
import { carregarPdf, extrairPaginasPdf, MESES_EXTENSO } from '@/lib/contracheque-pdf'
import { criarFuncionario } from '@/lib/funcionarios-server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

const BUCKET = 'contra-cheques'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return null
  return user
}

interface ItemEnvio {
  chave: string
  nome: string
  paginas: number[]
  funcionarioId: string | null
  /**
   * Dados lidos do PDF. Criam o cadastro quando `funcionarioId` é nulo e,
   * para quem já existe, completam código da folha e empresa.
   */
  dados?: {
    nome: string
    usuario?: string
    cargo?: string | null
    departamento?: string | null
    empresa?: string | null
    codigoFolha?: string | null
  } | null
}

function nomeDoArquivo(usuarioOuNome: string, mes: number, ano: number): string {
  const mesExtenso = MESES_EXTENSO[mes - 1]
  const capitalizado = mesExtenso.charAt(0).toUpperCase() + mesExtenso.slice(1)
  return `${usuarioOuNome}-${capitalizado}${ano}.pdf`
}

/**
 * Divide o PDF do lote e envia o contra cheque de cada funcionário,
 * criando os cadastros que ainda não existem.
 */
export async function POST(req: Request) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const lotePath: string = body.lotePath
  const mes = Number(body.mes)
  const ano = Number(body.ano)
  const itens: ItemEnvio[] = Array.isArray(body.itens) ? body.itens : []
  // O envio vem em blocos; o PDF do lote só é descartado no último deles
  const finalizar: boolean = body.finalizar !== false

  if (!lotePath || !mes || !ano || itens.length === 0) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(lotePath)
  if (downloadError || !blob) {
    return NextResponse.json(
      { error: 'O arquivo do lote expirou. Selecione o PDF novamente.' },
      { status: 410 }
    )
  }

  const original = await carregarPdf(new Uint8Array(await blob.arrayBuffer()))

  const resultados: {
    chave: string
    nome: string
    status: 'enviado' | 'erro'
    usuario?: string
    criado?: boolean
    erro?: string
  }[] = []

  const usuariosReservados = new Set<string>()

  for (const item of itens) {
    try {
      let funcionarioId = item.funcionarioId
      let usuario: string | undefined
      let criado = false

      if (!funcionarioId && item.dados) {
        const criacao = await criarFuncionario(
          admin,
          {
            nome: item.dados.nome,
            usuario: item.dados.usuario,
            cargo: item.dados.cargo ?? null,
            departamento: item.dados.departamento ?? null,
            empresa: item.dados.empresa ?? null,
            codigoFolha: item.dados.codigoFolha ?? null,
          },
          usuariosReservados
        )
        if (!criacao.ok) {
          resultados.push({ chave: item.chave, nome: item.nome, status: 'erro', erro: criacao.erro })
          continue
        }
        funcionarioId = criacao.funcionario.id
        usuario = criacao.funcionario.usuario
        usuariosReservados.add(usuario)
        criado = true
      }

      if (!funcionarioId) {
        resultados.push({
          chave: item.chave,
          nome: item.nome,
          status: 'erro',
          erro: 'Funcionário não informado',
        })
        continue
      }

      if (!usuario) {
        const { data: perfil } = await admin
          .from('profiles')
          .select('usuario, codigo_folha, empresa')
          .eq('id', funcionarioId)
          .single()
        usuario = perfil?.usuario ?? undefined

        // Código da folha e empresa são guardados apenas como informação do
        // cadastro — não servem para casar o recibo com o funcionário, porque
        // o mesmo código aparece em filiais diferentes.
        const faltaCodigo = !perfil?.codigo_folha && item.dados?.codigoFolha
        const faltaEmpresa = !perfil?.empresa && item.dados?.empresa
        if (faltaCodigo || faltaEmpresa) {
          await admin
            .from('profiles')
            .update({
              codigo_folha: perfil?.codigo_folha ?? item.dados?.codigoFolha ?? null,
              empresa: perfil?.empresa ?? item.dados?.empresa ?? null,
            })
            .eq('id', funcionarioId)
        }
      }

      const pdfBytes = await extrairPaginasPdf(original, item.paginas)
      const nomeArquivo = nomeDoArquivo(usuario || item.nome.split(' ')[0].toLowerCase(), mes, ano)
      const storagePath = `${funcionarioId}/${ano}/${String(mes).padStart(2, '0')}/${crypto.randomUUID()}.pdf`

      const { error: storageError } = await admin.storage
        .from(BUCKET)
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })

      if (storageError) {
        resultados.push({
          chave: item.chave,
          nome: item.nome,
          status: 'erro',
          erro: storageError.message,
          criado,
        })
        continue
      }

      const { error: dbError } = await admin.from('contra_cheques').insert({
        funcionario_id: funcionarioId,
        mes,
        ano,
        storage_path: storagePath,
        nome_arquivo: nomeArquivo,
        uploaded_by: user.id,
      })

      if (dbError) {
        await admin.storage.from(BUCKET).remove([storagePath])
        resultados.push({
          chave: item.chave,
          nome: item.nome,
          status: 'erro',
          erro: dbError.message,
          criado,
        })
        continue
      }

      resultados.push({ chave: item.chave, nome: item.nome, status: 'enviado', usuario, criado })
    } catch (e) {
      resultados.push({
        chave: item.chave,
        nome: item.nome,
        status: 'erro',
        erro: e instanceof Error ? e.message : 'Erro inesperado',
      })
    }
  }

  if (finalizar) {
    // O PDF do lote não é mais necessário
    await admin.storage.from(BUCKET).remove([lotePath])
  }

  return NextResponse.json({
    enviados: resultados.filter(r => r.status === 'enviado').length,
    criados: resultados.filter(r => r.criado).length,
    erros: resultados.filter(r => r.status === 'erro').length,
    resultados,
  })
}
