export const FIGMA_MAKE_COLOR_SYSTEM_PROMPT = `Design a cohesive, production-ready color system for Unigentamos, an authenticated personal and company operations application.

Create one Figma page named “Unigentamos Color System” with a variables collection, token tables, accessible component specimens, and a compact implementation handoff. The system must cover nine modules: Projects, Notes, People, Media, Personal, Reviews, Resources, Finance, and Vault.

Keep these system-wide foundations shared across every module:
- Ink #102026 for primary text and high-emphasis controls
- Text #23383F
- Muted #60747C
- Faint #7C8E95
- Canvas #F4F7F5
- Canvas alternate #F6F8F7
- Panel #FFFFFF
- Paper #FBFCFB
- Border #D5E2E7
- Border strong #BFD2DB
- Selected #F7FBFF
- Current Navy reference #0D252D for primary actions and high-emphasis interface text. This hex value is a starting point, not a locked foundation.

You are explicitly authorized to refine the shared Navy. Keep it recognizably navy, but select the particular hue, saturation, and brightness that works best as the system-wide primary color alongside Ink, black, the shared neutrals, and all nine module primary/secondary combinations. Compare multiple navy candidates before choosing one. The chosen Navy should feel strong and distinctive without becoming harsh, overly blue, nearly black, or visually competitive with module colors. Create a coordinated Navy scale and specify exact tokens for high-emphasis text, primary action, hover, pressed, selected, link, icon, and focus states. Document the chosen hex values, contrast ratios, and rationale, including why the final Navy is more cohesive than the current #0D252D reference.

For each module, design:
1. One clearly distinguishable primary hue with a coordinated 50, 100, 200, 300, 400, 500, 600, 700, 800, and 900 scale.
2. One secondary accent hue that complements the primary and remains distinguishable from every other module’s primary/secondary pairing.
3. Explicit tokens for primary action, selected surface, quiet surface, border, icon, text-on-primary, focus ring, and secondary accent.
4. Light-theme interaction states for default, hover, pressed, selected, focus, disabled, informational, warning, destructive, and success contexts.

The nine palettes should feel like one family: align their perceived brightness, saturation, contrast progression, and neutral mixing. Avoid a generic rainbow, neon colors, muddy dark tones, decorative gradients, or near-duplicate module hues. Preserve a calm, precise, editorial operations-tool character. Module color should aid orientation without overpowering content.

Meet WCAG 2.2 AA contrast for body text, controls, focus indicators, and icon/action states. Show contrast ratios for the primary 500/600 action combinations and all text-on-color pairs. Include a color-blindness comparison sheet and adjust ambiguous pairings.

Use Tabler Line icons only, on a 24 × 24 grid with a 2 px stroke, round caps/joins, and currentColor inheritance. Include neutral and module-primary icon specimens for each palette; do not redesign the icons.

Name variables using this structure:
- color/system/{token}
- color/module/{module}/primary/{50-900}
- color/module/{module}/secondary/{100,500,700}
- color/module/{module}/{surface,border,icon,focus,text-on-primary}

Finish with:
- A side-by-side overview of all nine module palettes.
- One sample admin workspace per module using the same layout and component anatomy.
- A machine-readable token table with exact hex values and variable names.
- A short rationale for each primary/secondary pairing.
- A “Ready for implementation” section that calls out any unresolved accessibility or cohesion decisions.

Do not change typography, spacing, component structure, content, or the shared neutral foundations. Navy is explicitly open to refinement under the criteria above. The deliverable is the color system and its application guidance only.`;
