export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "RESEND_API_KEY is missing" });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const to = Array.isArray(payload?.to)
      ? payload.to.map((x) => String(x || "").trim()).filter(Boolean)
      : [];

    if (to.length === 0) {
      res.status(400).json({ error: "No recipients provided" });
      return;
    }

    const trip = payload?.trip || {};
    const title = String(trip?.title || "Voyage");
    const startDate = String(trip?.startDate || "");
    const endDate = String(trip?.endDate || "");
    const link = String(trip?.link || "").trim();
    const inviteBaseUrl = String(payload?.invite_base_url || "").trim().replace(/\/+$/, "");

    const subject = `Invitation voyage: ${title}`;
    const sendResults = [];

    for (const recipient of to) {
      const inviteUrl = inviteBaseUrl
        ? `${inviteBaseUrl}/?invite=1&email=${encodeURIComponent(recipient)}&trip=${encodeURIComponent(title)}`
        : "";
      const finalLink = inviteUrl || link;

      const text = [
        "Salut,",
        "",
        `Tu es invite(e) au voyage "${title}".`,
        startDate || endDate ? `Dates: ${startDate} - ${endDate}` : "",
        finalLink ? `Lien invitation: ${finalLink}` : "",
        "",
        "En ouvrant le lien, on te demandera ton prenom/nom puis si tu veux creer un compte.",
        "",
        "A bientot,",
        "Voyage Planner",
      ]
        .filter(Boolean)
        .join("\n");

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <p>Salut,</p>
          <p>Tu es invite(e) au voyage <strong>"${title.replace(/"/g, "&quot;")}"</strong>.</p>
          ${startDate || endDate ? `<p><strong>Dates:</strong> ${startDate} - ${endDate}</p>` : ""}
          ${finalLink ? `<p><strong>Lien invitation:</strong> <a href="${finalLink}">${finalLink}</a></p>` : ""}
          <p>En ouvrant le lien, on te demandera ton prenom/nom puis si tu veux creer un compte.</p>
          <p>A bientot,<br/>Voyage Planner</p>
        </div>
      `;

      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Voyage Planner <voyage@resend.dev>",
          to: [recipient],
          subject,
          text,
          html,
        }),
      });

      const resendData = await resendResp.json();
      if (!resendResp.ok) {
        res.status(resendResp.status).json({
          error: String(resendData?.message || "Resend API error"),
          details: resendData,
          recipient,
        });
        return;
      }
      sendResults.push({ recipient, id: resendData?.id || null });
    }

    res.status(200).json({ ok: true, sent: sendResults.length, data: sendResults });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || "Unexpected server error") });
  }
}
