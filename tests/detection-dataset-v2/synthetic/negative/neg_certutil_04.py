# Decoding base64 in-process with the standard library instead of shelling
# out to a Windows utility.
import base64
import pathlib


def decode_file(src: str, dst: str) -> None:
    data = base64.b64decode(pathlib.Path(src).read_text(), validate=True)
    pathlib.Path(dst).write_bytes(data)
