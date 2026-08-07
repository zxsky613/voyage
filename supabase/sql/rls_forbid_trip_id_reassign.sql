-- =============================================================================
-- P0 — Interdit le réassignement cross-trip via UPDATE (activities / trip_expenses)
-- Cause : policies UPDATE USING+WITH CHECK (trip_member_can_access(trip_id))
--         autorisent un membre de A et B à faire
--         UPDATE activities SET trip_id = B WHERE trip_id = A.
-- Exécuter dans Supabase → SQL Editor après rls_trip_member_isolation.sql.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.forbid_trip_id_reassign()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.trip_id IS DISTINCT FROM OLD.trip_id THEN
    RAISE EXCEPTION 'trip_id cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.forbid_trip_id_reassign() FROM PUBLIC;

DROP TRIGGER IF EXISTS activities_forbid_trip_id_reassign ON public.activities;
CREATE TRIGGER activities_forbid_trip_id_reassign
  BEFORE UPDATE OF trip_id ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.forbid_trip_id_reassign();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trip_expenses'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trip_expenses_forbid_trip_id_reassign ON public.trip_expenses';
    EXECUTE $t$
      CREATE TRIGGER trip_expenses_forbid_trip_id_reassign
        BEFORE UPDATE OF trip_id ON public.trip_expenses
        FOR EACH ROW
        EXECUTE FUNCTION public.forbid_trip_id_reassign()
    $t$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_messages'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS chat_messages_forbid_trip_id_reassign ON public.chat_messages';
    EXECUTE $t$
      CREATE TRIGGER chat_messages_forbid_trip_id_reassign
        BEFORE UPDATE OF trip_id ON public.chat_messages
        FOR EACH ROW
        EXECUTE FUNCTION public.forbid_trip_id_reassign()
    $t$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_votes'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS activity_votes_forbid_trip_id_reassign ON public.activity_votes';
    EXECUTE $t$
      CREATE TRIGGER activity_votes_forbid_trip_id_reassign
        BEFORE UPDATE OF trip_id ON public.activity_votes
        FOR EACH ROW
        EXECUTE FUNCTION public.forbid_trip_id_reassign()
    $t$;
  END IF;
END;
$$;
