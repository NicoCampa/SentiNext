"""Sign a license payload JSON with an Ed25519 private key."""
from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption


def canonical_payload(payload: dict) -> bytes:
    data = {key: value for key, value in payload.items() if key != "signature"}
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def load_private_key(value: str) -> Ed25519PrivateKey:
    raw = base64.b64decode(value)
    return Ed25519PrivateKey.from_private_bytes(raw)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sign a license JSON payload.")
    parser.add_argument("--input", required=True, help="Path to the license payload JSON (without signature).")
    parser.add_argument("--output", required=True, help="Path to write the signed license JSON.")
    parser.add_argument("--private-key", required=True, help="Ed25519 private key (base64).")
    args = parser.parse_args()

    payload_path = Path(args.input).expanduser()
    payload = json.loads(payload_path.read_text())

    private_key = load_private_key(args.private_key)
    signature = private_key.sign(canonical_payload(payload))
    payload["signature"] = base64.b64encode(signature).decode("ascii")

    output_path = Path(args.output).expanduser()
    output_path.write_text(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
