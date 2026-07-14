-- =============================================================================
-- P0 RLS — Purge policies permissives / redondantes (prod)
-- Cause : policies USING(true) ou anon coexistent avec les policies membre ;
-- en Postgres les policies d'une même opération se combinent en OR → fuite.
-- Prérequis : rls_trip_member_isolation.sql déjà appliqué (policies membre OK).
-- Exécuter dans Supabase → SQL Editor. Puis requête de contrôle en fin de fichier.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Audit AVANT (lecture seule — optionnel)
-- -----------------------------------------------------------------------------
-- SELECT tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('trips','activities','trip_expenses','chat_messages','activity_votes')
-- ORDER BY tablename, cmd, policyname;

-- -----------------------------------------------------------------------------
-- 1) trips — DROP explicites (fantômes connus + variantes historiques)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "trips_all_public" ON public.trips;
DROP POLICY IF EXISTS "trips_select_if_member" ON public.trips;
DROP POLICY IF EXISTS "trips_insert_owner_only" ON public.trips;
DROP POLICY IF EXISTS "trips_update_owner_only" ON public.trips;
DROP POLICY IF EXISTS "trips_delete_owner_only" ON public.trips;
DROP POLICY IF EXISTS "trips_authenticated_all" ON public.trips;
DROP POLICY IF EXISTS "trips_allow_authenticated_all" ON public.trips;
DROP POLICY IF EXISTS "trips_allow_anon_all" ON public.trips;
DROP POLICY IF EXISTS "trips_public_all" ON public.trips;
DROP POLICY IF EXISTS "trips_select_public" ON public.trips;
DROP POLICY IF EXISTS "trips_all" ON public.trips;

-- Whitelist stricte : ne garder QUE les 4 policies membre
DO $$
DECLARE
  r record;
  allowed text[] := ARRAY[
    'trips_member_select',
    'trips_owner_insert',
    'trips_owner_update',
    'trips_owner_delete'
  ];
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trips'
      AND NOT (policyname = ANY (allowed))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.trips', r.policyname);
    RAISE NOTICE 'trips: dropped %', r.policyname;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) activities — DROP explicites
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "activities_allow_authenticated_all" ON public.activities;
DROP POLICY IF EXISTS "activities_allow_anon_all" ON public.activities;
DROP POLICY IF EXISTS "activities_authenticated_all" ON public.activities;
DROP POLICY IF EXISTS "activities_public_all" ON public.activities;
DROP POLICY IF EXISTS "activities_all_public" ON public.activities;
DROP POLICY IF EXISTS "activities_select_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_update_own_trips" ON public.activities;
DROP POLICY IF EXISTS "activities_delete_own_trips" ON public.activities;

