-- Colonnes optionnelles pour lier une dépense à une activité ou un logement.
-- L’app fonctionne sans elles (repli sur le libellé) ; avec elles : sync planning ↔ budget sans doublon.

ALTER TABLE public.trip_expenses
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id text;

-- Index non unique historique (remplacé par l’unique partiel ci-dessous).
DROP INDEX IF EXISTS public.trip_expenses_source_idx;

-- Empêche les doublons sync planning ↔ budget (course auto-sync / re-entrées).
CREATE UNIQUE INDEX IF NOT EXISTS trip_expenses_source_uidx
  ON public.trip_expenses (trip_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL AND source_id <> '';
