/// <reference path="../pb_data/types.d.ts" />

// GET /api/nors/summary
//
// Intentionally unauthenticated inside PocketBase: Glance reaches it directly
// over 127.0.0.1, while Caddy returns 404 for the exact public path. Keep that
// Caddy guard in place because note titles are private metadata.
routerAdd("GET", "/api/nors/summary", (e) => {
  const records = e.app.findRecordsByFilter(
    "nors_notes",
    "id != ''",
    "-updated",
    500,
    0
  )

  let drafts = 0
  let pinned = 0
  const recent = []

  for (const record of records) {
    const status = record.getString("status")
    if (status === "draft") drafts++
    if (record.getBool("pinned")) pinned++

    if (recent.length < 5) {
      const kind = record.getString("kind")
      recent.push({
        title: record.getString("title"),
        slug: record.getString("slug"),
        kind: kind === "runbook" ? "Runbook" : kind === "decision" ? "Karar" : "Not",
        status: status,
        updated: record.getString("updated").substring(0, 10)
      })
    }
  }

  return e.json(200, {
    total: records.length,
    drafts: drafts,
    pinned: pinned,
    recent: recent
  })
})
