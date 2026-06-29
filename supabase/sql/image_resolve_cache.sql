-- Cache mutualisé pour /api/images/resolve (Wikidata + kind).
-- Ne remplace PAS image_cache (legacy villes) — migration progressive.
-- Clé produit : (label_normalized, kind) — langue UI agnostique, pas de TTL.

DROP TABLE IF EXISTS public.image_resolve_cache;

CREATE TABLE public.image_resolve_cache (
  label_normalized TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hero', 'landmark', 'activity')),
  entity_id TEXT,
  image_url TEXT NOT NULL,
  source TEXT NOT NULL,
  author TEXT,
  license TEXT,
  license_url TEXT,
  source_url TEXT,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (label_normalized, kind)
);

CREATE INDEX IF NOT EXISTS idx_image_resolve_cache_entity_kind
  ON public.image_resolve_cache (entity_id, kind)
  WHERE entity_id IS NOT NULL;

COMMENT ON TABLE public.image_resolve_cache IS
  'Résolutions image mutualisées. Alimenté par /api/images/resolve.';

ALTER TABLE public.image_resolve_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS image_resolve_cache_select_anon ON public.image_resolve_cache;
CREATE POLICY image_resolve_cache_select_anon
  ON public.image_resolve_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);
