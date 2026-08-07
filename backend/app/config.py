"""Application settings, loaded from environment (.env supported).

The `.env` path is resolved absolutely (backend/.env) so settings load no
matter which directory you launch uvicorn from.
"""
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), env_file_encoding="utf-8", extra="ignore")

    # Default is a local SQLite file; override with Postgres in Docker/production.
    database_url: str = "sqlite:///./jaikvin.db"
    # Comma-separated list of allowed browser origins for CORS.
    cors_origins: str = "http://localhost:5173,http://localhost:4173,http://localhost:8090"
    app_name: str = "Jaikvin Global Export System API"

    # "production" locks the doors that are only convenient in development:
    # the interactive docs disappear, HSTS is sent, cookies demand HTTPS, and
    # a placeholder secret refuses to boot at all. Anything else is dev.
    environment: str = "development"

    # Dev server bind — change API_PORT in .env to switch ports easily.
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    reload: bool = Field(default=True)

    # Session tokens. Override JWT_SECRET in production — the default is a
    # development convenience only, and `_guard_secrets()` below refuses to
    # start a production process that is still carrying it.
    jwt_secret: str = "jaikvin-dev-secret-change-me"
    # 24 hours: every session — user and admin — expires a day after sign-in.
    jwt_expire_minutes: int = 60 * 24

    # How long a passcode-confirmed "yes, it is really me" lasts before an
    # admin must confirm again to set another account's password.
    stepup_ttl_minutes: int = 10

    # ---------- Session cookie ----------
    # The session travels in an httpOnly cookie, so a cross-site script cannot
    # read it the way it could read localStorage. That only works when the
    # browser considers the API same-site as the app — which is what the
    # /api rewrite in frontend/vercel.json arranges. Keep SameSite=lax there:
    # it blocks the cross-site POST that CSRF depends on.
    #
    # Set COOKIE_SAMESITE=none only if the browser is made to call Render
    # directly; "none" needs Secure, and CSRF then rests on the origin check
    # in main.py rather than on the browser.
    cookie_name: str = "jg_session"
    cookie_samesite: str = "lax"        # lax | strict | none
    cookie_secure: bool = True          # forced True in production
    cookie_domain: str = ""             # blank = host-only, which is what we want

    # ---------- Sign-in failures ----------
    # Two tiers. The soft one expires by itself so an ordinary mistyped
    # password never needs a human; the hard one is a real attack signal and
    # waits for an admin. Either can be cleared early by proving the mailbox.
    lockout_soft_threshold: int = 5     # failures before a timed lock
    lockout_soft_minutes: int = 15      # how long that lock stands
    lockout_hard_threshold: int = 10    # failures in a day before admin is needed
    lockout_window_hours: int = 24      # the window the hard count is read over

    # ---------- Rate limits ----------
    # Per-account limits are the ones that bite an attacker: they hold however
    # many addresses the traffic arrives from. Per-IP limits are deliberately
    # loose because one office shares one address — see app/ratelimit.py.
    rate_limit_enabled: bool = True
    rl_login_ip: str = "40/15m"         # whole-office headroom
    rl_otp_verify_account: str = "10/5m"
    rl_otp_send_account: str = "5/1h"   # protects the mail quota
    rl_otp_send_ip: str = "20/1h"
    rl_password_admin: str = "10/1h"    # bulk-harvest ceiling
    rl_unlock_account: str = "5/1h"
    rl_api_user: str = "300/1m"         # a report page fires ~20; humans never reach it
    rl_api_ip: str = "900/1m"
    rl_public_ip: str = "60/1m"         # /status, /permissions

    # How many previous passwords a new one is checked against. Stops the
    # change-then-change-back move; deliberately not paired with an expiry,
    # which NIST 800-63B advises against.
    password_history_size: int = 3

    # ---------- Email one-time passcodes ----------
    # A user verifies their address once, on first sign-in. An admin re-verifies
    # once a day — see `otp_admin_reverify_mode` below.
    #
    # The code is never returned to the caller. There used to be a dev-echo flag
    # for that; it reached production and printed a live passcode on the sign-in
    # screen, which hands the account to anyone who knows the email address.
    # Locally, leave the mail transport unconfigured and the code goes to the
    # server log instead — same convenience, no path to a browser.
    otp_enabled: bool = True
    otp_length: int = 6
    otp_ttl_minutes: int = 10          # how long a mailed code stays valid
    otp_max_attempts: int = 5          # wrong tries before the code is burned
    otp_resend_seconds: int = 30       # cooldown between "send it again"
    # When an admin's verification lapses.
    #   "midnight" — at the end of the calendar day it was given on, in
    #                APP_TIMEZONE. A code confirmed at 23:50 is good for ten
    #                minutes; one confirmed at 09:00 lasts the working day.
    #   "hours"    — the older rolling window of `otp_admin_reverify_hours`.
    # This is separate from JWT_EXPIRE_MINUTES: a session already open is not
    # cut short by midnight, the *next sign-in* is what asks for a code.
    otp_admin_reverify_mode: str = "midnight"
    otp_admin_reverify_hours: int = 24
    # The office's day. Timestamps stay UTC in the database; this only decides
    # where the day boundary falls. Needs the `tzdata` package on slim images.
    app_timezone: str = "Asia/Kolkata"

    # ---------- How the passcode leaves the building ----------
    # "smtp"   — smtplib, the obvious choice, and the right one locally.
    # "brevo"  — HTTPS POST to api.brevo.com
    # "resend" — HTTPS POST to api.resend.com
    #
    # The HTTP providers exist because most managed hosts (Render, Vercel and
    # others) silently drop outbound connections on the SMTP ports to stop spam
    # abuse: the socket simply hangs until it times out. Nothing is wrong with
    # the credentials in that case — the packets never leave. Port 443 is never
    # blocked, so an email API works everywhere SMTP does not.
    mail_provider: str = "smtp"
    mail_api_key: str = ""

    # ---------- SMTP (Gmail: smtp.gmail.com:587 with an App Password) ----------
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True     # 587 → STARTTLS; set false and port 465 for SSL
    smtp_ssl: bool = False         # implicit TLS (port 465)
    smtp_from: str = ""            # defaults to smtp_user when blank
    smtp_from_name: str = "Jaikvin Global Export System"
    smtp_timeout: int = 20

    # Google shows an App Password as "abcd efgh ijkl mnop" and people paste it
    # exactly like that. The spaces are presentation only — strip them, rather
    # than let a correct password fail authentication over four blanks.
    @field_validator("smtp_password", mode="before")
    @classmethod
    def _strip_app_password(cls, v):
        return "".join(str(v or "").split())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in ("production", "prod")

    @field_validator("environment", mode="before")
    @classmethod
    def _known_environment(cls, v):
        return str(v or "development").strip().lower()

    @field_validator("cookie_samesite", mode="before")
    @classmethod
    def _known_samesite(cls, v):
        s = str(v or "lax").strip().lower()
        return s if s in ("lax", "strict", "none") else "lax"

    @field_validator("mail_provider", mode="before")
    @classmethod
    def _known_provider(cls, v):
        p = str(v or "smtp").strip().lower()
        return p if p in ("smtp", "brevo", "resend") else "smtp"

    @field_validator("otp_admin_reverify_mode", mode="before")
    @classmethod
    def _known_reverify_mode(cls, v):
        m = str(v or "midnight").strip().lower()
        return m if m in ("midnight", "hours") else "midnight"

    @property
    def mail_configured(self) -> bool:
        """Can a passcode actually be sent? False means the code goes to the
        log instead — which keeps a fresh clone and an offline laptop usable."""
        if self.mail_provider in ("brevo", "resend"):
            return bool(self.mail_api_key and self.mail_sender)
        return bool(self.smtp_host and self.mail_sender)

    @property
    def mail_sender(self) -> str:
        """The From address. SMTP_FROM names it; SMTP_USER stands in for the
        SMTP case, where the mailbox and the sender are the same thing."""
        return self.smtp_from or self.smtp_user


