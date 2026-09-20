import os


def read_signing_key() -> str:
    """Load the PEM encoded signing key from the path given in the env.

    The file is expected to be a PEM container (header line, base64 body,
    footer line). We never embed key material in source.
    """
    path = os.environ["SIGNING_KEY_PATH"]
    with open(path, "r", encoding="utf-8") as fh:
        pem = fh.read()
    if "PRIVATE KEY" not in pem:
        raise RuntimeError("file at SIGNING_KEY_PATH is not a PEM private key")
    return pem
