/**
 * Pure helpers for trip invite membership (invited_emails).
 * Shared by Share → invite-by-email and budget participants save.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {unknown} value */
export function normalizeInviteEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : "";
}

/**
 * @param {unknown} invitedEmailsInput
 * @returns {string[]}
 */
export function normalizeInvitedEmailList(invitedEmailsInput) {
  if (!Array.isArray(invitedEmailsInput)) return [];
  return [
    ...new Set(
      invitedEmailsInput
        .map((m) => normalizeInviteEmail(m))
        .filter(Boolean)
    ),
  ];
}

/**
 * Append one invite email if missing.
 * @param {unknown} existingInvited
 * @param {unknown} email
 * @returns {{ next: string[], added: boolean, email: string }}
 */
export function appendInviteEmail(existingInvited, email) {
  const mail = normalizeInviteEmail(email);
  const prev = normalizeInvitedEmailList(existingInvited);
  if (!mail) return { next: prev, added: false, email: "" };
  if (prev.includes(mail)) return { next: prev, added: false, email: mail };
  return { next: [...prev, mail], added: true, email: mail };
}

/**
 * Participant modal save: invited_emails becomes exactly the valid emails still in the list
 * (supports both add and remove). Non-email labels are ignored for membership.
 * @param {unknown} participantList
 * @returns {string[]}
 */
export function invitedEmailsFromParticipantList(participantList) {
  return normalizeInvitedEmailList(participantList);
}

/**
 * @param {unknown} previousInvited
 * @param {unknown} nextInvited
 * @returns {string[]}
 */
export function diffNewlyAddedInviteEmails(previousInvited, nextInvited) {
  const prev = new Set(normalizeInvitedEmailList(previousInvited));
  return normalizeInvitedEmailList(nextInvited).filter((mail) => !prev.has(mail));
}
