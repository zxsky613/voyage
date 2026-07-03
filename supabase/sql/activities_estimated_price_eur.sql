-- Estimation de prix par activité (EUR entier, 0 = gratuit).
-- Exécuter dans Supabase SQL Editor si la colonne n'existe pas encore.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS estimated_price_eur integer;

COMMENT ON COLUMN public.activities.estimated_price_eur IS
  'Coût estimé activité en EUR (0 = gratuit). Estimation jusqu''à remplacement par prix réservable (ex. GetYourGuide).';

-- Optionnel Phase 2 GetYourGuide :
-- ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS price_source text DEFAULT 'estimate';
-- COMMENT ON COLUMN public.activities.price_source IS 'estimate | getyourguide';
