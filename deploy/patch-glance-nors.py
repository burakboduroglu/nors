#!/usr/bin/env python3
"""Add Nors and Quick note bookmarks to the Glance Apps page's Live group.

Apps already exists (Home -> Apps -> Services) with the Skadi widget +
Skadi bookmark. This inserts two bookmarks after Skadi:

                  - title: Nors
                    url: https://bbp.burakboduroglu.com.tr/nors/
                    icon: /assets/nors.png
                  - title: Quick note
                    url: https://bbp.burakboduroglu.com.tr/nors/?new=1
                    icon: /assets/nors.png

Idempotent: a re-run is a no-op when the Nors link is already inside
the Apps page. Aborts when the Apps/Services headers or the Skadi
link are missing. Icon staging is separate (see DEPLOY-glance-nors.md).

Usage: sudo python3 patch-glance-nors.py [/etc/glance/glance.yml]
"""
from __future__ import annotations

import datetime
import pathlib
import shutil
import sys

DEFAULT_PATH = pathlib.Path("/etc/glance/glance.yml")
APPS = "  - name: Apps"
SERVICES = "  - name: Services"
SKADI_TITLE = "                  - title: Skadi"
SKADI_URL = "                    url: https://bbp.burakboduroglu.com.tr/subs/"
SKADI_ICON = "                    icon: /assets/skadi.png"
NORS_TITLE = "                  - title: Nors"
NORS_URL = "                    url: https://bbp.burakboduroglu.com.tr/nors/"
NORS_ICON = "                    icon: /assets/nors.png"
NORS_BLOCK = [NORS_TITLE, NORS_URL, NORS_ICON]
QUICK_TITLE = "                  - title: Quick note"
QUICK_URL = "                    url: https://bbp.burakboduroglu.com.tr/nors/?new=1"
QUICK_ICON = "                    icon: /assets/nors.png"
QUICK_BLOCK = [QUICK_TITLE, QUICK_URL, QUICK_ICON]


def main() -> None:
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not path.is_file():
        sys.exit(f"missing {path}")
    text = path.read_text()
    lines = text.splitlines()

    apps = [i for i, ln in enumerate(lines) if ln == APPS]
    if len(apps) != 1:
        sys.exit(f"expected exactly one '{APPS}' line, found {len(apps)} — not touching the file")
    services = [i for i, ln in enumerate(lines) if ln == SERVICES]
    if len(services) != 1 or services[0] < apps[0]:
        sys.exit(f"expected one '{SERVICES}' after Apps — not touching the file")

    try:
        skadi = lines.index(SKADI_TITLE, apps[0], services[0])
    except ValueError:
        sys.exit("Skadi link not found inside the Apps page — not touching the file")
    if lines[skadi + 1] != SKADI_URL or lines[skadi + 2] != SKADI_ICON:
        sys.exit("Skadi block has unexpected url/icon lines — not touching the file")

    nors_matches = [i for i in range(apps[0], services[0]) if lines[i] == NORS_TITLE]
    if len(nors_matches) > 1:
        sys.exit("multiple Nors links inside Apps — not touching the file")
    changed = False
    if nors_matches:
        nors = nors_matches[0]
        if lines[nors : nors + 3] != NORS_BLOCK:
            sys.exit("Nors block has unexpected url/icon lines — not touching the file")
    else:
        nors = skadi + 3
        lines[nors:nors] = NORS_BLOCK
        services[0] += len(NORS_BLOCK)
        changed = True

    quick_matches = [i for i in range(apps[0], services[0]) if lines[i] == QUICK_TITLE]
    if len(quick_matches) > 1:
        sys.exit("multiple Quick note links inside Apps — not touching the file")
    if quick_matches:
        quick = quick_matches[0]
        if lines[quick : quick + 3] != QUICK_BLOCK:
            sys.exit("Quick note block has unexpected url/icon lines — not touching the file")
    else:
        lines[nors + 3 : nors + 3] = QUICK_BLOCK
        changed = True

    if not changed:
        print("already up to date, nothing written")
        return

    new = "\n".join(lines) + "\n"
    if new == text:
        print("already up to date, nothing written")
        return

    backup = path.with_name(f"{path.name}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(path, backup)
    path.write_text(new)
    print(f"backed up to {backup}")
    print("ensured Nors and Quick note bookmarks (Apps page, Live group)")


if __name__ == "__main__":
    main()
