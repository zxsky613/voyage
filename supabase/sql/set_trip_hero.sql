-- =============================================================================
-- Écrivain unique hero — set_trip_hero(p_trip_id, p_url)
-- SECURITY DEFINER, appartenance voyage (trip_member_can_access), garde qualité.
-- RLS trips inchangée — aucun GRANT UPDATE supplémentaire sur trips.
-- Exécuter manuellement dans Supabase SQL Editor.
-- =============================================================================

-- Garde qualité — alignée sur heroQualityRules / isBlockedHeroImageUrl (approx. SQL).
CREATE OR REPLACE FUNCTION public.is_blocked_hero_image_url(p_url text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
  d text;
BEGIN
  s := lower(trim(coalesce(p_url, '')));
  IF s = '' THEN
    RETURN false;
  END IF;
  d := lower(trim(replace(s, '%', '')));

  IF d ~ '\.svg(\.png)?($|\?|/)' THEN
    RETURN true;
  END IF;

  IF d ~ '(flag_of|/flag/|seal_of|coat_of_arms|armoiries|emblem_of|drapeau|blason|_seal\.|_badge\.|logo_)' THEN
    RETURN true;
  END IF;

  -- PostgreSQL : \b = backspace — utiliser \m / \M (limites de mot) ou motifs sans ancre.
  IF d ~ '(^|[^a-z0-9])(satellite|from[_\s-]?space|sts[_\s-]|nasa|landsat|sentinel|orbital|iss)([^a-z0-9]|$)' THEN
    RETURN true;
  END IF;

  IF d ~ '(map[_\s-]?of|carte[_\s-]?de|locator|location[_\s-]?map|topographic|relief[_\s-]?map|openstreetmap|osm[_-])' THEN
    RETURN true;
  END IF;

  IF d ~ '\m(logo|wordmark|wc|toilet|restroom|lavatory|bathroom|urinal|washroom|interior|indoor|inside|signpost|signage|notice|menu)\M' THEN
    RETURN true;
  END IF;

  IF d ~ '(street[_\s-]?sign|museum interior)' THEN
    RETURN true;
  END IF;

  IF d ~ 'island[_\s-]of[_\s-]' AND d !~ '(panoram|panorama|landscape|view|vista|skyline|coast|beach|harbour|harbor|bay|old[_\s-]?town|historic[_\s-]?center)' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_hero_image_url(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_hero_image_url(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_hero_image_url(text) TO service_role;

-- Écrivain unique : hero_image_url uniquement, 1re écriture valide conservée.
CREATE OR REPLACE FUNCTION public.set_trip_hero(p_trip_id uuid, p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_url text;
  v_cur text;
  v_is_service boolean;
BEGIN
  v_is_service := coalesce(auth.jwt() ->> 'role', '') = 'service_role';

  IF auth.uid() IS NULL AND NOT v_is_service THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_trip_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_trip_id');
  END IF;

  IF NOT v_is_service AND NOT public.trip_member_can_access(p_trip_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_member');
  END IF;

  v_url := trim(coalesce(p_url, ''));
  IF v_url = '' OR v_url !~* '^https?://' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_url');
  END IF;

  -- Rejette l'encodage % incomplet (ex. 100%organic) — aligné sur decodeURIComponent JS.
  IF v_url ~ '%([^0-9a-fA-F]|$)' OR v_url ~ '%[0-9a-fA-F]([^0-9a-fA-F]|$)' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_url_encoding');
  END IF;

  IF public.is_blocked_hero_image_url(v_url) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'blocked_quality');
  END IF;

  SELECT trim(coalesce(hero_image_url, ''))
  INTO v_cur
  FROM public.trips
  WHERE id = p_trip_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'trip_not_found');
  END IF;

  IF v_cur <> ''
     AND v_cur ~* '^https?://'
     AND NOT (v_cur ~ '%([^0-9a-fA-F]|$)' OR v_cur ~ '%[0-9a-fA-F]([^0-9a-fA-F]|$)')
     AND NOT public.is_blocked_hero_image_url(v_cur) THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_set', 'url', v_cur);
  END IF;

  UPDATE public.trips
  SET hero_image_url = v_url
  WHERE id = p_trip_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'written', 'url', v_url);
END;
$$;

REVOKE ALL ON FUNCTION public.set_trip_hero(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_trip_hero(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_trip_hero(uuid, text) TO service_role;
