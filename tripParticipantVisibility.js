/**
 * Legacy trip rows used [] before `invited_joined_emails` carried real join state.
 * Treat that shape like NULL so participant displays and expense splits stay aligned.
 */
export function normalizeInvitedJoinedEmailsForParticipantVisibility(invitedJoinedEmails) {
  if (Array.isArray(invitedJoinedEmails) && invitedJoinedEmails.length === 0) {
    return null;
  }
  return invitedJoinedEmails;
}
