-- =============================================================================
-- P0 — Isolation données par utilisateur (RLS membre voyage)
-- Exécuter dans Supabase → SQL Editor (projet unique = prod justtrip.fr).
-- Prérequis : tables trips, activities ; optionnel trip_expenses, chat_messages,
-- activity_votes (scripts trip_expenses.sql, chat_trip_member_access.sql).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper unique — SECURITY DEFINER évite la récursion RLS
-- (policy trips SELECT → helper → SELECT trips sans ré-appliquer RLS sur le
-- propriétaire postgres de la fonction).
-- Propriétaire : owner_id = auth.uid() (cast text des deux côtés).
-- Invité : email session ∈ invited_emails (normalisé).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trip_member_can_access(p_trip_id uuid)
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

  -- Propriétaire (même sans e-mail en auth.users)
  IF EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND t.owner_id IS NOT NULL
      AND t.owner_id::text = u::text
  ) THEN
    RETURN true;
  END IF;

  SELECT lower(trim(au.email::text)) INTO em
  FROM auth.users au
  WHERE au.id = u;

  IF em IS NULL OR em = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND em = ANY (
        SELECT lower(trim(x::text))
        FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trip_member_can_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_member_can_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_member_can_access(uuid) TO service_role;

-- Alias rétrocompat (chat_trip_member_access.sql, RPC externes) — une seule logique.
CREATE OR REPLACE FUNCTION public.trip_id_visible_to_requester(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.trip_member_can_access(p_trip_id);
$$;

REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- trips
-- -----------------------------------------------------------------------------
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips_member_select" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_insert" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_update" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_delete" ON public.trips;

CREATE POLICY "trips_member_select" ON public.trips
  FOR SELECT TO authenticated
  USING (
    (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text)
    OR public.trip_member_can_access(id)
  );

CREATE POLICY "trips_owner_insert" ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id IS NOT NULL
    AND owner_id::text = auth.uid()::text
  );

CREATE POLICY "trips_owner_update" ON public.trips
  FOR UPDATE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text)
  WITH CHECK (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text);

CREATE POLICY "trips_owner_delete" ON public.trips
  FOR DELETE TO authenticated
  USING (owner_id IS NOT NULL AND owner_id::text = auth.uid()::text);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trips TO authenticated;

-- -----------------------------------------------------------------------------
-- activities (remplace activities_allow_authenticated_all)
-- -----------------------------------------------------------------------------
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;
DROP POLICY IF EXISTS "activities_allow_anon_all" ON public.activities;
DROP POLICY IF EXISTS "activities_select_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_update_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_delete_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_member_select" ON public.activities;
DROP POLICY IF EXISTS "activities_member_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_member_update" ON public.activities;
DROP POLICY IF EXISTS "activities_member_delete" ON public.activities;

CREATE POLICY "activities_member_select" ON public.activities
  FOR SELECT TO authenticated
  USING (public.trip_member_can_access(trip_id));

CREATE POLICY "activities_member_insert" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.trip_member_can_access(trip_id));

CREATE POLICY "activities_member_update" ON public.activities
  FOR UPDATE TO authenticated
  USING (public.trip_member_can_access(trip_id))
  WITH CHECK (public.trip_member_can_access(trip_id));

