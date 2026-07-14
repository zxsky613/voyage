-- =============================================================================
-- P0 HOTFIX prod — INSERT trips (403) + invited_joined_emails (400)
-- Ordre : (1) colonne + RPC mark_invitee, (2) policies INSERT trips manquantes
-- Exécuter en entier dans Supabase → SQL Editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (5) Colonne absente → 400 PGRST204 sur invited_joined_emails
-- -----------------------------------------------------------------------------
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS invited_joined_emails text[];

COMMENT ON COLUMN public.trips.invited_joined_emails IS
  'Sous-ensemble de invited_emails ayant ouvert une session ; les autres restent invités (RLS) sans avatar.';

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
GRANT EXECUTE ON FUNCTION public.mark_invitee_joined_for_me() TO service_role;

-- -----------------------------------------------------------------------------
-- (403) Policy INSERT absente après purge (trips_insert_owner_only supprimée,
-- trips_owner_insert jamais créée) → recréer les 4 policies canoniques
-- -----------------------------------------------------------------------------
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips_member_select" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_insert" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_update" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_delete" ON public.trips;

CREATE POLICY "trips_member_select" ON public.trips
  FOR SELECT TO authenticated
  USING (
    (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text)
    OR public.trip_member_can_access(id)
  );

CREATE POLICY "trips_owner_insert" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id IS NOT NULL
    AND owner_id::text = auth.uid()::text
  );

CREATE POLICY "trips_owner_update" ON public.trips
  FOR UPDATE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text)
  WITH CHECK (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text);

CREATE POLICY "trips_owner_delete" ON public.trips
  FOR DELETE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trips TO authenticated;

-- -----------------------------------------------------------------------------
-- Contrôle post-fix (INSERT policy doit exister ; 0 ligne permissive)
-- -----------------------------------------------------------------------------
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'trips'
ORDER BY cmd, policyname;

SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'trips'
  AND (
    lower(coalesce(qual::text, '')) IN ('true', '(true)')
    OR lower(coalesce(with_check::text, '')) IN ('true', '(true)')
    OR roles::text ILIKE '%anon%'
  );
