-- Photo persistée par activité (URL + source résolution).
-- Exécuter dans Supabase SQL Editor si les colonnes n'existent pas encore.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_source TEXT;

COMMENT ON COLUMN public.activities.photo_url IS
  'URL image activité (TripAdvisor, Wikimedia, etc.) persistée à l''ajout au calendrier.';

COMMENT ON COLUMN public.activities.photo_source IS
  'Source photo : tripadvisor | foursquare | wikimedia | wikimedia_geo | placeholder.';
