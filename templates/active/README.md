# templates/active

Canonical templates. One folder per template: `metadata.json` (contract, see `../metadata.schema.json`), `render.py`
(deterministic Pillow renderer), and `preview/` (layout previews).

**`preview/` renders use placeholder text ("Sample layout text") to show composition only. They are not posts and
must never be published.** Regenerate with `python tools/compose_post.py --sample --template <id> --out-dir templates/active/<id>/preview`.

| Template | Format | Canvas | From reference |
|---|---|---|---|
| `numbered_notes` | carousel (`cover_desk`, `content_numbered`) | 1080x1350 | carousel set 01 |
| `quote_glyph` | single post (`quote_card`) | 1080x1350 | single 03 |
| `object_hero_square` | single post (`object_hero`) | 1080x1080 | single 02 |
| `photo_split` | single post (`split_statement`) | 1080x1350 | single 01 |

Single-post canvases follow the references (two are 4:5 portrait), which departs from the brief's flat 1080x1080. Set
`canvas` in a template's `metadata.json` to change it.
