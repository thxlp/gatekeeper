import os
import re

# Validate that the operator pasted a well formed key id before we boot.
KEY_ID_RE = re.compile(r"^AKIA[0-9A-Z]{16}$")


def load_access_key() -> str:
    value = os.environ.get("AWS_ACCESS_KEY_ID", "")
    if not KEY_ID_RE.match(value):
        raise RuntimeError("AWS_ACCESS_KEY_ID is missing or malformed")
    return value