settings = Settings()


# ---------- Refuse to start production with a placeholder secret ----------
#
# The dev default is printed in this file, in the README and in every clone of
# the repository. A deployment still carrying it can have an admin session
# token forged offline in seconds — no password, no passcode. That is not a
# warning-shaped problem, so production does not boot.

PLACEHOLDER_SECRETS = {
    "jaikvin-dev-secret-change-me",
    "change-me", "changeme", "secret", "dev", "test",
}
MIN_SECRET_LENGTH = 32


def secret_problems() -> list[str]:
    """What would make this process unsafe to run — empty means it passes.

    Only genuinely fatal things belong here. Anything the code already forces
    for itself is a warning at most: refusing to boot over a setting that is
    overridden two lines later would block a deployment for no gain, and a
    guard people learn to work around is worse than no guard.
    """
    bad: list[str] = []
    secret = (settings.jwt_secret or "").strip()

    if not secret:
        bad.append("JWT_SECRET is empty")
    elif secret.lower() in PLACEHOLDER_SECRETS:
        bad.append("JWT_SECRET is still the placeholder from the repository")
    elif len(secret) < MIN_SECRET_LENGTH:
        bad.append(f"JWT_SECRET is shorter than {MIN_SECRET_LENGTH} characters")

    return bad


def config_warnings() -> list[str]:
    """Worth saying out loud, not worth refusing to start over."""
    out: list[str] = []
    if settings.is_production:
        if not settings.cookie_secure:
            # Harmless in practice — the cookie is written with Secure forced on
            # in production regardless (see auth._set_session_cookie) — but it
            # means the .env being read was meant for a laptop.
            out.append("COOKIE_SECURE is false; Secure is being forced on anyway")
        if settings.cookie_samesite == "none":
            out.append(
                "COOKIE_SAMESITE=none — the browser will no longer block cross-site "
                "sends, so CSRF rests entirely on the origin check"
            )
        if any(o.startswith("http://") for o in settings.cors_origin_list):
            out.append("CORS_ORIGINS contains a plain-http origin")
    return out


def guard_secrets() -> list[str]:
    """Called once at startup. Raises in production, warns in development.

    Returns the problems found so the caller can log them; development keeps
    running because a fresh clone has to be able to boot and be looked at.
    """
    import logging

    log = logging.getLogger(__name__)
    for note in config_warnings():
        log.warning("configuration: %s", note)

    bad = secret_problems()
    if not bad:
        return []
    if settings.is_production:
        raise RuntimeError(
            "Refusing to start: " + "; ".join(bad)
            + ". Generate one with `python -c \"import secrets;print(secrets.token_urlsafe(48))\"` "
              "and set it in the host's environment — never in a file in the repository."
        )
    log.warning("INSECURE CONFIGURATION (development only): %s", "; ".join(bad))
    return bad
