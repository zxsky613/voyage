-- Source des coordonnées des activités (cascade planner) :
--   'tripadvisor' : coords précises du catalogue TripAdvisor (vérifié, badge ★)
--   'foursquare'  : Places API Foursquare (fsq_id + coords)
--   'geocoded'    : géocodage Nominatim/OSM
--   'estimated'   : estimation LLM (marqueur atténué sur la carte)
-- Exécuter dans Supabase SQL Editor si la colonne n'existe pas encore.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS coords_source text;

-- Contrainte à jour (si l'ancienne CHECK existe déjà, exécuter activities_coords_source_foursquare.sql).
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_coords_source_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_coords_source_check
  CHECK (coords_source IS NULL OR coords_source IN ('tripadvisor', 'foursquare', 'geocoded', 'estimated'));

COMMENT ON COLUMN public.activities.coords_source IS
  'Provenance des coords lat/long : tripadvisor | foursquare | geocoded (Nominatim) | estimated (LLM)';
