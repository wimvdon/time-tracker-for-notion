"""Turns the ANDROID_KEYSTORE_BASE64 secret back into a keystore file.

Forgiving about how the text was copied (line breaks, quotes, certutil's
-----BEGIN/END----- lines, URL-safe base64, missing '=' padding, encoded twice)
and, when it still fails, says what is wrong without printing the secret.
"""

import base64
import binascii
import re
import sys
import unicodedata

ALPHABET = re.compile(r"[A-Za-z0-9+/=]")


def looks_like_keystore(data: bytes) -> bool:
    # JKS starts with FEEDFEED, JCEKS with CECECECE, PKCS12 is a DER SEQUENCE (0x30).
    return data[:4] in (b"\xfe\xed\xfe\xed", b"\xce\xce\xce\xce") or data[:1] == b"\x30"


def decode(text: str) -> bytes:
    text = re.sub(r"-----[^-\n]*-----", "", text).replace("\ufeff", "").replace("\u200b", "")
    text = "".join(text.split()).strip("\"'`")
    text = text.replace("-", "+").replace("_", "/").rstrip("=")
    bad = sorted({c for c in text if not ALPHABET.fullmatch(c)})
    if bad:
        names = ", ".join(f"'{c}' ({unicodedata.name(c, hex(ord(c)))})" for c in bad[:5])
        fail(
            f"the text contains {len(bad)} kind(s) of character that never appear in base64: {names}. "
            f"It is {len(text)} characters long; a keystore is usually 2000-4000."
        )
    if len(text) % 4 == 1:
        fail(f"the text is {len(text)} characters long, which cannot be complete base64; it was probably cut off.")
    return base64.b64decode(text + "=" * (-len(text) % 4))


def fail(reason: str) -> None:
    print(f"::error::ANDROID_KEYSTORE_BASE64 is not usable: {reason} Create it again as described in the README.")
    sys.exit(1)


def main() -> None:
    secret, out = sys.argv[1], sys.argv[2]
    with open(secret, encoding="utf-8", errors="replace") as f:
        data = decode(f.read())
    # Encoded twice (for example certutil run on an already encoded file).
    if not looks_like_keystore(data):
        try:
            again = decode(data.decode("ascii"))
            if looks_like_keystore(again):
                data = again
        except (UnicodeDecodeError, binascii.Error, SystemExit):
            pass
    if not looks_like_keystore(data):
        fail(f"it decodes to {len(data)} bytes that do not look like a .jks or .p12 keystore.")
    with open(out, "wb") as f:
        f.write(data)


if __name__ == "__main__":
    main()
