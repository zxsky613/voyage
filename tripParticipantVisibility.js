export function normalizeInvitedJoinedEmails(value) {
  if (value == null) return null;
  if (!Array.isArray(value)) return undefined;
  const normalized = [
    ...new Set(value.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)),
  ];
  return normalized.length === 0 ? null : normalized;
}
