-- =============================================================================
-- Dépanne "Enregistrement refusé" / activités qui ne s'enregistrent pas
-- À exécuter dans Supabase : SQL Editor → New query → Run
-- =============================================================================
-- L'app insère dans public.activities avec trip_id, date, title, owner_id, etc.
-- Si RLS est activé sans politique adaptée, Postgres renvoie "permission denied"
-- ou "new row violates row-level security policy".
-- =============================================================================

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

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
        t.owner_id IS NOT NULL AND t.owner_id = u
        OR em = ANY (
            SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
          )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO service_role;

DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;
DROP POLICY IF EXISTS "activities_select_trip_members" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_trip_members" ON public.activities;
DROP POLICY IF EXISTS "activities_update_trip_members" ON public.activities;
DROP POLICY IF EXISTS "activities_delete_trip_members" ON public.activities;

CREATE POLICY "activities_select_trip_members"
ON public.activities FOR SELECT TO authenticated
USING (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activities_insert_trip_members"
ON public.activities FOR INSERT TO authenticated
WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activities_update_trip_members"
ON public.activities FOR UPDATE TO authenticated
USING (public.trip_id_visible_to_requester(trip_id))
WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activities_delete_trip_members"
ON public.activities FOR DELETE TO authenticated
USING (public.trip_id_visible_to_requester(trip_id));
