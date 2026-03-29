-- =============================================================================
-- Dépanne "Enregistrement refusé" / activités qui ne s'enregistrent pas
-- À exécuter dans Supabase : SQL Editor → New query → Run
-- =============================================================================
-- L'app insère dans public.activities avec trip_id, date, title, owner_id, etc.
-- Si RLS est activé sans politique adaptée, Postgres renvoie "permission denied"
-- ou "new row violates row-level security policy".
-- =============================================================================

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Politique simple (développement / petit projet) : tout utilisateur avec une
-- session Supabase (auth, y compris anonyme) peut lire/écrire les activités.
-- À remplacer plus tard par des politiques liées à trips.owner_id si besoin.
DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;
CREATE POLICY "activities_allow_authenticated_all"
ON public.activities
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Si vous utilisez le rôle anon avec une clé anon et sans login, décommentez :
-- DROP POLICY IF EXISTS "activities_allow_anon_all" ON public.activities;
-- CREATE POLICY "activities_allow_anon_all"
-- ON public.activities FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- Option plus stricte (remplacez la politique ci-dessus par ceci si vous voulez
-- limiter aux voyages dont vous êtes propriétaire). Adaptez le type de owner_id.
-- -----------------------------------------------------------------------------
/*
DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;

CREATE POLICY "activities_select_own_trips"
ON public.activities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);

CREATE POLICY "activities_insert_own_trips"
ON public.activities FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);

CREATE POLICY "activities_update_own_trips"
ON public.activities FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);

CREATE POLICY "activities_delete_own_trips"
ON public.activities FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.trips t
    WHERE t.id = activities.trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = auth.uid()::text
  )
);
*/
