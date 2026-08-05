"""Outgoing email — one passcode message, sent over plain SMTP.

Deliberately dependency-free (stdlib `smtplib`): the only mail this system
sends is a six-digit sign-in code, so a library would earn nothing. Gmail is
the expected host — smtp.gmail.com:587 with a 16-character App Password, never
the account password, because Google refuses ordinary passwords over SMTP.

`send_otp_email` raises MailError when the message could not be handed to the
server; the caller turns that into a 502 so nobody is left staring at a code
entry box waiting for a mail that will never arrive. With no SMTP host set at
all the code is logged instead, which keeps a fresh clone usable offline.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from .config import settings

log = logging.getLogger(__name__)


class MailError(RuntimeError):
    """The message could not be delivered to the SMTP server."""


def _body(name: str, code: str, minutes: int, reason: str) -> tuple[str, str]:
    """Plain-text and HTML halves of the passcode mail."""
    who = (name or "there").split(" ")[0]
    line = {
        "user_first_login": "Confirm this is you to finish signing in.",
        "admin_session_renewal": "Your session has expired — confirm this is you to start a new one.",
        "admin_step_up": "Confirm this is you before viewing or changing an account password.",
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
      Maintained and developed by Avita Technologies · V-5.5
    </div>
  </div>
</div>"""
    return text, html


def send_otp_email(to_email: str, name: str, code: str, reason: str) -> bool:
    """Mail one passcode. Returns True when sent, False when SMTP is unset
    (the code is logged instead). Raises MailError on a delivery failure."""
    minutes = settings.otp_ttl_minutes

    if not settings.mail_configured:
        log.warning(
            "SMTP is not configured — verification code for %s is %s (valid %s min). "
            "Set SMTP_HOST / SMTP_USER / SMTP_PASSWORD in backend/.env to mail it.",
            to_email, code, minutes,
        )
        return False

    text, html = _body(name, code, minutes, reason)
    msg = EmailMessage()
    msg["Subject"] = f"{code} is your Jaikvin Global verification code"
    msg["From"] = formataddr((settings.smtp_from_name, settings.mail_sender))
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    try:
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
    except Exception as exc:  # noqa: BLE001 — every SMTP fault reads the same to the user
        log.exception("could not send the verification code to %s", to_email)
        raise MailError(str(exc)) from exc

    log.info("verification code mailed to %s", to_email)
    return True
