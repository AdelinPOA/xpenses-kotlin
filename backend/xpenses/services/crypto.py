import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from ..config import settings


def get_fernet(info: bytes = b"xpenses-ldap-bind-pw") -> Fernet:
    # Derive a 32-byte key from jwt_secret using HKDF-SHA256 with a fixed info label.
    # This is safe even when jwt_secret is short or has low entropy in parts of it.
    secret = settings.jwt_secret.encode()
    derived = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=info,
    ).derive(secret)
    key = base64.urlsafe_b64encode(derived)
    return Fernet(key)
