-- =============================================================================
-- Dépenses de groupe (style Tricount) — à exécuter dans Supabase : SQL Editor
-- =============================================================================
-- Chaque ligne : qui a payé, montant, partage entre quels participants (tableau).
-- L’app lit/écrit public.trip_expenses pour soldes et remboursements simplifiés.
--
-- trip_id est volontairement sans FK dans le CREATE : si REFERENCES public.trips
-- échoue (table absente, id pas en uuid), tout le script s’arrêtait sans créer la table.
-- La contrainte est ajoutée ensuite seulement si c’est compatible.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_by text NOT NULL DEFAULT 'Moi',
  split_between text[] NOT NULL DEFAULT '{}',
  expense_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid
);

CREATE INDEX IF NOT EXISTS trip_expenses_trip_id_idx ON public.trip_expenses (trip_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'trips'
      AND c.column_name = 'id'
      AND c.data_type = 'uuid'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_expenses_trip_id_fkey'
  ) THEN
    ALTER TABLE public.trip_expenses
      ADD CONSTRAINT trip_expenses_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES public.trips (id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'trip_expenses FK ignorée: %', SQLERRM;
END $$;

ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_expenses_authenticated_all" ON public.trip_expenses;
CREATE POLICY "trip_expenses_authenticated_all"
ON public.trip_expenses
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Nécessaire pour l’API (clé anon + JWT) : sans ces GRANT, la table peut exister mais PostgREST renvoie une erreur.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_expenses TO authenticated;
GRANT ALL ON TABLE public.trip_expenses TO service_role;
