-- Profils publics des invités ayant rejoint (photo, prénom, initiales) pour l’affichage chez l’hôte.
-- Exécuter sur Supabase (SQL Editor) si ce fichier n’a pas encore été appliqué.
-- S’appuie sur auth.users (SECURITY DEFINER) — l’hôte ne voit que les comptes listés dans invited_joined_emails.
--
-- Corrige aussi mark_invitee_joined_for_me : append fiable (array_append) au lieu de || sur scalaire.

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
      ELSE array_append(COALESCE(t.invited_joined_emails, ARRAY[]::text[]), v_email)
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

CREATE OR REPLACE FUNCTION public.get_invitee_public_profiles_for_trip(p_trip_id uuid)
RETURNS TABLE (
  email text,
  avatar_url text,
  first_name text,
  last_name text,
  initials_avatar_bg text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  t public.trips%ROWTYPE;
  v_uid uuid := auth.uid();
  me_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO t FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT lower(trim(au.email::text)) INTO me_email FROM auth.users au WHERE au.id = v_uid;
  IF me_email IS NULL OR me_email = '' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT (
    t.owner_id IS NOT DISTINCT FROM v_uid
    OR me_email = ANY (
      SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    lower(trim(u.email::text))::text AS email,
    (NULLIF(trim(u.raw_user_meta_data->>'avatar_url'), ''))::text AS avatar_url,
    (NULLIF(trim(u.raw_user_meta_data->>'first_name'), ''))::text AS first_name,
    (NULLIF(trim(u.raw_user_meta_data->>'last_name'), ''))::text AS last_name,
    (NULLIF(trim(u.raw_user_meta_data->>'initials_avatar_bg'), ''))::text AS initials_avatar_bg
  FROM auth.users u
  WHERE lower(trim(u.email::text)) IN (
    SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_joined_emails, ARRAY[]::text[])) AS x
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invitee_public_profiles_for_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitee_public_profiles_for_trip(uuid) TO authenticated;
