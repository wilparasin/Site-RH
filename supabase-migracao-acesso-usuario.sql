-- ============================================================
-- PORTAL RH — Migração: acesso por USUÁRIO + senha no 1º acesso
-- Execute este arquivo no SQL Editor do Supabase.
-- É seguro rodar mais de uma vez.
-- ============================================================

-- 1. Novas colunas em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS usuario        TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS senha_definida BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS codigo_folha   TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS empresa        TEXT;

-- 2. O CPF deixa de ser obrigatório (o acesso passa a ser pelo usuário)
ALTER TABLE public.profiles ALTER COLUMN cpf DROP NOT NULL;

-- 3. Usuário é único (quando preenchido)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_usuario_unico
  ON public.profiles (usuario) WHERE usuario IS NOT NULL;

-- 4. Trigger de criação de perfil: passa a gravar usuario/senha_definida
--    e não força mais um CPF artificial.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, nome, cpf, usuario, cargo, departamento, empresa, codigo_folha, role, senha_definida
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    NULLIF(NEW.raw_user_meta_data->>'cpf', ''),
    NULLIF(NEW.raw_user_meta_data->>'usuario', ''),
    NULLIF(NEW.raw_user_meta_data->>'cargo', ''),
    NULLIF(NEW.raw_user_meta_data->>'departamento', ''),
    NULLIF(NEW.raw_user_meta_data->>'empresa', ''),
    NULLIF(NEW.raw_user_meta_data->>'codigo_folha', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee'),
    COALESCE((NEW.raw_user_meta_data->>'senha_definida')::BOOLEAN, TRUE)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. Quem já existe continua entrando com e-mail/CPF e a senha atual
UPDATE public.profiles SET senha_definida = TRUE WHERE senha_definida IS NULL;
