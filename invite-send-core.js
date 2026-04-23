/**
 * Envoi d’invitations voyage via Resend — partagé entre l’API Vercel et le middleware Vite (dev).
 */

const DEFAULT_FROM = "Justtrip <onboarding@resend.dev>";

/**
 * @param {object} opts
 * @param {string} opts.apiKey - RESEND_API_KEY
 * @param {string} [opts.fromAddress] - ex. "Nom <verified@tondomaine.com>" ou défaut Resend test
 * @param {string[]} opts.to
 * @param {object} opts.trip - { title?, startDate?, endDate?, link? }
 * @param {string} [opts.inviteBaseUrl] - origine du site (sans slash final)
 * @param {string} [opts.programmeText] - programme texte brut (e-mail « partager »)
 * @returns {Promise<{ ok: true, sent: number, data: object[] } | { ok: false, status: number, error: string, details?: unknown, recipient?: string }>}
 */
export async function sendTripInvitesWithResend(opts) {
  const apiKey = String(opts?.apiKey || "").trim();
  const fromAddress = String(opts?.fromAddress || "").trim() || DEFAULT_FROM;
  const toRaw = Array.isArray(opts?.to) ? opts.to : [];
  const recipients = [...new Set(toRaw.map((x) => String(x || "").trim()).filter(Boolean))];
  const trip = opts?.trip && typeof opts.trip === "object" ? opts.trip : {};
  const inviteBaseUrl = String(opts?.inviteBaseUrl || "").trim().replace(/\/+$/, "");
  const programmeText = String(opts?.programmeText || "").trim();

  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error:
        "Clé Resend absente : ajoute RESEND_API_KEY dans .env.local (dev) ou les variables d’environnement du déploiement (ex. Vercel), puis redémarre.",
    };
  }
  if (recipients.length === 0) {
    return { ok: false, status: 400, error: "Aucun destinataire valide." };
  }

  const title = String(trip?.title || "Voyage");
  const startDate = String(trip?.startDate || "");
  const endDate = String(trip?.endDate || "");
  const link = String(trip?.link || "").trim();
  const subject = `Invitation voyage: ${title}`;
  const sendResults = [];

  for (const recipient of recipients) {
    const inviteUrl = inviteBaseUrl
      ? `${inviteBaseUrl}/?invite=1&email=${encodeURIComponent(recipient)}&trip=${encodeURIComponent(title)}`
      : "";
    const finalLink = inviteUrl || link;

    const progBlock =
      programmeText.length > 0
        ? ["", "Programme (apercu) :", programmeText, ""].join("\n")
        : "";
    const progHtml =
      programmeText.length > 0
        ? `<pre style="white-space:pre-wrap;font-size:13px;background:#f8fafc;padding:12px;border-radius:8px">${escapeHtml(
            programmeText
          )}</pre>`
        : "";

    const text = [
      "Salut,",
      "",
      `Tu es invite(e) au voyage "${title}".`,
      startDate || endDate ? `Dates: ${startDate} - ${endDate}` : "",
      finalLink ? `Lien invitation: ${finalLink}` : "",
      progBlock,
      "En ouvrant le lien, on te demandera ton prenom/nom puis si tu veux creer un compte.",
      "",
      "A bientot,",
      "Justtrip",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <p>Salut,</p>
          <p>Tu es invite(e) au voyage <strong>"${escapeHtml(title)}"</strong>.</p>
          ${startDate || endDate ? `<p><strong>Dates:</strong> ${escapeHtml(startDate)} - ${escapeHtml(endDate)}</p>` : ""}
          ${finalLink ? `<p><strong>Lien invitation:</strong> <a href="${escapeAttr(finalLink)}">${escapeHtml(finalLink)}</a></p>` : ""}
          ${progHtml}
          <p>En ouvrant le lien, on te demandera ton prenom/nom puis si tu veux creer un compte.</p>
          <p>A bientot,<br/>Justtrip</p>
        </div>
      `;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        subject,
        text,
        html,
      }),
    });

    const resendData = await resendResp.json().catch(() => ({}));
    if (!resendResp.ok) {
      const baseMsg = String(
        resendData?.message || resendData?.error || resendData?.name || ""
      ).trim();
      const fallback = baseMsg || `Resend HTTP ${resendResp.status}`;
      /** 403 : compte gratuit / domaine — souvent « only send to your own email » ou domaine non vérifié. */
      if (resendResp.status === 403) {
        const hintFr =
          "Astuce : avec un compte de test, envoie d’abord une invitation vers la même adresse que ton compte Resend. Pour inviter n’importe quelle adresse, ajoute et vérifie un domaine sur resend.com puis définis RESEND_FROM sur Vercel.";
        return {
          ok: false,
          status: 403,
          error: baseMsg ? `${baseMsg} ${hintFr}` : hintFr,
          details: resendData,
          recipient,
        };
      }
      return {
        ok: false,
        status: resendResp.status,
        error: fallback,
        details: resendData,
        recipient,
      };
    }
    sendResults.push({ recipient, id: resendData?.id || null });
  }

  return { ok: true, status: 200, sent: sendResults.length, data: sendResults };
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
