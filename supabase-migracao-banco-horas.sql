-- ============================================================
-- PORTAL RH — Migração: banco de horas por mês
--
-- A planilha do RH traz três números por funcionário: o saldo ACUMULADO até
-- o mês anterior, o saldo do próprio mês e o TOTAL (a soma dos dois). Antes
-- só o total era guardado; estas colunas guardam a conta inteira, e o mês/ano
-- deixam o histórico em ordem mesmo quando as planilhas são importadas fora
-- de ordem.
--
-- Execute no SQL Editor do Supabase. É seguro rodar mais de uma vez.
-- ============================================================

-- 1. Novas colunas
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS acumulado_minutos INTEGER;
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS mes_minutos       INTEGER;
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS mes               INTEGER;
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS ano               INTEGER;
-- Nome como veio escrito na planilha, para conferência depois da importação.
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS nome_planilha     TEXT;

-- saldo_minutos passa a ser sempre o TOTAL do período.
COMMENT ON COLUMN public.banco_horas.saldo_minutos     IS 'Total do período (acumulado + mês), em minutos';
COMMENT ON COLUMN public.banco_horas.acumulado_minutos IS 'Saldo que vinha dos meses anteriores, em minutos';
COMMENT ON COLUMN public.banco_horas.mes_minutos       IS 'Saldo do próprio mês, em minutos';

-- 2. Um registro por funcionário e período: reimportar a planilha corrige o
--    saldo daquele mês em vez de criar uma linha repetida no histórico.
--    (Se der erro de duplicidade, rode antes o bloco 3 e tente de novo.)
CREATE UNIQUE INDEX IF NOT EXISTS banco_horas_funcionario_periodo
  ON public.banco_horas (funcionario_id, periodo);

-- 3. Limpeza de duplicados antigos — só é necessário se o índice acima falhar.
--    Mantém o registro mais recente de cada funcionário/período.
-- DELETE FROM public.banco_horas a
--  USING public.banco_horas b
--  WHERE a.funcionario_id = b.funcionario_id
--    AND a.periodo = b.periodo
--    AND a.created_at < b.created_at;

-- 4. Busca do histórico do funcionário
CREATE INDEX IF NOT EXISTS banco_horas_funcionario_ordem
  ON public.banco_horas (funcionario_id, ano DESC, mes DESC, created_at DESC);
