# EVASION TEST FIXTURE -- the PEM header never appears literally; it is
# recovered by base64-decoding the blob below (body is fake, not a real key).
import base64

# outer base64 of an entire EC private key PEM block (header, body, footer)
_OUTER = (
    "LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0tCkVYQU1QTEVFQ0tFWU5PVFJF"
    "QUxFWEFNUExFRUNLRVlOT1RSRUFMRVhBTVBMRU9OTFlGT1JURVNUSU5HCi0tLS0t"
    "RU5EIEVDIFBSSVZBVEUgS0VZLS0tLS0K"
)

pem = base64.b64decode(_OUTER).decode()

def load_key() -> str:
    return pem  # this string is a PEM EC PRIVATE KEY block at runtime
