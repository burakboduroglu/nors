#!/usr/bin/env python3
"""Insert Glance 'Apps' page between Home and Services; park Skadi there.

Removes any existing managed subs-tracker block, strips a previous Apps page if
present, then inserts a fresh Apps page (Skadi widget + app bookmark links)
immediately before the Services page. Safe to re-run.

Run on the server against /etc/glance/glance.yml (Burak pastes; agents do not
SSH-write). Companion: copy skadi logo to /opt/glance/assets/skadi.png first.
"""
from __future__ import annotations

import datetime
import pathlib
import shutil
import sys

PATH = pathlib.Path("/etc/glance/glance.yml")
SERVICES = "  - name: Services"
HOME = "  - name: Home"
APPS = "  - name: Apps"
OPEN = "          # >>> subs-tracker (managed, do not hand-edit) >>>"
CLOSE = "          # <<< subs-tracker <<<"
FORM = "https://bbp.burakboduroglu.com.tr/subs/"

# Prefer the Skadi-shipped widget next to this script's cousin in skadi/, else
# fall back to an inline TR block matching production.
WIDGET_CANDIDATES = [
    pathlib.Path(__file__).resolve().parent / "widget.tr.yml",
    pathlib.Path.home() / "projects/skadi/glance/widget.tr.yml",
    pathlib.Path("/tmp/nors-glance/widget.tr.yml"),
]


def load_widget() -> list[str]:
    for p in WIDGET_CANDIDATES:
        if p.is_file():
            raw = p.read_text()
            lines = [
                l
                for l in raw.splitlines()
                if not l.lstrip().startswith("#") or l.startswith("          #")
            ]
            text = "\n".join(lines).strip("\n").replace("__SKADI_URL__", FORM)
            return text.split("\n")
    # Inline fallback (matches production widget.tr.yml shape).
    return f"""          - type: custom-api
            title: Abonelikler
            title-url: {FORM}
            cache: 30m
            url: http://127.0.0.1:8090/api/subs/summary
            template: |
              <div class="flex justify-between text-center margin-bottom-15">
                <div>
                  <div class="color-highlight size-h3">{{{{ printf "%.0f" (.JSON.Float "monthly_net") }}}} ₺</div>
                  <div class="size-h6">AYLIK NET</div>
                </div>
                <div>
                  <div class="size-h3">{{{{ printf "%.0f" (.JSON.Float "yearly_net") }}}} ₺</div>
                  <div class="size-h6">YILLIK</div>
                </div>
                <div>
                  <div class="size-h3 color-positive">{{{{ printf "%.0f" (.JSON.Float "monthly_cashback") }}}} ₺</div>
                  <div class="size-h6">CASHBACK</div>
                </div>
              </div>
              {{{{ $upcoming := .JSON.Array "upcoming" }}}}
              {{{{ if $upcoming }}}}
              <ul class="list list-gap-10 collapsible-container" data-collapse-after="5">
                {{{{ range $upcoming }}}}
                <li class="flex items-center gap-10">
                  {{{{ $logo := .String "logo" }}}}
                  {{{{ if $logo }}}}
                  <img class="shrink-0" src="{{{{ $logo }}}}" alt="" loading="lazy"
                       style="width: 24px; height: 24px; object-fit: contain; border-radius: 5px">
                  {{{{ end }}}}
                  <div class="grow text-truncate">
                    <div class="text-truncate">{{{{ .String "name" }}}}</div>
                    <div class="size-h6">
                      {{{{ $d := .Int "days" }}}}
                      {{{{ if .Bool "overdue" }}}}<span class="color-negative">gecikmiş</span>
                      {{{{ else if eq $d 0 }}}}<span class="color-negative">bugün</span>
                      {{{{ else if le $d 3 }}}}<span class="color-highlight">{{{{ $d }}}} gün</span>
                      {{{{ else }}}}{{{{ $d }}}} gün{{{{ end }}}}
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div>{{{{ printf "%.0f" (.Float "amount") }}}} {{{{ .String "currency" }}}}</div>
                    {{{{ if gt (.Float "cashback") 0.0 }}}}
                    <div class="size-h6 color-positive">−{{{{ printf "%.0f" (.Float "cashback") }}}}</div>
                    {{{{ end }}}}
                  </div>
                </li>
                {{{{ end }}}}
              </ul>
              {{{{ else }}}}
              <p class="size-h6 color-subdue">45 gün içinde ödeme yok.</p>
              {{{{ end }}}}
              {{{{ if .JSON.Bool "fx_stale" }}}}
              <p class="size-h6 color-negative margin-top-10">
                Kur güncellenemedi{{{{ if .JSON.String "fx_date" }}}} — {{{{ .JSON.String "fx_date" }}}} kuru kullanıldı{{{{ end }}}}
              </p>
              {{{{ end }}}}
              {{{{ if gt (.JSON.Int "unconverted") 0 }}}}
              <p class="size-h6 color-negative margin-top-5">
                {{{{ .JSON.Int "unconverted" }}}} kayıt kur bulunamadığı için toplama dahil edilmedi.
              </p>
              {{{{ end }}}}
              <p class="margin-top-15 text-right">
                <a href="{FORM}?add=1" class="color-highlight size-h6">+ Abonelik ekle</a>
              </p>""".split(
        "\n"
    )


