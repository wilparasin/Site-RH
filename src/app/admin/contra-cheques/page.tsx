import { createAdminClient } from '@/lib/supabase/server'
import UploadContraCheque from '@/components/UploadContraCheque'

export default async function ContraChequesAdminPage() {
  const supabase = createAdminClient()

  const [
    { data: funcionarios },
    { data: contraCheques },
  ] = await Promise.all([
    supabase.from('profiles').select('id, nome, cpf, usuario').eq('role', 'employee').eq('ativo', true).order('nome'),
    supabase.from('contra_cheques').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Contra Cheques</h1>
        <p className="text-slate-500 text-sm mt-1">Faça upload dos PDFs para cada funcionário.</p>
      </div>

      <UploadContraCheque funcionarios={funcionarios ?? []} contraCheques={contraCheques ?? []} />
    </div>
  )
}
