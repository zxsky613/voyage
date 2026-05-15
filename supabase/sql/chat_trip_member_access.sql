-- =============================================================================
-- Chat & votes : tables + RLS + Realtime
-- L’app lit/écrit public.chat_messages et public.activity_votes (App.jsx).
-- Si "relation chat_messages does not exist" : c’est normal tant que ce bloc
-- n’a pas été exécuté. Enchaîner tout le script en une fois.
-- =============================================================================

-- --- Tables (alignées sur les inserts / upsert de l’appli) -------------------

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  author_id text NOT NULL DEFAULT '',
  author_email text NOT NULL DEFAULT '',
  author_name text NOT NULL DEFAULT '',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_trip_id_created_at_idx
  ON public.chat_messages (trip_id, created_at);

CREATE TABLE IF NOT EXISTS public.activity_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  activity_id uuid NOT NULL,
  voter_id text NOT NULL,
  value smallint NOT NULL,
  voter_name text NOT NULL DEFAULT '',
  voter_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Upsert côté app : onConflict trip_id, activity_id, voter_id
CREATE UNIQUE INDEX IF NOT EXISTS activity_votes_trip_activity_voter_uidx
  ON public.activity_votes (trip_id, activity_id, voter_id);

CREATE INDEX IF NOT EXISTS activity_votes_trip_id_idx ON public.activity_votes (trip_id);

GRANT ALL ON public.chat_messages TO postgres, service_role;
GRANT ALL ON public.chat_messages TO authenticated;

GRANT ALL ON public.activity_votes TO postgres, service_role;
GRANT ALL ON public.activity_votes TO authenticated;

-- Clé étrangère optionnelle vers trips (si public.trips.id = uuid)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_trip_id_fkey') THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'trips'
        AND c.column_name = 'id' AND c.data_type = 'uuid'
    ) THEN
      ALTER TABLE public.chat_messages
        ADD CONSTRAINT chat_messages_trip_id_fkey
        FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_votes_trip_id_fkey') THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'trips'
        AND c.column_name = 'id' AND c.data_type = 'uuid'
    ) THEN
      ALTER TABLE public.activity_votes
        ADD CONSTRAINT activity_votes_trip_id_fkey
        FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
    END IF;
  END IF;
END;
$$;

-- =============================================================================
-- Politiques (propriétaire du voyage + e-mails invités) + Realtime
-- =============================================================================

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
        t.owner_id IS NOT NULL AND t.owner_id::text = u::text
        OR em = ANY (
            SELECT lower(trim(x::text)) FROM unnest(COALESCE(t.invited_emails, ARRAY[]::text[])) AS x
          )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trip_id_visible_to_requester(p_trip_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  parsed uuid;
BEGIN
  BEGIN
    parsed := NULLIF(trim(p_trip_id), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;
  RETURN public.trip_id_visible_to_requester(parsed);
END;
$$;

REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.trip_id_visible_to_requester(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trip_id_visible_to_requester(text) TO service_role;

-- chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_trip_member_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_trip_member_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_trip_member_update" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_trip_member_delete" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_members" ON public.chat_messages;

CREATE POLICY "chat_messages_trip_member_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "chat_messages_trip_member_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "chat_messages_trip_member_update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id))
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "chat_messages_trip_member_delete" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

-- activity_votes (même principe : votes visibles/éditables par les membres du voyage)
ALTER TABLE public.activity_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_votes_trip_member_select" ON public.activity_votes;
DROP POLICY IF EXISTS "activity_votes_trip_member_insert" ON public.activity_votes;
DROP POLICY IF EXISTS "activity_votes_trip_member_update" ON public.activity_votes;
DROP POLICY IF EXISTS "activity_votes_trip_member_delete" ON public.activity_votes;
DROP POLICY IF EXISTS "activity_votes_members" ON public.activity_votes;

CREATE POLICY "activity_votes_trip_member_select" ON public.activity_votes
  FOR SELECT TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activity_votes_trip_member_insert" ON public.activity_votes
  FOR INSERT TO authenticated
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activity_votes_trip_member_update" ON public.activity_votes
  FOR UPDATE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id))
  WITH CHECK (public.trip_id_visible_to_requester(trip_id));

CREATE POLICY "activity_votes_trip_member_delete" ON public.activity_votes
  FOR DELETE TO authenticated
  USING (public.trip_id_visible_to_requester(trip_id));

-- Temps réel : inclure les tables (sinon postgres_changes côté client ne reçoit rien)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'supabase_realtime + chat_messages: %', SQLERRM;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_votes;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'supabase_realtime + activity_votes: %', SQLERRM;
  END;
END;
$$;
