-- Cache liste highlights par destination (TTL 7 j côté serveur).
-- Exécuter dans Supabase SQL Editor si la table n'existe pas.

CREATE TABLE IF NOT EXISTS public.destination_highlights_cache (
  cache_key text PRIMARY KEY,
  destination_label text NOT NULL DEFAULT '',
  ui_lang text NOT NULL DEFAULT 'fr',
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  trip_advisor_calls integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS destination_highlights_cache_updated_idx
  ON public.destination_highlights_cache (updated_at DESC);

COMMENT ON TABLE public.destination_highlights_cache IS
  'Liste suggest-highlights par destination+langue — réutilise enrichissement lieux en amont.';

-- Accès réservé au service role (API /api/planner/suggest-highlights). Pas de policy anon/authenticated.
ALTER TABLE public.destination_highlights_cache ENABLE ROW LEVEL SECURITY;
