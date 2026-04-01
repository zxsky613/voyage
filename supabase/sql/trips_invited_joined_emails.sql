-- Invités « rejoints » (compte créé + session) : utilisé pour les avatars dans l’app.
-- NULL sur invited_joined_emails = comportement historique (tous les invited_emails en avatar).
-- Tableau (vide ou non) = n’afficher en pastilles que ces e-mails parmi invited_emails.

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS invited_joined_emails text[];

COMMENT ON COLUMN public.trips.invited_joined_emails IS
  'Sous-ensemble de invited_emails ayant ouvert une session ; les autres restent invités (RLS) sans avatar.';

-- L’invité met à jour sa ligne sans policy UPDATE générale : SECURITY DEFINER + contrôle e-mail auth.
CREATE OR REPLACE FUNCTION public.mark_invitee_joined_for_me()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  n int := 0;
BEGIN
  SELECT lower(trim(u.email::text)) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_email IS NULL OR v_email = '' THEN RETURN 0; END IF;

  UPDATE public.trips t SET
    invited_joined_emails = CASE
      WHEN v_email = ANY (
        SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_joined_emails, ARRAY[]::text[])) AS x
      ) THEN t.invited_joined_emails
      WHEN t.invited_joined_emails IS NULL THEN ARRAY[v_email]::text[]
      ELSE t.invited_joined_emails || v_email::text
    END
  WHERE v_email = ANY (
    SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
  );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_invitee_joined_for_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_invitee_joined_for_me() TO authenticated;
