-- Durée estimée de visite (minutes) — heure conseillée Pass 2 + export calendrier.
-- Appliquer dans Supabase SQL Editor (une fois).

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

COMMENT ON COLUMN public.activities.duration_minutes IS
  'Durée estimée de la visite en minutes (heure conseillée pipeline itinéraire).';
