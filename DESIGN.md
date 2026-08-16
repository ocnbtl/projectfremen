# Unigentamos design system

## Direction

The shared direction is a **calm operations desk**. Pages should feel structured, current, and useful at a glance—not like a collection of disconnected dashboards. The signature interaction is the **attention runway**: a compact Now / Next / Watch worklist that makes the current operating horizon immediately legible.

## Hierarchy

1. The global header provides orientation, module navigation, viewport tools, and search.
2. Each page names the workspace and exposes no more than one primary action plus a restrained secondary action set.
3. Current attention or the module's main record workspace is the dominant surface.
4. Supporting status, activity, ownership, and help remain quieter and smaller.

Avoid equal-weight card grids, repeated navigation inside the page, floating controls without a clear owner, or oversized introductions that push real work below the fold.

## Shared geometry

- Base spacing unit: 4px.
- Common gaps: 8px for controls, 12px within compact groups, 16px within panels, 24px between major sections.
- Global header: one fixed row; 48px control surface within a 72px reserved page offset.
- Page gutters: fluid 16–32px. The high-density Command Center may use up to roughly 1920px; record workspaces should use available width up to roughly 1680px rather than subtracting assumed sidebars.
- Controls: 7–8px radius. Panels: 12px radius. Overlays: 14–16px radius.
- Base depth is borders and surface contrast. Shadows are reserved for the global header, menus, dialogs, and raised mobile rails.

## Responsive navigation

- Full brand, module navigation, search, and utilities appear only when they fit as one row.
- At tablet and smaller desktop widths, switch to one compact navigation menu and hide inline search; search remains available inside navigation and in Vault.
- At narrow mobile widths, collapse the wordmark while retaining the recognizable brand mark and accessible label.
- Page content begins below one canonical header offset. Module sidebars and action rails use the same offset instead of independent hard-coded values.

## Color

- Ink: primary text and high-confidence actions.
- Eucalyptus green: brand, selected navigation, positive connectivity.
- Paper white and cool slate: canvas, panels, inset controls, and dividers.
- Amber: upcoming work or attention.
- Crimson: only urgent or destructive meaning.
- Blue: links and informational status where needed, not a competing brand theme.

Colors must be expressed through shared semantic tokens wherever practical. Module identity may use restrained accents, but not a separate visual system.

## Typography

- Plus Jakarta Sans: page titles and key section headings.
- Inter: body text, controls, and record content.
- Inconsolata: timestamps, IDs, financial figures, and other compact data.
- Body defaults to 14px in dense workspaces, with 16px supporting copy only when useful.
- Page headings should normally stay within 28–36px; section headings within 18–22px.

## Module convergence

- Command Center, Finance, and Personal Ops share the same canvas, panel, typography, border, spacing, and responsive-shell rules.
- Specialized module views keep their domain-specific record layouts and workflows.
- Command Center does not duplicate module navigation or owner records; it summarizes and links into canonical owners.
- Finance preserves guarded actions and audit boundaries. Styling must never imply that unavailable execution paths are active.

## Interaction and content

- Every control needs a clear purpose and visible state.
- Prefer short labels such as “Open Vault,” “Add note,” and “Review now.”
- Status copy should describe what the user can do next.
- Hover may add a subtle surface or border change; movement should be slight and never required to understand state.
- Focus-visible treatment must remain obvious, and touch targets should be at least 44px where they are primary mobile controls.

This system is inferred from Ocean's explicit product direction and the established Unigentamos interface. Revisit it only when a new surface genuinely requires a different mode, not for page-by-page decoration.