CREATE POLICY "activities_member_delete" ON public.activities
  FOR DELETE TO authenticated
  USING (public.trip_member_can_access(trip_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.activities TO authenticated;

-- -----------------------------------------------------------------------------
-- trip_expenses (si table présente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trip_expenses'
  ) THEN
    ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "trip_expenses_authenticated_all" ON public.trip_expenses;
    DROP POLICY IF EXISTS "trip_expenses_member_select" ON public.trip_expenses;
    DROP POLICY IF EXISTS "trip_expenses_member_insert" ON public.trip_expenses;
    DROP POLICY IF EXISTS "trip_expenses_member_update" ON public.trip_expenses;
    DROP POLICY IF EXISTS "trip_expenses_member_delete" ON public.trip_expenses;

    CREATE POLICY "trip_expenses_member_select" ON public.trip_expenses
      FOR SELECT TO authenticated
      USING (public.trip_member_can_access(trip_id));

    CREATE POLICY "trip_expenses_member_insert" ON public.trip_expenses
      FOR INSERT TO authenticated
      WITH CHECK (public.trip_member_can_access(trip_id));

    CREATE POLICY "trip_expenses_member_update" ON public.trip_expenses
      FOR UPDATE TO authenticated
      USING (public.trip_member_can_access(trip_id))
      WITH CHECK (public.trip_member_can_access(trip_id));

    CREATE POLICY "trip_expenses_member_delete" ON public.trip_expenses
      FOR DELETE TO authenticated
      USING (public.trip_member_can_access(trip_id));

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_expenses TO authenticated;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- chat_messages — rebond sur helper corrigé (pas l'ancien corps bugué)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_messages'
  ) THEN
    ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "chat_messages_trip_member_select" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_messages_trip_member_insert" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_messages_trip_member_update" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_messages_trip_member_delete" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_messages_members" ON public.chat_messages;

    CREATE POLICY "chat_messages_trip_member_select" ON public.chat_messages
      FOR SELECT TO authenticated
      USING (public.trip_member_can_access(trip_id));

    CREATE POLICY "chat_messages_trip_member_insert" ON public.chat_messages
      FOR INSERT TO authenticated
      WITH CHECK (public.trip_member_can_access(trip_id));

    CREATE POLICY "chat_messages_trip_member_update" ON public.chat_messages
      FOR UPDATE TO authenticated
      USING (public.trip_member_can_access(trip_id))
      WITH CHECK (public.trip_member_can_access(trip_id));

    CREATE POLICY "chat_messages_trip_member_delete" ON public.chat_messages
      FOR DELETE TO authenticated
      USING (public.trip_member_can_access(trip_id));
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- activity_votes — rebond sur helper corrigé
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_votes'
  ) THEN
    ALTER TABLE public.activity_votes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "activity_votes_trip_member_select" ON public.activity_votes;
    DROP POLICY IF EXISTS "activity_votes_trip_member_insert" ON public.activity_votes;
    DROP POLICY IF EXISTS "activity_votes_trip_member_update" ON public.activity_votes;
    DROP POLICY IF EXISTS "activity_votes_trip_member_delete" ON public.activity_votes;
    DROP POLICY IF EXISTS "activity_votes_members" ON public.activity_votes;

    CREATE POLICY "activity_votes_trip_member_select" ON public.activity_votes
      FOR SELECT TO authenticated
      USING (public.trip_member_can_access(trip_id));

    CREATE POLICY "activity_votes_trip_member_insert" ON public.activity_votes
      FOR INSERT TO authenticated
      WITH CHECK (public.trip_member_can_access(trip_id));

    CREATE POLICY "activity_votes_trip_member_update" ON public.activity_votes
      FOR UPDATE TO authenticated
      USING (public.trip_member_can_access(trip_id))
      WITH CHECK (public.trip_member_can_access(trip_id));

    CREATE POLICY "activity_votes_trip_member_delete" ON public.activity_votes
      FOR DELETE TO authenticated
      USING (public.trip_member_can_access(trip_id));
  END IF;
END;
$$;

-- =============================================================================
-- ROLLBACK — décommenter et exécuter seul si recette 1-13 échoue (~30 s)
-- Restaure : pas de RLS trips + policies USING(true) activities/trip_expenses
-- + ancien helper trip_id_visible_to_requester (email avant owner = bug historique)
-- =============================================================================
/*
-- --- Ancien helper (comportement pré-migration) ---
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
  IF u IS NULL OR p_trip_id IS NULL THEN RETURN false; END IF;
  SELECT lower(trim(au.email::text)) INTO em FROM auth.users au WHERE au.id = u;
  IF em IS NULL OR em = '' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.trips t
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

DROP FUNCTION IF EXISTS public.trip_member_can_access(uuid);

-- --- trips : désactiver RLS ---
DROP POLICY IF EXISTS "trips_member_select" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_insert" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_update" ON public.trips;
DROP POLICY IF EXISTS "trips_owner_delete" ON public.trips;
ALTER TABLE public.trips DISABLE ROW LEVEL SECURITY;

-- --- activities : USING(true) ---
DROP POLICY IF EXISTS "activities_member_select" ON public.activities;
DROP POLICY IF EXISTS "activities_member_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_member_update" ON public.activities;
DROP POLICY IF EXISTS "activities_member_delete" ON public.activities;
CREATE POLICY "activities_allow_authenticated_all"
ON public.activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --- trip_expenses : USING(true) ---
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trip_expenses') THEN
    DROP POLICY IF EXISTS "trip_expenses_member_select" ON public.trip_expenses;
    DROP POLICY IF EXISTS "trip_expenses_member_insert" ON public.trip_expenses;
    DROP POLICY IF EXISTS "trip_expenses_member_update" ON public.trip_expenses;
    DROP POLICY IF EXISTS "trip_expenses_member_delete" ON public.trip_expenses;
    CREATE POLICY "trip_expenses_authenticated_all"
    ON public.trip_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- --- chat_messages / activity_votes : anciennes policies (helper rollback ci-dessus) ---
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_messages') THEN
    DROP POLICY IF EXISTS "chat_messages_trip_member_select" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_messages_trip_member_insert" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_messages_trip_member_update" ON public.chat_messages;
    DROP POLICY IF EXISTS "chat_messages_trip_member_delete" ON public.chat_messages;
    CREATE POLICY "chat_messages_trip_member_select" ON public.chat_messages
      FOR SELECT TO authenticated USING (public.trip_id_visible_to_requester(trip_id));
    CREATE POLICY "chat_messages_trip_member_insert" ON public.chat_messages
      FOR INSERT TO authenticated WITH CHECK (public.trip_id_visible_to_requester(trip_id));
    CREATE POLICY "chat_messages_trip_member_update" ON public.chat_messages
      FOR UPDATE TO authenticated
      USING (public.trip_id_visible_to_requester(trip_id))
      WITH CHECK (public.trip_id_visible_to_requester(trip_id));
    CREATE POLICY "chat_messages_trip_member_delete" ON public.chat_messages
      FOR DELETE TO authenticated USING (public.trip_id_visible_to_requester(trip_id));
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_votes') THEN
    DROP POLICY IF EXISTS "activity_votes_trip_member_select" ON public.activity_votes;
    DROP POLICY IF EXISTS "activity_votes_trip_member_insert" ON public.activity_votes;
    DROP POLICY IF EXISTS "activity_votes_trip_member_update" ON public.activity_votes;
    DROP POLICY IF EXISTS "activity_votes_trip_member_delete" ON public.activity_votes;
    CREATE POLICY "activity_votes_trip_member_select" ON public.activity_votes
      FOR SELECT TO authenticated USING (public.trip_id_visible_to_requester(trip_id));
    CREATE POLICY "activity_votes_trip_member_insert" ON public.activity_votes
      FOR INSERT TO authenticated WITH CHECK (public.trip_id_visible_to_requester(trip_id));
    CREATE POLICY "activity_votes_trip_member_update" ON public.activity_votes
      FOR UPDATE TO authenticated
      USING (public.trip_id_visible_to_requester(trip_id))
      WITH CHECK (public.trip_id_visible_to_requester(trip_id));
    CREATE POLICY "activity_votes_trip_member_delete" ON public.activity_votes
      FOR DELETE TO authenticated USING (public.trip_id_visible_to_requester(trip_id));
  END IF;
END;
$$;
*/
