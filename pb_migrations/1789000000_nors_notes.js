/// <reference path="../pb_data/types.d.ts" />

// Nors: personal ops notes. Superuser-only (null API rules).
// Served as a Solid app from pb_public/nors/ behind Caddy + Access.
migrate((app) => {
  const notes = new Collection({
    name: "nors_notes",
    type: "base",
    fields: [
      { name: "title", type: "text", required: true, max: 160 },
      { name: "slug", type: "text", required: true, max: 80 },
      { name: "summary", type: "text", max: 400 },
      { name: "body", type: "editor", required: false },
      {
        name: "kind",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["diagram", "runbook", "reference", "scratch"],
      },
      { name: "tags", type: "json", maxSize: 8000 },
      { name: "pinned", type: "bool" },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["draft", "published", "archived"],
      },
      { name: "sort", type: "number" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_nors_notes_slug ON nors_notes (slug)",
      "CREATE INDEX idx_nors_notes_status ON nors_notes (status)",
      "CREATE INDEX idx_nors_notes_sort ON nors_notes (sort)",
    ],
  })
  app.save(notes)
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("nors_notes"))
  } catch (_) {
    // already gone
  }
})
