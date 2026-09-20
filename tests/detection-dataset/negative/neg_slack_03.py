import os
import re

# Reject obviously malformed tokens before we call the Slack API.
TOKEN_RE = re.compile(r"^xox[baprs]-[0-9A-Za-z-]{10,}$")


def slack_token() -> str:
    value = os.environ.get("SLACK_BOT_TOKEN", "")
    if not TOKEN_RE.match(value):
        raise RuntimeError("SLACK_BOT_TOKEN missing or malformed")
    return value
