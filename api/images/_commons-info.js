import { handleCors, sendJson, parseBody } from "../_helpers.js";
import { fetchJsonWithRetry } from "./_fetchRetry.js";

/** Extrait le nom de fichier Commons depuis une URL upload.wikimedia.org. */
export function commonsFileTitleFromUrl(url) {
  const u = String(url || "").trim();
  if (!u.includes("upload.wikimedia.org")) return "";
  const path = u.split("?")[0];
  const parts = path.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    let seg = decodeURIComponent(parts[i] || "");
    const px = seg.match(/^(\d+)px-(.+)$/i);
    if (px) seg = px[2];
    if (/\.(jpe?g|png|webp|gif|svg)$/i.test(seg)) return seg;
  }
  return "";
}

function parseExtMetaValue(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (typeof raw === "object" && raw.value != null) {
    return String(raw.value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return String(raw).trim();
}

/**
 * POST { url?, fileTitle? }
 * → { ok, attribution: { author, license, licenseUrl, sourceUrl } }
 */
export async function handler(req, res) {
  if (handleCors(req, res)) return;

  const body = parseBody(req);
  const fileTitle = String(body.fileTitle || commonsFileTitleFromUrl(body.url) || "").trim();
  if (!fileTitle) {
    return sendJson(res, 400, { ok: false, error: "url ou fileTitle requis." });
  }

  const filePage = fileTitle.startsWith("File:") ? fileTitle : `File:${fileTitle}`;

  try {
    const api =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1" +
      `&titles=${encodeURIComponent(filePage)}` +
      "&prop=imageinfo&iiprop=url|extmetadata";

    const { ok, json, status } = await fetchJsonWithRetry(api);
    if (!ok || !json) {
      return sendJson(res, 502, { ok: false, error: `Commons API ${status || "error"}` });
    }

    const j = json;
    const page = Object.values(j?.query?.pages || {})[0];
    const info = page?.imageinfo?.[0];
    const meta = info?.extmetadata || {};
    const author =
      parseExtMetaValue(meta.Artist) ||
      parseExtMetaValue(meta.Credit) ||
      parseExtMetaValue(meta.Attribution);
    const license = parseExtMetaValue(meta.LicenseShortName) || parseExtMetaValue(meta.UsageTerms);
    const licenseUrl = parseExtMetaValue(meta.LicenseUrl);
    const sourceUrl = String(info?.descriptionurl || body.url || "").trim();

    return sendJson(res, 200, {
      ok: true,
      attribution: {
        author: author || undefined,
        license: license || undefined,
        licenseUrl: licenseUrl || undefined,
        sourceUrl: sourceUrl || undefined,
      },
    });
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: String(e?.message || e) });
  }
}
