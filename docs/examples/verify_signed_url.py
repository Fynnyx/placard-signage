"""Verify a Placard Signage signed URL (Python 3.8+, standard library only).

Usage in your web app: call verify(request_url, SECRET) and show the read-only view
only when it returns the screen id.
"""
import hashlib
import hmac
import time
from urllib.parse import parse_qs, urlsplit


def verify(url: str, secret: str, now: float | None = None) -> str | None:
    """Returns the screen id when the signature is valid and not expired, else None."""
    parts = urlsplit(url)
    q = parse_qs(parts.query)
    try:
        screen = q["sx_screen"][0]
        exp = int(q["sx_exp"][0])
        sig = q["sx_sig"][0]
    except (KeyError, IndexError, ValueError):
        return None
    if exp < (now if now is not None else time.time()):
        return None
    message = f"{parts.path}\n{screen}\n{exp}".encode()
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return screen if hmac.compare_digest(expected, sig) else None


if __name__ == "__main__":
    import sys

    result = verify(sys.argv[1], sys.argv[2])
    print(f"valid for screen {result}" if result else "invalid")
    sys.exit(0 if result else 1)
