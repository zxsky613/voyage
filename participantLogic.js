function isValidEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function currentUserDisplayName(session) {
  const first = String(session?.user?.user_metadata?.first_name || "").trim();
  const last = String(session?.user?.user_metadata?.last_name || "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  const fromMeta = String(session?.user?.user_metadata?.full_name || "").trim();
  if (fromMeta) return fromMeta;
  const emailLocal = String(session?.user?.email || "").split("@")[0] || "";
  return emailLocal || "Moi";
}

export function canonicalTripParticipants(participantsInput, invitedEmailsInput) {
  const invited = Array.isArray(invitedEmailsInput)
    ? [...new Set(invitedEmailsInput.map((m) => String(m || "").trim().toLowerCase()).filter((m) => isValidEmailLike(m)))]
    : [];
  // Single source of truth for budget sharing: "Moi" plus invited emails.
  return ["Moi", ...invited];
}

export function isCurrentUserTripOwner(session, trip) {
  const oid = String(trip?.owner_id || "").trim();
  if (!oid) return true;
  return String(session?.user?.id || "").trim() === oid;
}

export function isParticipantRawCurrentUser(raw, session, trip) {
  const r = String(raw || "").trim().toLowerCase();
  if (r === "moi") {
    if (trip && String(trip.owner_id || "").trim()) {
      return isCurrentUserTripOwner(session, trip);
    }
    return true;
  }
  const em = String(session?.user?.email || "").trim().toLowerCase();
  return Boolean(em && r === em);
}

function dedupeCurrentUserInParticipantList(list, session, trip) {
  if (!session?.user) return list;
  const out = [];
  let haveMe = false;
  for (const p of list || []) {
    if (isParticipantRawCurrentUser(p, session, trip)) {
      if (haveMe) continue;
      haveMe = true;
      out.push(p);
    } else {
      out.push(p);
    }
  }
  return out;
}

export function participantsForExpenseSplit(trip, session) {
  const full = canonicalTripParticipants(
    Array.isArray(trip?.participants) ? trip.participants : [],
    Array.isArray(trip?.invited_emails) ? trip.invited_emails : []
  );
  let joined = trip?.invited_joined_emails;
  // Legacy rows used [] at creation time; keep budget splits aligned with avatar visibility.
  if (Array.isArray(joined) && joined.length === 0) {
    joined = null;
  }
  if (joined == null) {
    return dedupeCurrentUserInParticipantList(full, session, trip);
  }
  const jset = new Set(
    (Array.isArray(joined) ? joined : [])
      .map((x) => String(x || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (jset.size === 0) {
    return dedupeCurrentUserInParticipantList(["Moi"], session, trip);
  }
  const filtered = full.filter((p) => {
    const s = String(p || "").trim();
    if (s.toLowerCase() === "moi") return true;
    if (!isValidEmailLike(s)) return true;
    return jset.has(s.toLowerCase());
  });
  return dedupeCurrentUserInParticipantList(filtered, session, trip);
}

export function defaultPayerForParticipants(participants, session, trip) {
  const parts = Array.isArray(participants) && participants.length > 0 ? participants.map(String) : ["Moi"];
  const current = parts.find((p) => isParticipantRawCurrentUser(p, session, trip));
  if (current) return current;
  return parts.includes("Moi") ? "Moi" : parts[0];
}

export function participantDisplayFromRaw(value, displayName = "Moi") {
  const raw = String(value || "").trim();
  if (!raw) return "Membre";
  if (raw.toLowerCase() === "moi") return String(displayName || "Moi");
  if (!raw.includes("@")) return raw;
  const local = raw.split("@")[0] || "";
  const pretty = local
    .split(/[._-]+/g)
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return pretty || raw;
}

export function participantDisplayFromRawForTrip(value, session, trip, ownerPeer) {
  const raw = String(value || "").trim();
  if (
    raw.toLowerCase() === "moi" &&
    trip &&
    String(trip.owner_id || "").trim() &&
    String(session?.user?.id || "") !== String(trip.owner_id)
  ) {
    if (ownerPeer && typeof ownerPeer === "object") {
      const f = String(ownerPeer.firstName || "").trim();
      const l = String(ownerPeer.lastName || "").trim();
      const full = `${f} ${l}`.trim();
      if (full) return full;
      const em = String(ownerPeer.email || "").trim();
      if (em) return participantDisplayFromRaw(em, currentUserDisplayName(session));
    }
    return "Organisateur";
  }
  return participantDisplayFromRaw(value, currentUserDisplayName(session));
}
