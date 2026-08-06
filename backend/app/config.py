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

    # Dev server bind — change API_PORT in .env to switch ports easily.
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    reload: bool = Field(default=True)

    # Session tokens. Override JWT_SECRET in production — the default is a
    # development convenience only.
    jwt_secret: str = "jaikvin-dev-secret-change-me"
    # 24 hours: every session — user and admin — expires a day after sign-in.
    jwt_expire_minutes: int = 60 * 24

    # Encrypts the readable-back copy of each password (see app/vault.py).
    # Blank derives one from JWT_SECRET, so an existing deployment needs no
    # second secret; changing either makes stored copies unreadable.
    password_vault_key: str = ""
    # How long a passcode-confirmed "yes, it is really me" lasts before an
    # admin must confirm again to reveal or change another password.
    stepup_ttl_minutes: int = 10

    # ---------- Email one-time passcodes ----------
    # A user verifies their address once, on first sign-in. An admin re-verifies
    # whenever their last verification is older than `otp_admin_reverify_hours`,
    # i.e. once per session lifetime.
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
    # Development escape hatch: return the code in the API response when no
    # mailbox is reachable. NEVER enable in production.
    otp_dev_echo: bool = False

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
