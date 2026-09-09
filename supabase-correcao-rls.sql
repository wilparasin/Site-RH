-- ============================================================
-- PORTAL RH — Correção (opcional): recursão infinita no RLS
--
-- As políticas de profiles consultavam a própria tabela profiles para
-- descobrir se o usuário é admin, o que o Postgres rejeita com
-- "infinite recursion detected in policy for relation profiles".
-- Na prática, qualquer consulta feita com a chave pública falha — o portal
-- só funciona porque as telas usam a chave de serviço e conferem a permissão
-- no código.
--
-- A correção move a verificação para uma função SECURITY DEFINER, que roda
-- fora do RLS e por isso não recursiona. Não muda nada no comportamento do
-- portal; apenas devolve a proteção do banco como segunda barreira.
-- É seguro rodar mais de uma vez.
-- ============================================================

CREATE OR REPLACE FUNCTION public.e_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.e_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.e_admin() TO authenticated;

-- ── PROFILES ────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.e_admin());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.e_admin());

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT
  WITH CHECK (public.e_admin());

-- ── CONTRA CHEQUES ──────────────────────────────────────────
DROP POLICY IF EXISTS "cc_select" ON public.contra_cheques;
CREATE POLICY "cc_select" ON public.contra_cheques FOR SELECT
  USING (funcionario_id = auth.uid() OR public.e_admin());

DROP POLICY IF EXISTS "cc_insert_admin" ON public.contra_cheques;
CREATE POLICY "cc_insert_admin" ON public.contra_cheques FOR INSERT
  WITH CHECK (public.e_admin());

DROP POLICY IF EXISTS "cc_update_admin" ON public.contra_cheques;
CREATE POLICY "cc_update_admin" ON public.contra_cheques FOR UPDATE
  USING (public.e_admin());

DROP POLICY IF EXISTS "cc_delete_admin" ON public.contra_cheques;
CREATE POLICY "cc_delete_admin" ON public.contra_cheques FOR DELETE
  USING (public.e_admin());

-- ── BANCO DE HORAS ──────────────────────────────────────────
DROP POLICY IF EXISTS "bh_select" ON public.banco_horas;
CREATE POLICY "bh_select" ON public.banco_horas FOR SELECT
  USING (funcionario_id = auth.uid() OR public.e_admin());

DROP POLICY IF EXISTS "bh_insert_admin" ON public.banco_horas;
CREATE POLICY "bh_insert_admin" ON public.banco_horas FOR INSERT
  WITH CHECK (public.e_admin());

DROP POLICY IF EXISTS "bhu_select_admin" ON public.banco_horas_uploads;
CREATE POLICY "bhu_select_admin" ON public.banco_horas_uploads FOR SELECT
  USING (public.e_admin());

DROP POLICY IF EXISTS "bhu_insert_admin" ON public.banco_horas_uploads;
CREATE POLICY "bhu_insert_admin" ON public.banco_horas_uploads FOR INSERT
  WITH CHECK (public.e_admin());
