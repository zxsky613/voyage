-- =============================================================================
-- Dépanne "Enregistrement refusé" / activités qui ne s'enregistrent pas
-- À exécuter dans Supabase : SQL Editor → New query → Run
-- =============================================================================
-- L'app insère dans public.activities avec trip_id, date, title, owner_id, etc.
-- Si RLS est activé sans politique adaptée, Postgres renvoie "permission denied"
-- ou "new row violates row-level security policy".
-- =============================================================================

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Même contrôle que chat/votes : propriétaire du voyage ou e-mail invité.
-- Le bloc rend ce script autonome si chat_trip_member_access.sql n'a pas encore été exécuté.
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
DROP POLICY IF EXISTS "activities_select_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_update_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_delete_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_select" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_update" ON public.activities;
DROP POLICY IF EXISTS "activities_trip_member_delete" ON public.activities;

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

-- Si vous utilisez le rôle anon avec une clé anon et sans login, décommentez :
-- DROP POLICY IF EXISTS "activities_allow_anon_all" ON public.activities;
-- CREATE POLICY "activities_allow_anon_all"
-- ON public.activities FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Option plus stricte (remplacez la politique ci-dessus par ceci si vous voulez
-- limiter aux voyages dont vous êtes propriétaire). Adaptez le type de owner_id.
-- -----------------------------------------------------------------------------
/*
DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;

CREATE POLICY "activities_select_own_trips"
ON public.activities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);

CREATE POLICY "activities_insert_own_trips"
ON public.activities FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);

CREATE POLICY "activities_update_own_trips"
ON public.activities FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);

CREATE POLICY "activities_delete_own_trips"
ON public.activities FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);
*/
