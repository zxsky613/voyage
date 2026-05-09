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

-- Même contrôle que chat/votes : propriétaire du voyage ou e-mail invité.
-- Le bloc rend ce script autonome si chat_trip_member_access.sql n'a pas encore été exécuté.
CREATE OR REPLACE FUNCTION public.trip_id_visible_to_requester(p_trip_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  u uuid := auth.uid();
  em text;
BEGIN
  IF u IS NULL OR p_trip_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(trim(au.email::text)) INTO em FROM auth.users au WHERE au.id = u;
  IF em IS NULL OR em = '' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND (
        t.owner_id IS NOT NULL AND t.owner_id = u
        OR em = ANY (
            SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
          )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO service_role;

DROP POLICY IF EXISTS "trip_expenses_authenticated_all" ON public.trip_expenses;
DROP POLICY IF EXISTS "trip_expenses_trip_member_select" ON public.trip_expenses;
DROP POLICY IF EXISTS "trip_expenses_trip_member_insert" ON public.trip_expenses;
DROP POLICY IF EXISTS "trip_expenses_trip_member_update" ON public.trip_expenses;
DROP POLICY IF EXISTS "trip_expenses_trip_member_delete" ON public.trip_expenses;

CREATE POLICY "trip_expenses_trip_member_select" ON public.trip_expenses
  FOR SELECT TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "trip_expenses_trip_member_insert" ON public.trip_expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "trip_expenses_trip_member_update" ON public.trip_expenses
  FOR UPDATE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id))
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "trip_expenses_trip_member_delete" ON public.trip_expenses
  FOR DELETE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

-- Nécessaire pour l’API (clé anon + JWT) : sans ces GRANT, la table peut exister mais PostgREST renvoie une erreur.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_expenses TO authenticated;
GRANT ALL ON TABLE public.trip_expenses TO service_role;
