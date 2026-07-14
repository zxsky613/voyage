-- =============================================================================
-- HOTFIX — INSERT trips 403 via PostgREST (.select / RETURNING)
-- Cause : trips_member_select n'utilise que trip_member_can_access(id).
--         Lors d'INSERT...RETURNING, la ligne n'est pas encore lisible via
--         SELECT interne du helper → policy SELECT échoue → 42501.
-- Fix : court-circuit propriétaire sur la ligne (owner_id = auth.uid()) AVANT
--       le helper (invités inchangés).
-- =============================================================================

DROP POLICY IF EXISTS "trips_member_select" ON public.trips;

CREATE POLICY "trips_member_select" ON public.trips
  FOR SELECT TO authenticated
  USING (
    (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text)
    OR public.trip_member_can_access(id)
  );

-- Contrôle
SELECT policyname, permissive, cmd, qual::text AS qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'trips' AND cmd = 'SELECT';
