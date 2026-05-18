-- =============================================================================
-- Dépanne "Enregistrement refusé" / activités qui ne s'enregistrent pas
-- À exécuter dans Supabase : SQL Editor → New query → Run
-- =============================================================================
-- L'app insère dans public.activities avec trip_id, date, title, owner_id, etc.
-- Si RLS est activé sans politique adaptée, Postgres renvoie "permission denied"
-- ou "new row violates row-level security policy".
-- =============================================================================

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.trip_id_visible_to_requester(p_trip_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  u uuid := auth.uid();
  em text;
  tid text := NULLIF(trim(p_trip_id), '');
  has_owner_id boolean;
  has_invited_emails boolean;
  visible boolean := false;
BEGIN
  IF u IS NULL OR tid IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(trim(au.email::text)) INTO em FROM auth.users au WHERE au.id = u;
  IF em IS NULL OR em = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'trips'
      AND c.column_name = 'owner_id'
  ) INTO has_owner_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'trips'
      AND c.column_name = 'invited_emails'
  ) INTO has_invited_emails;

  IF has_owner_id AND has_invited_emails THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1
        FROM public.trips t
        WHERE t.id::text = $1
          AND (
            (t.owner_id IS NOT NULL AND t.owner_id::text = $2)
            OR $3 = ANY (
              SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
            )
          )
      )
    $q$ INTO visible USING tid, u::text, em;
  ELSIF has_owner_id THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1
        FROM public.trips t
        WHERE t.id::text = $1
          AND t.owner_id IS NOT NULL
          AND t.owner_id::text = $2
      )
    $q$ INTO visible USING tid, u::text;
  ELSIF has_invited_emails THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1
        FROM public.trips t
        WHERE t.id::text = $1
          AND $2 = ANY (
            SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
          )
      )
    $q$ INTO visible USING tid, em;
  END IF;

  RETURN COALESCE(visible, false);
END;
$$;

REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO service_role;

DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;
DROP POLICY IF EXISTS "activities_select_trip_members" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_trip_members" ON public.activities;
DROP POLICY IF EXISTS "activities_update_trip_members" ON public.activities;
DROP POLICY IF EXISTS "activities_delete_trip_members" ON public.activities;

CREATE POLICY "activities_select_trip_members"
ON public.activities FOR SELECT TO authenticated
USING (public.trip_id_visible_to_requester(trip_id::text));

CREATE POLICY "activities_insert_trip_members"
ON public.activities FOR INSERT TO authenticated
WITH CHECK (public.trip_id_visible_to_requester(trip_id::text));

CREATE POLICY "activities_update_trip_members"
ON public.activities FOR UPDATE TO authenticated
USING (public.trip_id_visible_to_requester(trip_id::text))
WITH CHECK (public.trip_id_visible_to_requester(trip_id::text));

CREATE POLICY "activities_delete_trip_members"
ON public.activities FOR DELETE TO authenticated
USING (public.trip_id_visible_to_requester(trip_id::text));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO authenticated;
GRANT ALL ON TABLE public.activities TO service_role;

-- Si vous utilisez le rôle anon avec une clé anon et sans login, décommentez :
-- DROP POLICY IF EXISTS "activities_allow_anon_all" ON public.activities;
-- CREATE POLICY "activities_allow_anon_all"
-- ON public.activities FOR ALL TO anon USING (true) WITH CHECK (true);

