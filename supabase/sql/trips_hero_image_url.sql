-- Photo héro figée par voyage (source de vérité durable).
-- Exécuter dans Supabase → SQL Editor avant déploiement client.

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS hero_image_url text;

COMMENT ON COLUMN public.trips.hero_image_url IS
  'URL HTTPS de la photo héro du voyage, figée à la première résolution réussie.';
