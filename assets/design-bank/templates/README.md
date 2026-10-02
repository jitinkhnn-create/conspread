# design-bank/templates

Reusable imagery designed to sit inside templates: background textures, frames, paper grains,
abstract shapes. **Not** layout templates. Those live in `/templates/` at the repo root.

Two systems, kept separate:

| System | Answers | Location |
|---|---|---|
| Templates | How is the post composed (layout, type, regions)? | `templates/active/`, `proposed/`, `archived/` |
| Design Bank | What imagery goes in it (photo, illustration, texture)? | `assets/design-bank/` |

## Adding an asset
1. Routine 04B proposes or generates the asset.
2. It is inspected and refined if needed.
3. A human approves it out-of-band.
4. Add an entry to `manifest.json`:

```json
{
  "id": "bt_bg_paper_warm_01",
  "file": "assets/design-bank/templates/bg_paper_warm_01.png",
  "kind": "textured",
  "imagery_type": "abstract",
  "tags": ["warm", "paper", "calm"],
  "contains_text": false,
  "contains_people": false,
  "approved_date": "YYYY-MM-DD",
  "last_used": null
}
```

Rules: no asset containing rendered text, ever. Every asset must be safe for an audience aged 11 to 15.
