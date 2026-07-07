-- Verdicts juge vision héros (Gemini) — 1 appel / URL+destination, réutilisé à vie.
CREATE TABLE IF NOT EXISTS public.hero_vision_cache (
  cache_key TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  destination_label TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL CHECK (verdict IN ('excellent', 'acceptable', 'reject')),
  shows TEXT,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  cold_suspicion INT,
  policy TEXT,
  model TEXT,
  judged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hero_vision_cache_dest
  ON public.hero_vision_cache (destination_label);

COMMENT ON TABLE public.hero_vision_cache IS
  'Cache verdicts vision LLM pour bandeaux héros — évite re-juger la même image.';

ALTER TABLE public.hero_vision_cache ENABLE ROW LEVEL SECURITY;
