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
DROP POLICY IF EXISTS "activities_select_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_update_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_delete_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_select" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_update" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_delete" ON public.activities;

CREATE OR REPLACE FUNCTION public.trip_id_visible_to_requester(p_trip_id uuid)
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
  IF u IS NULL OR p_trip_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(trim(au.email::text)) INTO em FROM auth.users au WHERE au.id = u;
  IF em IS NULL OR em = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND (
        t.owner_id::text = u::text
        OR em = ANY (
            SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
          )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trip_id_visible_to_requester(p_trip_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  parsed uuid;
BEGIN
  BEGIN
    parsed := NULLIF(trim(p_trip_id), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;
  RETURN public.trip_id_visible_to_requester(parsed);
END;
$$;

REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO service_role;

CREATE POLICY "activities_trip_member_select" ON public.activities
  FOR SELECT TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activities_trip_member_insert" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activities_trip_member_update" ON public.activities
  FOR UPDATE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id))
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activities_trip_member_delete" ON public.activities
  FOR DELETE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO authenticated;
GRANT ALL ON TABLE public.activities TO service_role;
