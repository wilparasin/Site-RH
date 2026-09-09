// Remove funcionários pelo usuário de acesso, junto com os contra cheques deles.
// Útil para desfazer um teste de importação.
//
// Uso: node scripts/remover-funcionarios.mjs alexpereira anaclara
//      node scripts/remover-funcionarios.mjs --competencia 7/2026   (só apaga os contra cheques do mês)
import { createClient } from '@supabase/supabase-js'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  .split('\n')
  .filter(l => l && !l.startsWith('#'))
  .reduce((acc, line) => {
    const [k, ...v] = line.split('=')
    acc[k.trim()] = v.join('=').trim()
    return acc
  }, {})

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const idxCompetencia = args.indexOf('--competencia')
const competencia = idxCompetencia >= 0 ? args[idxCompetencia + 1] : null
const usuarios = args.filter((a, i) => !a.startsWith('--') && i !== idxCompetencia + 1)

if (!competencia && usuarios.length === 0) {
  console.error('\nInforme os usuários a remover, ou --competencia M/AAAA para apagar só os contra cheques.\n')
  console.error('  node scripts/remover-funcionarios.mjs alexpereira anaclara')
  console.error('  node scripts/remover-funcionarios.mjs --competencia 7/2026\n')
  process.exit(1)
}

const rl = readline.createInterface({ input, output })

// ── Apagar apenas os contra cheques de uma competência ──
if (competencia) {
  const [mes, ano] = competencia.split('/').map(Number)
  if (!mes || !ano) {
    console.error('Competência inválida. Use o formato M/AAAA, por exemplo 7/2026.')
    process.exit(1)
  }

  const { data: ccs } = await supabase
    .from('contra_cheques')
    .select('id, storage_path, funcionario_id')
    .eq('mes', mes)
    .eq('ano', ano)

  if (!ccs?.length) {
    console.log(`\nNenhum contra cheque de ${mes}/${ano} encontrado.\n`)
    rl.close()
    process.exit(0)
  }

  console.log(`\n${ccs.length} contra cheque(s) de ${mes}/${ano} serão apagados (os cadastros permanecem).`)
  const ok = await rl.question('Confirma? (digite SIM) ')
  rl.close()
  if (ok.trim().toUpperCase() !== 'SIM') {
    console.log('Cancelado.')
    process.exit(0)
  }

  await supabase.storage.from('contra-cheques').remove(ccs.map(c => c.storage_path))
  const { error } = await supabase.from('contra_cheques').delete().eq('mes', mes).eq('ano', ano)
  console.log(error ? `\n❌ ${error.message}\n` : `\n✅ ${ccs.length} contra cheque(s) removido(s).\n`)
  process.exit(error ? 1 : 0)
}

// ── Remover funcionários ──
const { data: perfis } = await supabase
  .from('profiles')
  .select('id, nome, usuario, role')
  .in('usuario', usuarios)

const encontrados = (perfis ?? []).filter(p => p.role !== 'admin')
const naoEncontrados = usuarios.filter(u => !encontrados.some(p => p.usuario === u))

if (encontrados.length === 0) {
  console.log('\nNenhum funcionário encontrado com esses usuários.\n')
  rl.close()
  process.exit(0)
}

console.log('\nSerão removidos (cadastro + contra cheques + banco de horas):\n')
for (const p of encontrados) {
  const { count } = await supabase
    .from('contra_cheques')
    .select('*', { count: 'exact', head: true })
    .eq('funcionario_id', p.id)
  console.log(`  ${p.usuario.padEnd(24)} ${p.nome}  (${count ?? 0} contra cheque(s))`)
}
if (naoEncontrados.length) console.log(`\nNão encontrados: ${naoEncontrados.join(', ')}`)

const resposta = await rl.question('\nConfirma a remoção? (digite SIM) ')
rl.close()

if (resposta.trim().toUpperCase() !== 'SIM') {
  console.log('Cancelado.')
  process.exit(0)
}

let removidos = 0
for (const p of encontrados) {
  const { data: ccs } = await supabase
    .from('contra_cheques')
    .select('storage_path')
    .eq('funcionario_id', p.id)

  if (ccs?.length) {
    await supabase.storage.from('contra-cheques').remove(ccs.map(c => c.storage_path))
  }

  // Apagar o usuário do auth remove o perfil e os registros em cascata
  const { error } = await supabase.auth.admin.deleteUser(p.id)
  if (error) {
    console.error(`  ❌ ${p.usuario}: ${error.message}`)
    continue
  }
  removidos++
}

console.log(`\n✅ ${removidos} funcionário(s) removido(s).\n`)
