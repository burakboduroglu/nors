#!/usr/bin/env python3
"""Add the Nors bookmark and Quick note widget to Glance's Apps page.

The Quick note card is deliberately an HTML widget. It opens Nors's protected
editor in the browser and never sends note text through Glance or a public API.

Idempotent and fail-closed: existing managed blocks must match exactly, and the
Apps/Services boundaries plus Skadi/subs anchors must be present.

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

# Older staged versions used a second bookmark. Remove it when upgrading to the
# real widget so Glance does not show two Quick note entries.
OLD_QUICK_BLOCK = [
    "                  - title: Quick note",
    "                    url: https://bbp.burakboduroglu.com.tr/nors/?new=1",
    "                    icon: /assets/nors.png",
]

SUBS_END = "          # <<< subs-tracker <<<"
QUICK_START = "          # >>> nors-quick-note (managed, do not hand-edit) >>>"
QUICK_END = "          # <<< nors-quick-note <<<"
QUICK_WIDGET = [
    QUICK_START,
    "          - type: html",
    "            title: Quick note",
    "            title-url: https://bbp.burakboduroglu.com.tr/nors/",
    "            source: |",
    '              <div class="flex items-center gap-10">',
    '                <img src="/assets/nors.png" alt="" style="width: 36px; height: 36px; object-fit: contain; border-radius: 8px">',
    "                <div>",
    '                  <div class="size-h4">Fikri kaybetmeden yakala.</div>',
    '                  <div class="size-h6 color-subdue">Nors editörünü doğrudan açar.</div>',
    "                </div>",
    "              </div>",
    '              <p class="margin-top-15 text-right">',
    '                <a href="https://bbp.burakboduroglu.com.tr/nors/?new=1" class="color-highlight size-h6">+ Yeni not oluştur →</a>',
    "              </p>",
    QUICK_END,
]


def page_bounds(lines: list[str]) -> tuple[int, int]:
    apps = [i for i, line in enumerate(lines) if line == APPS]
    services = [i for i, line in enumerate(lines) if line == SERVICES]
    if len(apps) != 1:
        sys.exit(f"expected exactly one '{APPS}' line, found {len(apps)} — not touching the file")
    if len(services) != 1 or services[0] < apps[0]:
        sys.exit(f"expected one '{SERVICES}' after Apps — not touching the file")
    return apps[0], services[0]


def matches(lines: list[str], needle: str, start: int, stop: int) -> list[int]:
    return [i for i in range(start, stop) if lines[i] == needle]


def main() -> None:
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not path.is_file():
        sys.exit(f"missing {path}")
    text = path.read_text()
    lines = text.splitlines()
    apps, services = page_bounds(lines)
    changed = False

    old_quick = matches(lines, OLD_QUICK_BLOCK[0], apps, services)
    if len(old_quick) > 1:
        sys.exit("multiple legacy Quick note links inside Apps — not touching the file")
    if old_quick:
        quick = old_quick[0]
        if lines[quick : quick + len(OLD_QUICK_BLOCK)] != OLD_QUICK_BLOCK:
            sys.exit("legacy Quick note block is unexpected — not touching the file")
        del lines[quick : quick + len(OLD_QUICK_BLOCK)]
        changed = True

    apps, services = page_bounds(lines)
    try:
        skadi = lines.index(SKADI_TITLE, apps, services)
    except ValueError:
        sys.exit("Skadi link not found inside the Apps page — not touching the file")
    if lines[skadi : skadi + 3] != [SKADI_TITLE, SKADI_URL, SKADI_ICON]:
        sys.exit("Skadi block has unexpected url/icon lines — not touching the file")

    nors_matches = matches(lines, NORS_TITLE, apps, services)
    if len(nors_matches) > 1:
        sys.exit("multiple Nors links inside Apps — not touching the file")
    if nors_matches:
        nors = nors_matches[0]
        if lines[nors : nors + len(NORS_BLOCK)] != NORS_BLOCK:
            sys.exit("Nors block has unexpected url/icon lines — not touching the file")
    else:
        lines[skadi + 3 : skadi + 3] = NORS_BLOCK
        changed = True

    apps, services = page_bounds(lines)
    widget_starts = matches(lines, QUICK_START, apps, services)
    widget_ends = matches(lines, QUICK_END, apps, services)
    if len(widget_starts) > 1 or len(widget_ends) > 1:
        sys.exit("multiple Quick note widget markers inside Apps — not touching the file")
    if widget_starts or widget_ends:
        if len(widget_starts) != 1 or len(widget_ends) != 1:
            sys.exit("incomplete Quick note widget markers — not touching the file")
        start, end = widget_starts[0], widget_ends[0]
        if end < start or lines[start : end + 1] != QUICK_WIDGET:
            sys.exit("Quick note widget differs from the managed block — not touching the file")
    else:
        subs_ends = matches(lines, SUBS_END, apps, services)
        if len(subs_ends) != 1:
            sys.exit("expected one managed subscriptions widget inside Apps — not touching the file")
        lines[subs_ends[0] + 1 : subs_ends[0] + 1] = ["", *QUICK_WIDGET]
        changed = True

    if not changed:
        print("already up to date, nothing written")
        return

    new = "\n".join(lines) + "\n"
    backup = path.with_name(f"{path.name}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(path, backup)
    path.write_text(new)
    print(f"backed up to {backup}")
    print("ensured Nors bookmark and Quick note widget (Apps page)")


if __name__ == "__main__":
    main()
