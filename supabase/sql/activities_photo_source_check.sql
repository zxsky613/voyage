-- photo_source CHECK — aligné sur lib/planner/activityPhotoSourceContract.js
-- Pipeline : tripadvisor | foursquare | wikimedia | wikimedia_geo | placeholder
-- + user (upload manuel). NULL autorisé (colonne omise à l'insert).

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_photo_source_check;

ALTER TABLE public.activities ADD CONSTRAINT activities_photo_source_check
  CHECK (
    photo_source IS NULL
    OR photo_source = ANY (ARRAY[
      'tripadvisor',
      'foursquare',
      'wikimedia',
      'wikimedia_geo',
      'placeholder',
      'user'
    ]::text[])
  );

COMMENT ON COLUMN public.activities.photo_source IS
  'Source photo : tripadvisor | foursquare | wikimedia | wikimedia_geo | placeholder | user (NULL si omis).';
