#!/usr/bin/env python3
"""Block the loopback-only Nors summary endpoint at the public Caddy edge."""
from __future__ import annotations

import datetime
import pathlib
import shutil
import subprocess
import sys

DEFAULT_PATH = pathlib.Path("/etc/caddy/Caddyfile")
SUBS_GUARD = "      respond /api/subs/summary 404"
NORS_GUARD = "      respond /api/nors/summary 404"


def main() -> None:
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not path.is_file():
        sys.exit(f"missing {path}")
    text = path.read_text()

    if text.count(NORS_GUARD) == 1:
        print("Caddy guard already up to date, nothing written")
        return
    if text.count(NORS_GUARD) > 1:
        sys.exit("multiple Nors summary guards — not touching the file")
    if text.count(SUBS_GUARD) != 1:
        sys.exit("expected exactly one subscriptions summary guard — not touching the file")

    backup = path.with_name(f"{path.name}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(path, backup)
    path.write_text(text.replace(SUBS_GUARD, f"{SUBS_GUARD}\n{NORS_GUARD}"))

    try:
        subprocess.run(
            [
                "/usr/bin/caddy",
                "validate",
                "--config",
                str(path),
                "--adapter",
                "caddyfile",
            ],
            check=True,
        )
    except Exception:
        shutil.copy2(backup, path)
        sys.exit(f"Caddy validation failed; restored {backup}")

    print(f"backed up to {backup}")
    print("ensured public 404 guard for /api/nors/summary")


if __name__ == "__main__":
    main()
