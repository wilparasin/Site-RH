export type UserRole = 'employee' | 'admin'

export interface Profile {
  id: string
  nome: string
  /** Login do funcionário: primeiro + segundo nome, em minúsculas. */
  usuario: string | null
  cpf: string | null
  cargo: string | null
  departamento: string | null
  /** Razão social da empresa que emite a folha. */
  empresa: string | null
  /** Código do funcionário na folha de pagamento, usado para casar os PDFs. */
  codigo_folha: string | null
  /** Falso enquanto o funcionário não criou a senha no primeiro acesso. */
  senha_definida: boolean
  role: UserRole
  ativo: boolean
  email?: string
  created_at: string
  updated_at: string
}

export interface ContraCheque {
  id: string
  funcionario_id: string
  mes: number
  ano: number
  storage_path: string
  nome_arquivo: string
  uploaded_by: string
  created_at: string
  funcionario?: Pick<Profile, 'id' | 'nome' | 'cpf' | 'usuario'>
}

export interface BancoHoras {
  id: string
  funcionario_id: string
  saldo_minutos: number
  periodo: string
  observacao: string | null
  upload_batch_id: string
  created_at: string
}

export interface BancoHorasUpload {
  id: string
  nome_arquivo: string
  periodo: string
  total_funcionarios: number
  uploaded_by: string
  created_at: string
}

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
