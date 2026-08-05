/* The password rule, mirrored from app/passwords.py.

   The API is the one that decides — it rejects a weak password whatever the
   browser thinks — but a checklist that ticks as the person types beats a
   form that only says "no" after they press the button. Keep the two in step:
   any rule added on the server belongs here as well. */

export const PW_MIN = 8;
export const PW_MAX = 128;
const SPECIALS = "!@#$%^&*()-_=+[]{};:,.<>?/\\|`~'\"";

const BANNED = new Set([
  "password", "password1", "password@1", "passw0rd", "qwerty123", "admin@123",
  "welcome@1", "abcd@1234", "12345678", "123456789", "letmein1", "iloveyou1",
]);

/* One entry per rule: { label, ok }. `identity` (the name and email on the
   account) is accepted so callers need not know whether the rule looks at
   them — today it does not, matching the server. */
export function passwordRules(pw = "", identity = {}) {
  const s = pw || "";

  return [
    { label: `At least ${PW_MIN} characters`, ok: s.length >= PW_MIN && s.length <= PW_MAX },
    { label: "A capital letter (A–Z)", ok: /[A-Z]/.test(s) },
    { label: "A small letter (a–z)", ok: /[a-z]/.test(s) },
    { label: "A number (0–9)", ok: /[0-9]/.test(s) },
    { label: "A symbol (@ # $ ! …)", ok: [...s].some((c) => SPECIALS.includes(c)) },
    { label: "No spaces, nothing obvious", ok:
        s.length > 0 && !/\s/.test(s) && !BANNED.has(s.toLowerCase()) },
  ];
}

export const passwordOk = (pw, identity) => passwordRules(pw, identity).every((r) => r.ok);
