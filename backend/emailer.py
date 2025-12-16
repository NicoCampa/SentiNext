from __future__ import annotations

import os
import smtplib
from email.message import EmailMessage


class EmailConfigError(RuntimeError):
    pass


def _email_disabled() -> bool:
    return os.getenv("SENTINEXT_DISABLE_EMAIL", "false").lower() in {"1", "true", "yes"}


def _get_smtp_config() -> dict:
    host = os.getenv("SENTINEXT_SMTP_HOST")
    port_raw = os.getenv("SENTINEXT_SMTP_PORT", "587")
    username = os.getenv("SENTINEXT_SMTP_USER")
    password = os.getenv("SENTINEXT_SMTP_PASS")
    mail_from = os.getenv("SENTINEXT_SMTP_FROM")
    use_tls = os.getenv("SENTINEXT_SMTP_TLS", "true").lower() in {"1", "true", "yes"}

    if not host or not mail_from:
        raise EmailConfigError(
            "SMTP not configured. Set SENTINEXT_SMTP_HOST and SENTINEXT_SMTP_FROM (and credentials if required)."
        )
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise EmailConfigError("Invalid SENTINEXT_SMTP_PORT") from exc

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "mail_from": mail_from,
        "use_tls": use_tls,
    }


def send_pdf_email(*, to_email: str, subject: str, body_text: str, pdf_bytes: bytes, filename: str) -> None:
    if _email_disabled():
        return

    cfg = _get_smtp_config()

    message = EmailMessage()
    message["From"] = cfg["mail_from"]
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body_text)
    message.add_attachment(
        pdf_bytes,
        maintype="application",
        subtype="pdf",
        filename=filename,
    )

    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as smtp:
        smtp.ehlo()
        if cfg["use_tls"]:
            smtp.starttls()
            smtp.ehlo()
        if cfg["username"] and cfg["password"]:
            smtp.login(cfg["username"], cfg["password"])
        smtp.send_message(message)
