"""Outgoing email — one passcode message, over SMTP or an email API.

Dependency-free by design (stdlib `smtplib` and `urllib`): the only mail this
system sends is a six-digit sign-in code, so a library would earn nothing.

Two transports, chosen by MAIL_PROVIDER:

  smtp    smtplib. Right locally and in Docker. Gmail wants
          smtp.gmail.com:587 with a 16-character App Password, never the
          account password — Google refuses those over SMTP.
  brevo   HTTPS POST to api.brevo.com
  resend  HTTPS POST to api.resend.com

The HTTP transports are not a preference, they are a necessity on most managed
hosts. Render, Vercel and others silently drop outbound packets on the SMTP
ports (25 / 465 / 587) to stop spam abuse, so the socket hangs until it times
out and the send fails with credentials that are perfectly good. The tell is
the timing: a wrong password comes back in under a second, a blocked port takes
the full timeout. Port 443 is never blocked.

`send_otp_email` raises MailError when the message could not be handed over;
the caller turns that into a 502 so nobody is left staring at a code entry box
waiting for a mail that will never arrive. With no mail configured at all the
code is logged instead, which keeps a fresh clone usable offline.
"""
import json
import logging
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr

from .config import settings

log = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
RESEND_URL = "https://api.resend.com/emails"


class MailError(RuntimeError):
    """The message could not be handed to the mail server or API."""


def _body(name: str, code: str, minutes: int, reason: str) -> tuple[str, str]:
    """Plain-text and HTML halves of the passcode mail."""
    who = (name or "there").split(" ")[0]
    line = {
        "user_first_login": "Confirm this is you to finish signing in.",
        "admin_session_renewal": "Admins confirm their address once a day — confirm this is you to sign in.",
        "admin_step_up": "Confirm this is you before changing an account password.",
        "account_unlock": "Confirm this is you to unlock your account.",
    }.get(reason, "Confirm this is you to continue.")
    text = (
        f"Hello {who},\n\n"
        f"{line}\n\n"
        f"Your verification code is: {code}\n\n"
        f"It is valid for {minutes} minutes and can be used once.\n"
        "If you did not try to sign in, ignore this email and change your password.\n\n"
        "— Jaikvin Global Export System\n"
    )
    html = f"""\
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f9;padding:28px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
    <div style="background:#0b2c4d;padding:20px 26px">
      <div style="color:#fff;font-size:19px;font-weight:700;letter-spacing:-.3px">Jaikvin Global</div>
      <div style="color:#9fc0d8;font-size:11px;letter-spacing:4px;margin-top:3px">EXPORT SYSTEM</div>
    </div>
    <div style="padding:26px">
      <p style="margin:0 0 6px;color:#0f172a;font-size:15px">Hello {who},</p>
      <p style="margin:0 0 18px;color:#475569;font-size:13.5px;line-height:1.55">{line}</p>
      <div style="background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:10px;padding:16px;text-align:center">
        <div style="font-size:11px;letter-spacing:2px;color:#64748b">VERIFICATION CODE</div>
        <div style="font-size:32px;font-weight:700;letter-spacing:9px;color:#0b2c4d;margin-top:6px;font-family:Consolas,monospace">{code}</div>
      </div>
      <p style="margin:18px 0 0;color:#64748b;font-size:12.5px;line-height:1.55">
        Valid for <b>{minutes} minutes</b>, single use. If you did not try to sign in,
        ignore this email and change your password.
      </p>
    </div>
    <div style="padding:14px 26px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px">
      Maintained and developed by Avita Technologies · V-5.0.1
    </div>
  </div>
</div>"""
    return text, html


def _subject(code: str) -> str:
    return f"{code} is your Jaikvin Global verification code"


def _send_smtp(to_email: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.smtp_from_name, settings.mail_sender))
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    if settings.smtp_ssl:
        server = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port,
            timeout=settings.smtp_timeout, context=ssl.create_default_context(),
        )
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout)
    with server:
        server.ehlo()
        if settings.smtp_starttls and not settings.smtp_ssl:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)


def _http_payload(to_email: str, subject: str, text: str, html: str) -> tuple[str, dict, dict]:
    """(url, headers, body) for the configured email API."""
    sender = settings.mail_sender
    name = settings.smtp_from_name
    if settings.mail_provider == "brevo":
        return (
            BREVO_URL,
            {"api-key": settings.mail_api_key, "content-type": "application/json", "accept": "application/json"},
            {
                "sender": {"email": sender, "name": name},
                "to": [{"email": to_email}],
                "subject": subject,
                "textContent": text,
                "htmlContent": html,
            },
        )
    return (
        RESEND_URL,
        {"Authorization": f"Bearer {settings.mail_api_key}", "Content-Type": "application/json"},
        {
            "from": f"{name} <{sender}>",
            "to": [to_email],
            "subject": subject,
            "text": text,
            "html": html,
        },
    )


