-- Overrides manuels héros destination (forcer URL ou bannir des URLs pour une clé normalizeLabel).
-- Consulté EN PREMIER par /api/images/resolve (kind=hero).

CREATE TABLE IF NOT EXISTS public.hero_overrides (
  label_normalized TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'hero' CHECK (kind IN ('hero', 'landmark', 'activity')),
  forced_image_url TEXT,
  banned_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (label_normalized, kind)
);

CREATE INDEX IF NOT EXISTS idx_hero_overrides_forced
  ON public.hero_overrides (label_normalized)
  WHERE forced_image_url IS NOT NULL;

COMMENT ON TABLE public.hero_overrides IS
  'Overrides produit héros : forced_image_url prioritaire ; banned_urls ignorées par le resolver.';

ALTER TABLE public.hero_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hero_overrides_select_anon ON public.hero_overrides;
CREATE POLICY hero_overrides_select_anon
  ON public.hero_overrides
  FOR SELECT
  TO anon, authenticated
  USING (true);
