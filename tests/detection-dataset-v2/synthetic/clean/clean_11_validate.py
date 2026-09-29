import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")


def is_valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match(value.strip()))


def normalize_email(value: str) -> str:
    local, _, domain = value.strip().partition("@")
    return f"{local}@{domain.lower()}"
