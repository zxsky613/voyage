import { Capacitor } from "@capacitor/core";
import { buildTripIcs, sanitizeIcsFilename } from "./buildTripIcs.js";

/**
 * @param {string} destination
 */
export function defaultTripIcsFilename(destination) {
  return `voyage-${sanitizeIcsFilename(destination)}.ics`;
}

/**
 * @param {object} opts
 * @param {string} opts.icsContent
 * @param {string} opts.filename
 */
export async function exportTripIcsFile({ icsContent, filename }) {
  const safeName = String(filename || "voyage.ics").trim() || "voyage.ics";
  const content = String(icsContent || "");

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    await Filesystem.writeFile({
      path: safeName,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({
      directory: Directory.Cache,
      path: safeName,
    });
    await Share.share({
      title: safeName,
      url: uri,
      dialogTitle: safeName,
    });
    return;
  }

  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} opts
 * @param {string} [opts.destination]
 * @param {object[]} [opts.activities]
 * @param {string} [opts.filename]
 */
export async function exportTripActivitiesToIcs({ destination, activities, filename, reminderMinutes }) {
  const icsContent = buildTripIcs({ destination, activities, reminderMinutes });
  await exportTripIcsFile({
    icsContent,
    filename: filename || defaultTripIcsFilename(destination),
  });
}
