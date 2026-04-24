-- Indique si un e-mail est déjà inscrit (auth.users). Utilisé pour l’ouverture du lien
-- d’invitation : orienter l’hôte/invité vers la page de connexion plutôt que l’inscription.
-- Exécuter sur Supabase (SQL Editor) — peut permettre l’énumération d’e-mails existants
-- (comportement courant sur les formulaires de connexion).

CREATE OR REPLACE FUNCTION public.auth_email_has_account(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND lower(trim(u.email::text)) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.auth_email_has_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_email_has_account(text) TO anon, authenticated;
