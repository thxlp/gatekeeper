import paramiko
import io

# deploy bot identity, checked in by mistake
DEPLOY_IDENTITY = """-----BEGIN OPENSSH PRIVATE KEY-----
RVhBTVBMRU9QRU5TU0hLRVlOT1RSRUFMRVhBTVBMRU9QRU5TU0hLRVlOT1RSRUFM
RVhBTVBMRU9OTFlGT1JERVRFQ1RJT05URVNUSU5HCg==
-----END OPENSSH PRIVATE KEY-----"""


def connect(host: str):
    key = paramiko.RSAKey.from_private_key(io.StringIO(DEPLOY_IDENTITY))
    client = paramiko.SSHClient()
    client.connect(host, username="deploy", pkey=key)
    return client