DO $$
DECLARE
  r record;
  allowed text[] := ARRAY[
    'activities_member_select',
    'activities_member_insert',
    'activities_member_update',
    'activities_member_delete'
  ];
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activities'
      AND NOT (policyname = ANY (allowed))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activities', r.policyname);
    RAISE NOTICE 'activities: dropped %', r.policyname;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) trip_expenses — DROP explicites (si table présente)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  allowed text[] := ARRAY[
    'trip_expenses_member_select',
    'trip_expenses_member_insert',
    'trip_expenses_member_update',
    'trip_expenses_member_delete'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trip_expenses'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "trip_expenses_authenticated_all" ON public.trip_expenses';
  EXECUTE 'DROP POLICY IF EXISTS "trip_expenses_allow_authenticated_all" ON public.trip_expenses';
  EXECUTE 'DROP POLICY IF EXISTS "trip_expenses_allow_anon_all" ON public.trip_expenses';
  EXECUTE 'DROP POLICY IF EXISTS "trip_expenses_public_all" ON public.trip_expenses';
  EXECUTE 'DROP POLICY IF EXISTS "trip_expenses_all_public" ON public.trip_expenses';

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_expenses'
      AND NOT (policyname = ANY (allowed))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.trip_expenses', r.policyname);
    RAISE NOTICE 'trip_expenses: dropped %', r.policyname;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) chat_messages — DROP explicites (si table présente)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  allowed text[] := ARRAY[
    'chat_messages_trip_member_select',
    'chat_messages_trip_member_insert',
    'chat_messages_trip_member_update',
    'chat_messages_trip_member_delete'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_messages'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "chat_messages_members" ON public.chat_messages';
  EXECUTE 'DROP POLICY IF EXISTS "chat_messages_authenticated_all" ON public.chat_messages';
  EXECUTE 'DROP POLICY IF EXISTS "chat_messages_allow_authenticated_all" ON public.chat_messages';
  EXECUTE 'DROP POLICY IF EXISTS "chat_messages_allow_anon_all" ON public.chat_messages';
  EXECUTE 'DROP POLICY IF EXISTS "chat_messages_public_all" ON public.chat_messages';
  EXECUTE 'DROP POLICY IF EXISTS "chat_messages_all_public" ON public.chat_messages';

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_messages'
      AND NOT (policyname = ANY (allowed))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_messages', r.policyname);
    RAISE NOTICE 'chat_messages: dropped %', r.policyname;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5) activity_votes — DROP explicites (si table présente)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  allowed text[] := ARRAY[
    'activity_votes_trip_member_select',
    'activity_votes_trip_member_insert',
    'activity_votes_trip_member_update',
    'activity_votes_trip_member_delete'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_votes'
  ) THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "activity_votes_members" ON public.activity_votes';
  EXECUTE 'DROP POLICY IF EXISTS "activity_votes_authenticated_all" ON public.activity_votes';
  EXECUTE 'DROP POLICY IF EXISTS "activity_votes_allow_authenticated_all" ON public.activity_votes';
  EXECUTE 'DROP POLICY IF EXISTS "activity_votes_allow_anon_all" ON public.activity_votes';
  EXECUTE 'DROP POLICY IF EXISTS "activity_votes_public_all" ON public.activity_votes';
  EXECUTE 'DROP POLICY IF EXISTS "activity_votes_all_public" ON public.activity_votes';

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_votes'
      AND NOT (policyname = ANY (allowed))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_votes', r.policyname);
    RAISE NOTICE 'activity_votes: dropped %', r.policyname;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6) Balayage transversal — toute policy USING(true)/WITH CHECK(true) ou rôle anon
--    sur les 5 tables voyage (filet de sécurité)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('trips', 'activities', 'trip_expenses', 'chat_messages', 'activity_votes')
      AND (
        lower(coalesce(qual::text, '')) IN ('true', '(true)')
        OR lower(coalesce(with_check::text, '')) IN ('true', '(true)')
        OR roles::text ILIKE '%anon%'
        OR policyname ILIKE '%\_public' ESCAPE '\'
        OR policyname ILIKE '%\_all' ESCAPE '\'
        OR policyname ILIKE '%public\_%' ESCAPE '\'
        OR policyname ILIKE '%allow\_anon%' ESCAPE '\'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
    RAISE NOTICE 'sweep: dropped %.%', r.tablename, r.policyname;
  END LOOP;
END;
$$;

-- =============================================================================
-- 7) CONTRÔLE POST-PURGE — doit retourner 0 ligne
-- =============================================================================
-- A) Policies permissives restantes (qual=true OU rôle anon)
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check,
  'PERMISSIVE_OR_ANON' AS flag
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('trips', 'activities', 'trip_expenses', 'chat_messages', 'activity_votes')
  AND (
    lower(coalesce(qual::text, '')) IN ('true', '(true)')
    OR lower(coalesce(with_check::text, '')) IN ('true', '(true)')
    OR roles::text ILIKE '%anon%'
  )
ORDER BY tablename, cmd, policyname;

-- B) Inventaire final attendu (4 policies / table membre)
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('trips', 'activities', 'trip_expenses', 'chat_messages', 'activity_votes')
ORDER BY tablename, cmd, policyname;
