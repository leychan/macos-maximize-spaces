#!/usr/bin/env python3
"""Build a KWin script package using only the Python standard library."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
output = root / "dist" / "macos-maximize-spaces.kwinscript"
output.parent.mkdir(exist_ok=True)
files = [root / "metadata.json", root / "README.md", root / "LICENSE"]
files += sorted((root / "contents").rglob("*"))
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for path in files:
        if path.is_file():
            archive.write(path, path.relative_to(root))
print(output)
