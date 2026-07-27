-- Suppression atomique du compte Auth + voyages possédés.
-- À exécuter dans le SQL Editor Supabase (rôle postgres / supabase_admin).
-- L’app appelle: supabase.rpc('delete_my_account')

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  trip_ids uuid[];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO trip_ids
  FROM public.trips
  WHERE owner_id = uid;

  IF cardinality(trip_ids) > 0 THEN
    DELETE FROM public.activities WHERE trip_id = ANY (trip_ids);

    BEGIN
      DELETE FROM public.chat_messages WHERE trip_id = ANY (trip_ids);
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM public.activity_votes WHERE trip_id = ANY (trip_ids);
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM public.trip_expenses WHERE trip_id = ANY (trip_ids);
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;

    DELETE FROM public.trips WHERE id = ANY (trip_ids) AND owner_id = uid;
  END IF;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
