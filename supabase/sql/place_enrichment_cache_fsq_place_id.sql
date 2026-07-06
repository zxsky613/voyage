-- fsq_place_id pour la cascade photos (GET /places/{id}/photos).
ALTER TABLE public.place_enrichment_cache
  ADD COLUMN IF NOT EXISTS fsq_place_id TEXT;

COMMENT ON COLUMN public.place_enrichment_cache.fsq_place_id IS
  'Foursquare fsq_place_id — requis pour récupérer les photos sans re-search';
