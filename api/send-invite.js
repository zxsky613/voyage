import { sendTripInvitesWithResend } from "../invite-send-core.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = String(process.env.RESEND_FROM || "").trim();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await sendTripInvitesWithResend({
      apiKey,
      fromAddress,
      to: body.to,
      trip: body.trip,
      inviteBaseUrl: body.invite_base_url,
      programmeText: body.programme_text,
    });

    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        details: result.details,
        recipient: result.recipient,
      });
      return;
    }

    res.status(200).json({ ok: true, sent: result.sent, data: result.data });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
