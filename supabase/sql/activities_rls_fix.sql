-- =============================================================================
-- Dépanne "Enregistrement refusé" / activités qui ne s'enregistrent pas
-- À exécuter dans Supabase : SQL Editor → New query → Run
-- =============================================================================
-- L'app insère dans public.activities avec trip_id, date, title, owner_id, etc.
-- Si RLS est activé sans politique adaptée, Postgres renvoie "permission denied"
-- ou "new row violates row-level security policy".
-- =============================================================================

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_select" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_update" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_delete" ON public.activities;

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
BEGIN
  IF u IS NULL OR p_trip_id IS NULL OR trim(p_trip_id) = '' THEN
    RETURN false;
  END IF;

  SELECT lower(trim(au.email::text)) INTO em FROM auth.users au WHERE au.id = u;

  RETURN EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id::text = trim(p_trip_id)
      AND (
        (t.owner_id IS NOT NULL AND t.owner_id::text = u::text)
        OR (
          em IS NOT NULL AND em <> ''
          AND em = ANY (
            SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
          )
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO service_role;

CREATE POLICY "activities_trip_member_select" ON public.activities
  FOR SELECT TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id::text));

CREATE POLICY "activities_trip_member_insert" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.trip_id_visible_to_requester(trip_id::text));

CREATE POLICY "activities_trip_member_update" ON public.activities
  FOR UPDATE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id::text))
  WITH CHECK (public.trip_id_visible_to_requester(trip_id::text));

CREATE POLICY "activities_trip_member_delete" ON public.activities
  FOR DELETE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id::text));

-- Le rôle anon n'a volontairement aucune politique : l'app utilise des sessions
-- Supabase authentifiées (y compris anonymes) pour que auth.uid() soit disponible.
