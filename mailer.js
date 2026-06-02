// mailer.js — optional Resend transactional-email wrapper.
//
// Follows the same optional-feature pattern as store.js (Redis):
//   - When RESEND_API_KEY is UNSET: sendMail / sendVerificationEmail are
//     complete no-ops. They log a skip message and return {skipped:true}.
//     The `resend` package is never require()d. Signup and play are unaffected
//     (D-18: graceful degradation).
//   - When RESEND_API_KEY is SET: the SDK is lazy-required, a Resend client is
//     constructed, and the message is sent from MAIL_FROM. Any send failure is
//     caught and returned as {error: e.message} — it is NEVER thrown to the
//     caller. Email is best-effort (D-19, T-02-41).
//
// i18n note: email body copy stays English-only in this phase. Bilingual email
// bodies are out of scope for Phase 02 — a future plan can add per-user locale
// preference once accounts track that setting.

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "no-reply@example.com";

/**
 * sendMail — low-level wrapper.
 * @param {{ to: string, subject: string, html: string, text: string }} opts
 * @returns {Promise<{id:string}|{skipped:true}|{error:string}>}
 */
async function sendMail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.log("[mailer] RESEND_API_KEY unset — skipping email to", to);
    return { skipped: true };
  }
  try {
    // Lazy require — only loaded when the key is present (mirrors store.js pattern).
    const { Resend } = require("resend");
    const client = new Resend(RESEND_API_KEY);
    const result = await client.emails.send({ from: MAIL_FROM, to, subject, html, text });
    return result;
  } catch (e) {
    console.error("[mailer] send failed:", e.message);
    return { error: e.message };
  }
}

/**
 * sendVerificationEmail — convenience wrapper that builds the email body.
 * Fires a verification link email after email signup (AUTH-07 / D-19).
 * @param {string} to      — recipient email address
 * @param {string} verifyUrl — full verification URL including token
 * @returns {Promise<{id:string}|{skipped:true}|{error:string}>}
 */
async function sendVerificationEmail(to, verifyUrl) {
  const subject = "Verify your Battleship Online email";
  const html = `
    <p>Thanks for signing up!</p>
    <p>Click the link below to verify your email address. The link is valid for 24 hours.</p>
    <p><a href="${verifyUrl}">Verify my email</a></p>
    <p style="color:#888;font-size:12px;">If you did not sign up for Battleship Online, you can safely ignore this email.</p>
  `.trim();
  const text = [
    "Thanks for signing up!",
    "",
    "Click the link below to verify your email address. The link is valid for 24 hours.",
    "",
    verifyUrl,
    "",
    "If you did not sign up for Battleship Online, you can safely ignore this email.",
  ].join("\n");

  return sendMail({ to, subject, html, text });
}

module.exports = { sendMail, sendVerificationEmail };
