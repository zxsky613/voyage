-- =============================================================================
-- Dépenses de groupe (style Tricount) — à exécuter dans Supabase : SQL Editor
-- =============================================================================
-- Chaque ligne : qui a payé, montant, partage entre quels participants (tableau).
-- L’app lit/écrit public.trip_expenses pour soldes et remboursements simplifiés.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_by text NOT NULL DEFAULT 'Moi',
  split_between text[] NOT NULL DEFAULT '{}',
  expense_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid
);

CREATE INDEX IF NOT EXISTS trip_expenses_trip_id_idx ON public.trip_expenses (trip_id);

ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_expenses_authenticated_all" ON public.trip_expenses;
CREATE POLICY "trip_expenses_authenticated_all"
ON public.trip_expenses
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