def strip_managed(lines: list[str]) -> list[str]:
    if OPEN not in lines:
        return lines
    start = lines.index(OPEN)
    if CLOSE not in lines[start:]:
        sys.exit("opening sentinel without closing — not touching the file")
    end = lines.index(CLOSE, start)
    del lines[start : end + 1]
    while start < len(lines) and lines[start].strip() == "":
        del lines[start]
    return lines


def strip_apps_page(lines: list[str]) -> list[str]:
    """Remove a previous Apps page block (from its header up to Services)."""
    if APPS not in lines:
        return lines
    start = lines.index(APPS)
    if SERVICES not in lines[start:]:
        sys.exit("Apps page found but Services header missing after it — abort")
    end = lines.index(SERVICES, start)
    del lines[start:end]
    while start < len(lines) and lines[start].strip() == "":
        del lines[start]
    return lines


def apps_page(widget_lines: list[str]) -> list[str]:
    head = [
        "  - name: Apps",
        "    columns:",
        "      - size: small",
        "        widgets:",
        "",
        OPEN,
    ]
    tail = [
        CLOSE,
        "",
        "      - size: full",
        "        widgets:",
        "          - type: bookmarks",
        "            title: Apps",
        "            groups:",
        "              - title: Live",
        "                color: 200 70% 55%",
        "                links:",
        "                  - title: Skadi",
        "                    url: https://bbp.burakboduroglu.com.tr/subs/",
        "                    icon: /assets/skadi.png",
        "",
    ]
    return head + widget_lines + tail


def main() -> None:
    if not PATH.is_file():
        sys.exit(f"missing {PATH}")
    text = PATH.read_text()
    lines = text.splitlines()

    if HOME not in lines or SERVICES not in lines:
        sys.exit("expected Home and Services page headers — abort")

    lines = strip_managed(lines)
    lines = strip_apps_page(lines)

    if lines.count(SERVICES) != 1:
        sys.exit(f"expected one Services header, found {lines.count(SERVICES)}")

    widget = load_widget()
    block = apps_page(widget)
    i = lines.index(SERVICES)
    # Keep a blank line before Services if missing.
    insert = block if block[-1] == "" else block + [""]
    lines[i:i] = insert

    new = "\n".join(lines) + "\n"
    if new == text:
        print("already up to date, nothing written")
        return

    backup = PATH.with_name(f"{PATH.name}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(PATH, backup)
    PATH.write_text(new)
    print(f"backed up to {backup}")
    print(f"inserted Apps page ({len(insert)} lines) before Services")


if __name__ == "__main__":
    main()
