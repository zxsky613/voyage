-- Coordonnées WGS84 des activités (planner / highlights → calendrier → carte).
-- Exécuter dans Supabase SQL Editor si les colonnes n'existent pas encore.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

COMMENT ON COLUMN public.activities.latitude IS
  'Latitude WGS84 (degrés décimaux), source planner ou highlights destination';

COMMENT ON COLUMN public.activities.longitude IS
  'Longitude WGS84 (degrés décimaux), source planner ou highlights destination';

CREATE INDEX IF NOT EXISTS activities_trip_coords_idx
  ON public.activities (trip_id)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
