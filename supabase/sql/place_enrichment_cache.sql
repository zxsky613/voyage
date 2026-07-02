-- Cache enrichissement lieux (TripAdvisor / Foursquare) pour verify-itinerary & generate-itinerary.
-- TTL applicatif : 30 jours (filtré à la lecture côté serveur).

DROP TABLE IF EXISTS public.place_enrichment_cache;

CREATE TABLE public.place_enrichment_cache (
  place_name_normalized TEXT NOT NULL,
  city_normalized TEXT NOT NULL DEFAULT '',
  location_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('verified', 'partial', 'unverified')),
  source TEXT NOT NULL,
  rating NUMERIC(3, 2),
  num_reviews INT,
  trip_types JSONB,
  price_level INT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  tripadvisor_url TEXT,
  photo_urls JSONB,
  raw_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (place_name_normalized, city_normalized)
);

CREATE INDEX IF NOT EXISTS idx_place_enrichment_cache_updated
  ON public.place_enrichment_cache (updated_at DESC);

COMMENT ON TABLE public.place_enrichment_cache IS
  'Métadonnées lieux (pas de texte d''avis). Alimenté par /api/planner/verify-itinerary.';

ALTER TABLE public.place_enrichment_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS place_enrichment_cache_select_anon ON public.place_enrichment_cache;
CREATE POLICY place_enrichment_cache_select_anon
  ON public.place_enrichment_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);
