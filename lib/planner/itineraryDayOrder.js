/**
 * Tri chronologique intra-jour (matin → après-midi → soir) pour la vue résultat.
 * Fonctions pures — testables sans React.
 */

/** @param {string} period */
export function periodRank(period) {
  const p = String(period || "").trim().toLowerCase();
  if (p === "morning") return 0;
  if (p === "afternoon") return 1;
  if (p === "evening") return 2;
  return 3;
}

/** @param {string} bullet */
export function parseBulletPeriod(bullet) {
  const s = String(bullet || "").trim();
  if (!s) return "other";
  if (/^(matin|morning|morgen|vormittag|上午|午前)\s*[:：\-–—]/iu.test(s)) return "morning";
  if (/^(apr[eè]s[- ]midi|afternoon|nachmittag|下午|午後)\s*[:：\-–—]/iu.test(s)) return "afternoon";
  if (/^(soir|soirée|soiree|evening|abend|noche|sera|serata|晚上|夜)\s*[:：\-–—]/iu.test(s)) return "evening";
  return "other";
}

/** @param {object|null|undefined} activity */
function timeMinutesFromActivity(activity) {
  const raw = activity?.suggestedTime ?? activity?.suggested_time ?? activity?.time;
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/**
 * @param {object} activity
 * @param {string} [bulletText]
 */
export function resolveActivityPeriod(activity, bulletText = "") {
  const p = String(activity?.period || "").trim().toLowerCase();
  if (p === "morning" || p === "afternoon" || p === "evening") return p;
  const fromBullet = parseBulletPeriod(bulletText);
  return fromBullet === "other" ? "other" : fromBullet;
}

/**
 * @param {object} a
 * @param {object} b
 * @param {string} [bulletA]
 * @param {string} [bulletB]
 */
function compareChronological(a, b, bulletA = "", bulletB = "") {
  const rankA = periodRank(resolveActivityPeriod(a, bulletA));
  const rankB = periodRank(resolveActivityPeriod(b, bulletB));
  if (rankA !== rankB) return rankA - rankB;
  const timeA = timeMinutesFromActivity(a);
  const timeB = timeMinutesFromActivity(b);
  if (timeA != null && timeB != null && timeA !== timeB) return timeA - timeB;
  if (timeA != null && timeB == null) return -1;
  if (timeA == null && timeB != null) return 1;
  return 0;
}

/**
 * @param {object[]} activities
 * @param {string[]|null} [pairedBullets] — bullets alignés index par index (sessionStorage)
 */
export function sortDayActivitiesChronologically(activities, pairedBullets = null) {
  const list = Array.isArray(activities) ? activities.filter((a) => a && typeof a === "object") : [];
  if (list.length <= 1) return [...list];

  const bullets = Array.isArray(pairedBullets) ? pairedBullets : null;
  const indexed = list.map((act, i) => ({
    act,
    i,
    bullet: bullets && bullets[i] != null ? String(bullets[i]) : "",
  }));

  indexed.sort((x, y) => {
    const cmp = compareChronological(x.act, y.act, x.bullet, y.bullet);
    return cmp !== 0 ? cmp : x.i - y.i;
  });

  return indexed.map((row) => row.act);
}

/**
 * @param {string[]} bullets
 */
export function sortDayBulletsChronologically(bullets) {
  const list = (Array.isArray(bullets) ? bullets : [])
    .map((b) => String(b || "").trim())
    .filter(Boolean);
  if (list.length <= 1) return [...list];

  const indexed = list.map((bullet, i) => ({ bullet, i, rank: periodRank(parseBulletPeriod(bullet)) }));
  indexed.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.i - b.i));
  return indexed.map((row) => row.bullet);
}

/**
 * Réordonne un jour pour l'affichage (activités + bullets alignés si possible).
 * @param {object} day
 * @returns {object}
 */
export function sortItineraryDayForDisplay(day) {
  if (!day || typeof day !== "object") return day;

  const activities = Array.isArray(day.activities)
    ? day.activities.filter((a) => a && typeof a === "object")
    : [];
  const rawBullets = Array.isArray(day.bullets)
    ? day.bullets.map((b) => String(b || "").trim()).filter(Boolean)
    : [];

  if (activities.length > 0) {
    if (rawBullets.length === activities.length) {
      const zipped = activities.map((act, i) => ({ act, bullet: rawBullets[i], i }));
      zipped.sort((x, y) => {
        const cmp = compareChronological(x.act, y.act, x.bullet, y.bullet);
        return cmp !== 0 ? cmp : x.i - y.i;
      });
      return {
        ...day,
        activities: zipped.map((z) => z.act),
        bullets: zipped.map((z) => z.bullet),
      };
    }
    const sortedActs = sortDayActivitiesChronologically(activities);
    const { bullets: _drop, ...rest } = day;
    return { ...rest, activities: sortedActs };
  }

  if (rawBullets.length > 0) {
    return { ...day, bullets: sortDayBulletsChronologically(rawBullets) };
  }

  return day;
}
