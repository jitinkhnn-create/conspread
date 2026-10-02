# chapters/

One Markdown file per chapter, named `ch01.md` … `ch16.md`. Created in Phase 1 from the supplied book.

- Text is the workbook's own wording, unedited (typographic quotes and dashes are fine; the grounding check normalises them).
- Start each file with a `# Chapter N: Title` heading, then the body. Keep the original section headings so atoms can point at them via `source_ref.locator`.
- These files are the **ground truth** for `python tools/validate.py grounding` and `python tools/validate.py bank`. Anything presented as a quote must be found here word for word.
- Do not add commentary to these files. Notes belong in `content_bank.json`.
- Original source files (PDF/DOCX/etc.) go in `../source/`.
