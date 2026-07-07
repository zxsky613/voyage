-- Mémoire de préférences inter-voyages (v1) — JSONB par utilisateur, RLS stricte.
--
-- Si erreur 40P01 (deadlock) : réessayer une fois l'app fermée, ou exécuter
-- bloc par bloc (séparer par les lignes "-- bloc N").
-- Cette version évite DROP POLICY (verrous AccessExclusive) : policies créées
-- seulement si absentes.

-- bloc 1 — table + colonnes
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  travel_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS travel_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- bloc 2 — index + RLS
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles (updated_at DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- bloc 3 — policies (idempotent, sans DROP)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own ON public.profiles
      FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_own'
  ) THEN
    CREATE POLICY profiles_insert_own ON public.profiles
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own ON public.profiles
      FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_delete_own'
  ) THEN
    CREATE POLICY profiles_delete_own ON public.profiles
      FOR DELETE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- bloc 4 — commentaire (optionnel)
COMMENT ON COLUMN public.profiles.travel_preferences IS
  'Mémoire inter-voyages : snapshots prefs + signaux comportementaux (pas d''identifiant dans les prompts LLM).';
