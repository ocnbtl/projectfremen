# Obsidian Export Runbook (Phase 4)

This runbook covers the implemented manual export flow from dashboard data to markdown files.

## API

1. `GET /api/exports/obsidian`
   - Auth required.
   - Returns export root + planned item count (dry-run preview).
2. `POST /api/exports/obsidian`
   - Auth + CSRF required.
   - Body: `{ "dryRun": true }` for preview or `{ "dryRun": false }` for write mode.
   - Returns root path, item count, and sample target paths.

## Export Output

Default output root:

```bash
/Users/ocean/Documents/Project Fremen/dashboard/data/exports/obsidian
```

Override path (optional):

```bash
OBSIDIAN_EXPORT_DIR=/absolute/path/to/obsidian-export
```

Generated files:

1. `reviews/weekly/YYYY-MM-DD__review-<id>.md`
2. `reviews/monthly/YYYY-MM-DD__review-<id>.md`
3. `kpis/YYYY-MM-DD__kpi-snapshot.md`

Conflict policy:

1. Existing files are not overwritten.
2. New writes use suffixes like `__v2`, `__v3`.

## Security

1. Export route requires existing admin session.
2. Export route enforces CSRF token on `POST`.
3. Export actions are written to `dashboard/data/audit-log.json`.

## Admin UI

From `/admin`:

1. Use `Preview Export` to test output without writing files.
2. Use `Write Export Files` to materialize markdown files.
3. Review recent output paths shown in panel.

## Notes

1. Export is one-way only (dashboard -> markdown files).
2. Export directory is git-ignored (`dashboard/data/exports/`).
3. Export format follows strategy in `docs/13-Obsidian-Export-Strategy.md`.

