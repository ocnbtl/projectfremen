# Obsidian Export Strategy (Phase 4 Plan)

This strategy defines a safe first export path from dashboard data into Obsidian-compatible markdown.

## Goals

1. Keep Obsidian as source-of-truth for broader knowledge.
2. Export operational entries (reviews + KPI snapshots) without changing existing note semantics.
3. Avoid destructive sync behavior.

## Guardrails

1. Export only (one-way) in first release.
2. Never delete or overwrite existing vault files automatically.
3. Use deterministic filenames to avoid duplicates.
4. Preserve locked semantics from `docs/03-Obsidian-Integration-Contract.md`.

## Export Scope (v1)

1. Weekly review entries.
2. Monthly review entries.
3. KPI snapshot at export time.

## Proposed File Layout (Export Output)

Output root (outside repo or configurable path):

1. `exports/obsidian/reviews/weekly/YYYY-MM-DD__<entry-id>.md`
2. `exports/obsidian/reviews/monthly/YYYY-MM-DD__<entry-id>.md`
3. `exports/obsidian/kpis/YYYY-MM-DD__kpi-snapshot.md`

## Proposed Frontmatter (Review)

```yaml
---
kind: weekly
scheduled_for: 2026-02-22
source: project-fremen-dashboard
source_entry_id: review-xxxx
exported_at: 2026-02-28T00:00:00.000Z
projects: [Project Fremen]
subjects: [Operations, Review]
---
```

## Proposed Frontmatter (KPI Snapshot)

```yaml
---
kind: kpi_snapshot
snapshot_date: 2026-02-28
source: project-fremen-dashboard
exported_at: 2026-02-28T00:00:00.000Z
projects: [Project Fremen]
subjects: [Operations, KPI]
---
```

## Implementation Sequence

1. Add server-only exporter utility:
   - reads `dashboard/data/reviews.json` and `dashboard/data/kpis.json`
   - renders markdown files with frontmatter
2. Add admin API route for manual export trigger.
3. Add dry-run mode to preview output list without writing files.
4. Add conflict policy:
   - if file exists, append `__v2`, `__v3`, etc.
5. Add audit events for export actions.

## Acceptance Criteria

1. Export does not alter existing review/KPI behavior.
2. Export produces valid markdown files with frontmatter.
3. No secret values appear in output.
4. Operator can run export manually and inspect results before any automation.

