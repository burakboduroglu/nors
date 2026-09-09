#!/usr/bin/env node
// Nors's installer. It copies files into a PocketBase directory and prints the
// steps that cannot be copied for you. It never touches pb_data, never starts
// or stops anything, and never talks to the network.

import { readFile, mkdir, cp, access } from "node:fs/promises"
import { constants } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"))

const exists = async (p) => access(p, constants.F_OK).then(() => true, () => false)

const HELP = `
nors ${pkg.version} — personal ops notes on PocketBase

  nors install <pocketbase-dir>   copy the migration and the page into place
Options
  --force      install even if the target does not look like a PocketBase directory
  -h, --help   this
  -v, --version

The install step only writes pb_migrations/ and pb_public/nors/.
Your data lives in pb_data/ and is never read or written.
`

// A PocketBase directory is recognised by the binary or by pb_data beside it.
// Getting this wrong would scatter files into an unrelated folder, so the check
// is a refusal rather than a warning.
async function assertPocketBase(dir, force) {
  if (force) return
  const looksRight =
    (await exists(join(dir, "pocketbase"))) ||
    (await exists(join(dir, "pocketbase.exe"))) ||
    (await exists(join(dir, "pb_data")))
  if (!looksRight) {
    console.error(
      `Refusing to install: ${dir} holds no pocketbase binary and no pb_data.\n` +
      `Point at the directory the PocketBase executable lives in, or pass --force.`
    )
    process.exit(1)
  }
}

async function install(dir, force) {
  if (!dir) { console.error("Usage: nors install <pocketbase-dir>"); process.exit(1) }
  const target = resolve(dir)
  if (!(await exists(target))) { console.error(`No such directory: ${target}`); process.exit(1) }
  await assertPocketBase(target, force)

  const parts = [
    ["pb_migrations", "pb_migrations"],
    [join("pb_public", "nors"), join("pb_public", "nors")]
  ]
  for (const [from, to] of parts) {
    const dest = join(target, to)
    await mkdir(dirname(dest), { recursive: true })
    await cp(join(ROOT, from), dest, { recursive: true })
    console.log(`  wrote ${to}/`)
  }

  console.log(`
Installed into ${target}

Next, and none of it is automatic:
  1. Restart PocketBase so the migration runs. If it was already running, stop
     it before copying and start it after.
  2. Serve the page. It is at /nors/ once PocketBase is serving pb_public.
  3. Put an auth layer in front of /nors and
     /api/collections/nors_notes. The collection is superuser-only on its own;
     the page is a login form anyone could reach.
  4. A source checkout includes optional seed notes and the import-seeds script.
`)
}

const [cmd, ...rest] = process.argv.slice(2)
const force = rest.includes("--force")

if (cmd === "-v" || cmd === "--version") { console.log(pkg.version); process.exit(0) }
if (!cmd || cmd === "-h" || cmd === "--help") { console.log(HELP); process.exit(0) }
if (cmd === "install") { await install(rest.find((a) => !a.startsWith("--")), force); process.exit(0) }

console.error(`Unknown command: ${cmd}\n${HELP}`)
process.exit(1)
