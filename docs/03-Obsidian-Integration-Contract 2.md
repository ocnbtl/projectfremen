# Obsidian Integration Contract

This contract ensures the website aligns to your existing vault logic.

## Non-Negotiable Rules

1. Do not replace your property vocabulary.
2. Do not infer parent-child from business hierarchy.
3. Use `nav_north` / `nav_south` only as direct spawned-note lineage.
4. Keep `Project Fremen`, `Project Iceflake`, and `Project Pint` as separate project entities in metadata.

## Metadata Fields We Read

The dashboard ingestion process should parse, store, and index:

1. `uid`
2. `name`
3. `class`
4. `kind`
5. `stage`
6. `status`
7. `growth`
8. `intent`
9. `projects`
10. `areas`
11. `subjects`
12. `related`
13. `dashboards`
14. `due_date`
15. `next_review`
16. `review_cadence`
17. `updated_iso`

## Relationship Semantics

1. `nav_north` / `nav_south`:
   - navigation lineage from main note to spawned sub-notes
2. `nav_west` / `nav_east`:
   - optional predecessor/successor flow
3. `succession_group` / `succession_index`:
   - sequence membership and order

These semantics are preserved and never overloaded.

## Website Layer Mapping

Website hierarchy is operational, not note-lineage:

1. Holding entity: Unigentamos
2. Brand units:
   - pngwn
   - Ranosa Decor

This hierarchy is represented in app data tables, not as Obsidian parent-child note mapping.