def _send_http(to_email: str, subject: str, text: str, html: str) -> None:
    url, headers, body = _http_payload(to_email, subject, text, html)
    req = urllib.request.Request(
        url, method="POST", data=json.dumps(body).encode("utf-8"), headers=headers,
    )
    try:
        with urllib.request.urlopen(req, timeout=settings.smtp_timeout) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        # The provider's own words are the useful part — "sender not verified",
        # "invalid api key" — so they go to the log rather than a generic 502.
        detail = ""
        try:
            detail = exc.read().decode("utf-8", "replace")[:400]
        except Exception:  # noqa: BLE001 — a body that will not read is not the fault
            pass
        raise MailError(f"{settings.mail_provider} refused the message ({exc.code}): {detail}") from exc


def send_otp_email(to_email: str, name: str, code: str, reason: str) -> bool:
    """Mail one passcode. Returns True when sent, False when no mail transport
    is configured (the code is logged instead). Raises MailError on failure."""
    minutes = settings.otp_ttl_minutes

    if not settings.mail_configured:
        need = ("MAIL_API_KEY and SMTP_FROM" if settings.mail_provider in ("brevo", "resend")
                else "SMTP_HOST / SMTP_USER / SMTP_PASSWORD")
        log.warning(
            "mail is not configured (MAIL_PROVIDER=%s) — verification code for %s is %s "
            "(valid %s min). Set %s to send it.",
            settings.mail_provider, to_email, code, minutes, need,
        )
        return False

    text, html = _body(name, code, minutes, reason)
    try:
        if settings.mail_provider in ("brevo", "resend"):
            _send_http(to_email, _subject(code), text, html)
        else:
            _send_smtp(to_email, _subject(code), text, html)
    except MailError:
        log.exception("could not send the verification code to %s", to_email)
        raise
    except Exception as exc:  # noqa: BLE001 — every transport fault reads the same to the user
        log.exception("could not send the verification code to %s", to_email)
        raise MailError(str(exc)) from exc

    log.info("verification code sent to %s via %s", to_email, settings.mail_provider)
    return True


# ---------- "Somebody has been guessing at your account" ----------

def _lockout_body(name: str, tier: str, minutes: int, when: str, ip: str) -> tuple[str, str]:
    who = (name or "there").split(" ")[0]
    if tier == "hard":
        headline = "Your account has been locked"
        what = (
            "There have been repeated failed sign-in attempts on your account, so it "
            "has been locked. Use \"Unlock my account\" on the sign-in screen to confirm "
            "your email address, or ask the administrator to reset it for you."
        )
    else:
        headline = "Too many failed sign-in attempts"
        what = (
            f"Your account has been locked for {minutes} minutes after several failed "
            "sign-in attempts. It will open again by itself, or you can use "
            "\"Unlock my account\" on the sign-in screen to confirm your email and get "
            "back in straight away."
        )
    tail = (
        "If this was you, no action is needed beyond signing in again. "
        "If it was not, change your password as soon as you are back in — "
        "somebody else knows your email address and is guessing at the password."
    )
    text = (
        f"Hello {who},\n\n{headline}\n\n{what}\n\n"
        f"Last attempt: {when}{f' from {ip}' if ip else ''}\n\n{tail}\n\n"
        "— Jaikvin Global Export System\n"
    )
    html = f"""\
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f4f6f9;padding:28px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
    <div style="background:#7f1d1d;padding:20px 26px">
      <div style="color:#fff;font-size:19px;font-weight:700;letter-spacing:-.3px">Jaikvin Global</div>
      <div style="color:#fecaca;font-size:11px;letter-spacing:4px;margin-top:3px">SECURITY ALERT</div>
    </div>
    <div style="padding:26px">
      <p style="margin:0 0 6px;color:#0f172a;font-size:15px">Hello {who},</p>
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;font-weight:600">{headline}</p>
      <p style="margin:0 0 16px;color:#475569;font-size:13.5px;line-height:1.55">{what}</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;
                  color:#7f1d1d;font-size:12.5px">
        Last attempt: <b>{when}</b>{f' from <b>{ip}</b>' if ip else ''}
      </div>
      <p style="margin:16px 0 0;color:#64748b;font-size:12.5px;line-height:1.55">{tail}</p>
    </div>
    <div style="padding:14px 26px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px">
      Maintained and developed by Avita Technologies · V-5.0.1
    </div>
  </div>
</div>"""
    return text, html


def send_lockout_warning(to_email: str, name: str, tier: str, minutes: int,
                         when: str, ip: str = "") -> bool:
    """Tell an account holder their account was just locked.

    The person being attacked is the one who benefits from knowing, and this
    reaches them rather than whoever was guessing. Never raises: the lock is
    already applied, and a mail fault must not change that.
    """
    if not settings.mail_configured:
        log.warning("mail is not configured — %s lockout on %s not announced", tier, to_email)
        return False
    subject = ("Your Jaikvin Global account has been locked" if tier == "hard"
               else "Too many failed sign-in attempts on your Jaikvin Global account")
    text, html = _lockout_body(name, tier, minutes, when, ip)
    try:
        if settings.mail_provider in ("brevo", "resend"):
            _send_http(to_email, subject, text, html)
        else:
            _send_smtp(to_email, subject, text, html)
    except Exception:  # noqa: BLE001 — a warning that will not send is not a failed sign-in
        log.exception("could not send the lockout warning to %s", to_email)
        return False
    return True
