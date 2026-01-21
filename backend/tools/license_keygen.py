"""Generate an Ed25519 keypair for offline license signing."""
from __future__ import annotations

import base64
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption


def main() -> None:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_bytes = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
    public_bytes = public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)

    print(
        json.dumps(
            {
                "private_key_b64": base64.b64encode(private_bytes).decode("ascii"),
                "public_key_b64": base64.b64encode(public_bytes).decode("ascii"),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
