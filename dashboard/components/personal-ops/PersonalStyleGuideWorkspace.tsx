"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { buildJsonHeadersWithCsrf } from "../../lib/client-csrf";
import { ICON_REGISTRY } from "../../lib/icons/icon-registry";
import { createResourcesRepository } from "../../lib/modules/resources/repository";
import type { ResourceRecord } from "../../lib/modules/resources/types";
import { decodeStyleGuideComponent, encodeStyleGuideComponent, isStyleGuideComponent, STYLE_GUIDE_AREA } from "../../lib/modules/style-guide/component-resource";
import { FIGMA_MAKE_COLOR_SYSTEM_PROMPT } from "../../lib/modules/style-guide/figma-prompt";
import type { StyleGuideColorToken, StyleGuideInput, StyleGuideModulePalette, StyleGuideState, StyleGuideTypographyRole } from "../../lib/modules/style-guide/types";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import PersonalOpsSidebar, { type PersonalOpsSidebarCounts } from "./PersonalOpsSidebar";
import PersonalOpsIcon, { PERSONAL_OPS_ICON_LIBRARY, type PersonalOpsIconName } from "./PersonalOpsIcon";
import StyleGuideIconRegistry from "./StyleGuideIconRegistry";
import baseStyles from "./PersonalOpsWorkspace.module.css";
import styles from "./PersonalUtilityWorkspace.module.css";

type ComponentDraft = { id?: string; title: string; url: string; tags: string; icon: PersonalOpsIconName | ""; visual: string; code: string; animation: string };

const COMPONENT_ICON_PREFIX = "Icon:";
const FONT_PREVIEW_STACKS: Readonly<Record<string, string>> = {
  "Plus Jakarta Sans": '"Plus Jakarta Sans Variable", "Avenir Next", "Segoe UI", sans-serif',
  "Plus Jakarta Sans Variable": '"Plus Jakarta Sans Variable", "Avenir Next", "Segoe UI", sans-serif',
  Inter: '"Inter Variable", "Segoe UI", sans-serif',
  "Inter Variable": '"Inter Variable", "Segoe UI", sans-serif',
  Inconsolata: '"Inconsolata Variable", "SFMono-Regular", Consolas, monospace',
  "Inconsolata Variable": '"Inconsolata Variable", "SFMono-Regular", Consolas, monospace'
};
const SCALE_STEPS = [50, 100, 300, 500, 700, 900] as const;

function makeId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function unique(values: string[]) { return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))); }
function previewFontFamily(family: string) { return FONT_PREVIEW_STACKS[family.trim()] || family; }
function isPersonalOpsIconName(value: string): value is PersonalOpsIconName { return PERSONAL_OPS_ICON_LIBRARY.some((item) => item.name === value); }
function fieldLabel(label: string, control: ReactNode, className = "") { return <label className={[styles.field, className].filter(Boolean).join(" ")}><span>{label}</span>{control}</label>; }
function componentIcon(resource: ResourceRecord): PersonalOpsIconName | "" {
  const marker = resource.provenance.subjects.find((subject) => subject.toLowerCase().startsWith(COMPONENT_ICON_PREFIX.toLowerCase()));
  const icon = marker?.slice(COMPONENT_ICON_PREFIX.length).trim() || "";
  return isPersonalOpsIconName(icon) ? icon : "";
}
function componentTags(resource: ResourceRecord) { return resource.provenance.subjects.filter((subject) => !subject.toLowerCase().startsWith(COMPONENT_ICON_PREFIX.toLowerCase())); }
function componentDraft(resource?: ResourceRecord): ComponentDraft {
  const content = resource ? decodeStyleGuideComponent(resource.body) : { visual: "", code: "", animation: "" };
  return { id: resource?.id, title: resource?.title || "", url: resource?.source.canonicalUrl || "", tags: resource ? componentTags(resource).join(", ") : "", icon: resource ? componentIcon(resource) : "", ...content };
}
function guideInput(value: StyleGuideState): StyleGuideInput { return { title: value.title, description: value.description, typography: value.typography, colors: value.colors, modules: value.modules, icons: value.icons }; }
function scaleColor(accent: string, step: typeof SCALE_STEPS[number]) {
  if (step === 500) return accent;
  if (step < 500) return `color-mix(in srgb, ${accent} ${step === 50 ? 8 : step === 100 ? 16 : 54}%, white)`;
  return `color-mix(in srgb, ${accent} ${step === 700 ? 76 : 52}%, #102026)`;
}

export default function PersonalStyleGuideWorkspace({ initialState, initialResources, sidebarCounts, initialLoadError }: { initialState: StyleGuideState; initialResources: ResourceRecord[]; sidebarCounts: PersonalOpsSidebarCounts; initialLoadError?: string }) {
  const router = useRouter();
  const repository = useMemo(() => createResourcesRepository(), []);
  const [state, setState] = useState(initialState);
  const [draft, setDraft] = useState(initialState);
  const [resources, setResources] = useState(initialResources);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editor, setEditor] = useState<ComponentDraft | null>(null);
  const [existingResourceId, setExistingResourceId] = useState("");
  const [existingResourceIcon, setExistingResourceIcon] = useState<PersonalOpsIconName | "">("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(initialLoadError || "");
  const components = resources.filter(isStyleGuideComponent);
  const availableResources = resources.filter((resource) => !isStyleGuideComponent(resource));
  const selectedCount = draft.icons.filter((item) => item.selection).length;

  function updateTypography(itemId: string, change: Partial<StyleGuideTypographyRole>) { setDraft((current) => ({ ...current, typography: current.typography.map((item) => item.id === itemId ? { ...item, ...change } : item) })); }
  function updateColor(itemId: string, change: Partial<StyleGuideColorToken>) { setDraft((current) => ({ ...current, colors: current.colors.map((item) => item.id === itemId ? { ...item, ...change } : item) })); }
  function updateModule(itemId: string, change: Partial<StyleGuideModulePalette>) { setDraft((current) => ({ ...current, modules: current.modules.map((item) => item.id === itemId ? { ...item, ...change } : item) })); }

  async function persistGuide(showNotice = true): Promise<StyleGuideState> {
    const input = guideInput(draft);
    if (JSON.stringify(input) === JSON.stringify(guideInput(state))) return state;
    const response = await fetch("/api/personal/style-guide", { method: "PUT", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ input, expectedUpdatedAt: state.updatedAt }) });
    const payload = await response.json() as { ok?: boolean; state?: StyleGuideState; error?: string };
    if (!response.ok || !payload.ok || !payload.state) throw new Error(payload.error || "The style guide could not be saved.");
    setState(payload.state); setDraft(payload.state); if (showNotice) setNotice("Style guide saved.");
    return payload.state;
  }

  async function saveGuide() {
    setBusy(true); setError(""); setNotice("");
    try { await persistGuide(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The style guide could not be saved."); } finally { setBusy(false); }
  }

  async function selectIcon(role: string, candidate: string): Promise<boolean> {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await persistGuide(false);
      const response = await fetch("/api/personal/style-guide", { method: "POST", headers: buildJsonHeadersWithCsrf(), body: JSON.stringify({ role, candidate, expectedUpdatedAt: saved.updatedAt }) });
      const payload = await response.json() as { ok?: boolean; state?: StyleGuideState; resource?: ResourceRecord; error?: string };
      if (!response.ok || !payload.ok || !payload.state) throw new Error(payload.error || "The icon could not be selected.");
      setState(payload.state); setDraft(payload.state);
      if (payload.resource) setResources((items) => items.some((item) => item.id === payload.resource?.id) ? items.map((item) => item.id === payload.resource?.id ? payload.resource! : item) : [payload.resource!, ...items]);
      setNotice("Icon selected, applied sitewide, and saved as a Resource."); router.refresh(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The icon could not be selected."); return false; } finally { setBusy(false); }
  }

  async function copyFigmaPrompt() {
    try { await navigator.clipboard.writeText(FIGMA_MAKE_COLOR_SYSTEM_PROMPT); setNotice("Figma Make prompt copied."); } catch { setError("The prompt could not be copied. Select it below and copy it manually."); }
  }

  async function saveComponent(event: FormEvent) {
    event.preventDefault(); if (!editor) return; setBusy(true); setError("");
    const current = editor.id ? resources.find((item) => item.id === editor.id) : undefined;
    const values = { title: editor.title, url: editor.url, body: encodeStyleGuideComponent(editor), areas: unique([...(current?.provenance.areas || []), STYLE_GUIDE_AREA]), subjects: unique([...editor.tags.split(","), ...(editor.icon ? [`${COMPONENT_ICON_PREFIX}${editor.icon}`] : [])]) };
    const result = current ? await repository.update(current.id, values) : await repository.create(values);
    setBusy(false); if (!result.ok) return setError(result.error.message);
    setResources((items) => items.some((item) => item.id === result.data.id) ? items.map((item) => item.id === result.data.id ? result.data : item) : [result.data, ...items]);
    setEditor(null); setNotice(current ? "Component resource updated." : "Component saved to Resources and added to the Style Guide.");
  }

  async function addExistingResource() {
    const current = resources.find((item) => item.id === existingResourceId); if (!current) return; setBusy(true); setError("");
    const subjects = unique([...componentTags(current), ...(existingResourceIcon ? [`${COMPONENT_ICON_PREFIX}${existingResourceIcon}`] : [])]);
    const result = await repository.update(current.id, { areas: unique([...current.provenance.areas, STYLE_GUIDE_AREA]), subjects });
    setBusy(false); if (!result.ok) return setError(result.error.message);
    setResources((items) => items.map((item) => item.id === result.data.id ? result.data : item)); setExistingResourceId(""); setExistingResourceIcon(""); setNotice("Resource added to the Style Guide.");
  }

  async function removeComponent(resource: ResourceRecord) {
    if (!window.confirm(`Remove “${resource.title}” from the Style Guide? The Resource itself will be preserved.`)) return; setBusy(true); setError("");
    const result = await repository.update(resource.id, { areas: resource.provenance.areas.filter((area) => area.toLowerCase() !== STYLE_GUIDE_AREA.toLowerCase()), subjects: componentTags(resource) });
    setBusy(false); if (!result.ok) return setError(result.error.message);
    setResources((items) => items.map((item) => item.id === result.data.id ? result.data : item)); setNotice("Removed from the Style Guide. The Resource was preserved.");
  }

  return (
    <div className={baseStyles.shell}>
      <PersonalOpsSidebar activeView="style-guide" filter="" pathname="/admin/personal/style-guide" counts={sidebarCounts} mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <main className={baseStyles.directory} aria-label="Style Guide">
        <div className={baseStyles.mobileToolbar}><button type="button" onClick={() => setMobileSidebarOpen(true)}><PersonalOpsIcon name="menu" /> Personal Ops</button><button type="button" onClick={saveGuide} disabled={busy}><PersonalOpsIcon name="check" /> Save</button></div>
        <div className={[baseStyles.mainScroll, styles.utilityScroll].join(" ")}>
          <header className={styles.utilityHeader}><div><span className={styles.kicker}>Design system</span><h1>Style Guide</h1><p>One editable language for type, color, components, motion, and icons.</p></div><button type="button" className={styles.primaryButton} onClick={saveGuide} disabled={busy}><PersonalOpsIcon name="check" /> Save guide</button></header>
          <nav className={styles.sectionNav} aria-label="Style Guide sections"><a href="#typography"><PersonalOpsIcon name="font" /> Type</a><a href="#colors"><PersonalOpsIcon name="palette" /> System colors</a><a href="#modules"><PersonalOpsIcon name="style-guide" /> Modules</a><a href="#components"><PersonalOpsIcon name="component" /> Components</a><a href="#icons"><PersonalOpsIcon name="object" /> Icons</a></nav>
          {error && <div className={styles.error} role="alert">{error}</div>}
          {notice && <div className={styles.notice} role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss"><PersonalOpsIcon name="close" /></button></div>}
          <section className={styles.identityBand} aria-label="Guide identity">{fieldLabel("Name", <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />)}{fieldLabel("Design language", <input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />)}</section>

          <section id="typography" className={styles.guideSection}>
            <header><div className={styles.sectionIcon}><PersonalOpsIcon name="font" /></div><div><h2>Typography</h2><p>Hierarchy rendered with its own settings.</p></div><button type="button" className={styles.addButton} onClick={() => setDraft((current) => ({ ...current, typography: [...current.typography, { id: makeId("type"), label: "New role", family: "Inter", size: 14, weight: 500, lineHeight: 1.5, letterSpacing: 0 }] }))}><PersonalOpsIcon name="plus" /> Type role</button></header>
            <div className={styles.specimenRail}>{draft.typography.map((item) => <article className={styles.typeSpecimen} key={item.id}><div className={styles.specimenPreview} style={{ fontFamily: previewFontFamily(item.family), fontSize: `${item.size}px`, fontWeight: item.weight, lineHeight: item.lineHeight, letterSpacing: `${item.letterSpacing}em` }}>Aa <span>{item.label}</span></div><div className={styles.typeControls}>{fieldLabel("Role", <input value={item.label} onChange={(event) => updateTypography(item.id, { label: event.target.value })} />)}{fieldLabel("Font", <input list="style-fonts" value={item.family} onChange={(event) => updateTypography(item.id, { family: event.target.value })} />)}{fieldLabel("Size", <input type="number" min="8" max="96" value={item.size} onChange={(event) => updateTypography(item.id, { size: Number(event.target.value) })} />)}{fieldLabel("Weight", <input type="number" min="100" max="900" step="50" value={item.weight} onChange={(event) => updateTypography(item.id, { weight: Number(event.target.value) })} />)}{fieldLabel("Line", <input type="number" min="0.8" max="2.4" step="0.05" value={item.lineHeight} onChange={(event) => updateTypography(item.id, { lineHeight: Number(event.target.value) })} />)}{fieldLabel("Track", <input type="number" min="-0.1" max="0.2" step="0.01" value={item.letterSpacing} onChange={(event) => updateTypography(item.id, { letterSpacing: Number(event.target.value) })} />)}<button type="button" className={styles.deleteIcon} onClick={() => setDraft((current) => ({ ...current, typography: current.typography.filter((candidate) => candidate.id !== item.id) }))} aria-label={`Delete ${item.label}`}><PersonalOpsIcon name="delete" /></button></div></article>)}</div>
            <datalist id="style-fonts"><option value="Plus Jakarta Sans" /><option value="Inter" /><option value="Inconsolata" /></datalist>
          </section>

          <section id="colors" className={styles.guideSection}>
            <header><div className={styles.sectionIcon}><PersonalOpsIcon name="palette" /></div><div><h2>System-wide color</h2><p>Shared neutrals, navy, states, and foundations used by every module.</p></div><button type="button" className={styles.addButton} onClick={() => setDraft((current) => ({ ...current, colors: [...current.colors, { id: makeId("color"), label: "New color", value: "#64777E", usage: "" }] }))}><PersonalOpsIcon name="plus" /> Color</button></header>
            <div className={styles.swatchGrid}>{draft.colors.map((item) => <article className={styles.swatchCard} key={item.id}><div className={styles.swatch} style={{ background: item.value }} /><div>{fieldLabel("Name", <input value={item.label} onChange={(event) => updateColor(item.id, { label: event.target.value })} />)}<div className={styles.colorPair}><input aria-label={`${item.label} picker`} type="color" value={item.value} onChange={(event) => updateColor(item.id, { value: event.target.value.toUpperCase() })} /><input aria-label={`${item.label} hex`} className={styles.monoInput} value={item.value} onChange={(event) => updateColor(item.id, { value: event.target.value })} /></div>{fieldLabel("Use", <input value={item.usage} onChange={(event) => updateColor(item.id, { usage: event.target.value })} />)}</div><button type="button" className={styles.deleteIcon} onClick={() => setDraft((current) => ({ ...current, colors: current.colors.filter((candidate) => candidate.id !== item.id) }))} aria-label={`Delete ${item.label}`}><PersonalOpsIcon name="delete" /></button></article>)}</div>
          </section>

          <section id="modules" className={styles.guideSection}>
            <header><div className={styles.sectionIcon}><PersonalOpsIcon name="style-guide" /></div><div><h2>Module color system</h2><p>Nine working palettes. Final scales remain explicitly Figma-pending.</p></div><span className={styles.figmaPending}>Working · Figma pending</span></header>
            <div className={styles.moduleSystemGrid}>{draft.modules.map((item) => {
              const moduleIcons = ICON_REGISTRY.filter((entry) => entry.usages.some((usage) => usage.module === item.module));
              return <details className={styles.moduleSystemCard} style={{ "--module-accent": item.accent, "--module-secondary": item.secondary, "--module-surface": item.surface } as CSSProperties} key={item.id} open={item.id === "projects"}>
                <summary><span className={styles.moduleMark}><UnigentamosIcon role={moduleIcons[0]?.id || "object"} /></span><span><strong>{item.module}</strong><small>{moduleIcons.length} live icon role{moduleIcons.length === 1 ? "" : "s"}</small></span><span className={styles.moduleDots}><i /><i /><i /></span><PersonalOpsIcon name="chevron-down" /></summary>
                <div className={styles.moduleSystemBody}><div className={styles.moduleScale} aria-label={`${item.module} working primary scale`}>{SCALE_STEPS.map((step) => <span key={step} style={{ background: scaleColor(item.accent, step) }}><b>{step}</b></span>)}</div><div className={styles.moduleFields}>{fieldLabel("Primary", <span className={styles.colorControl}><input type="color" value={item.accent} onChange={(event) => updateModule(item.id, { accent: event.target.value.toUpperCase() })} /><code>{item.accent}</code></span>)}{fieldLabel("Secondary", <span className={styles.colorControl}><input type="color" value={item.secondary} onChange={(event) => updateModule(item.id, { secondary: event.target.value.toUpperCase() })} /><code>{item.secondary}</code></span>)}{fieldLabel("Quiet surface", <span className={styles.colorControl}><input type="color" value={item.surface} onChange={(event) => updateModule(item.id, { surface: event.target.value.toUpperCase() })} /><code>{item.surface}</code></span>)}</div><div className={styles.moduleIconStrip}>{moduleIcons.map((entry) => <span key={entry.id} title={`${entry.label} · ${entry.usages.filter((usage) => usage.module === item.module).map((usage) => usage.breadcrumb).join(" · ")}`}><UnigentamosIcon role={entry.id} /><UnigentamosIcon role={entry.id} style={{ color: item.accent }} /><small>{entry.label}</small></span>)}</div></div>
              </details>;
            })}</div>
            <div className={styles.figmaPrompt}><div><span className={styles.kicker}>Figma Make handoff</span><h3>Generate the final cohesive palettes</h3><p>The prompt fixes the shared foundations and asks Figma to resolve the nine accessible module systems. No final palette is claimed until you approve that output.</p></div><button type="button" className={styles.secondaryButton} onClick={() => void copyFigmaPrompt()}><PersonalOpsIcon name="copy" /> Copy prompt</button><textarea aria-label="Figma Make color system prompt" readOnly value={FIGMA_MAKE_COLOR_SYSTEM_PROMPT} /></div>
          </section>

          <section id="components" className={styles.guideSection}>
            <header><div className={styles.sectionIcon}><PersonalOpsIcon name="component" /></div><div><h2>Components</h2><p>{components.length} tagged Resource{components.length === 1 ? "" : "s"}. Resources remain authoritative.</p></div><button type="button" className={styles.addButton} onClick={() => setEditor(componentDraft())}><PersonalOpsIcon name="plus" /> Component</button></header>
            <div className={styles.resourcePicker}><select aria-label="Existing Resource" value={existingResourceId} onChange={(event) => setExistingResourceId(event.target.value)}><option value="">Add an existing Resource…</option>{availableResources.map((resource) => <option value={resource.id} key={resource.id}>{resource.title}</option>)}</select><select aria-label="Component icon" value={existingResourceIcon} onChange={(event) => setExistingResourceIcon(event.target.value as PersonalOpsIconName | "")}><option value="">No icon</option>{PERSONAL_OPS_ICON_LIBRARY.map((item) => <option value={item.name} key={item.name}>{item.label}</option>)}</select><button type="button" className={styles.secondaryButton} disabled={!existingResourceId || busy} onClick={() => void addExistingResource()}><PersonalOpsIcon name="plus" /> Add</button></div>
            {components.length ? <div className={styles.componentGrid}>{components.map((resource) => { const content = decodeStyleGuideComponent(resource.body); const assignedIcon = componentIcon(resource); const tags = componentTags(resource); return <article className={styles.componentCard} key={resource.id}><div className={styles.componentVisual}>{assignedIcon ? <><PersonalOpsIcon name={assignedIcon} /><strong>{PERSONAL_OPS_ICON_LIBRARY.find((item) => item.name === assignedIcon)?.label}</strong></> : <span>{content.visual || "Visual notes not added"}</span>}</div><div className={styles.componentCopy}><span className={styles.resourceMarker}>Resource</span><h3>{resource.title}</h3><div className={styles.tagRow}>{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{content.animation && <p><PersonalOpsIcon name="motion" /> {content.animation}</p>}</div><div className={styles.cardActions}><button type="button" onClick={() => setEditor(componentDraft(resource))} aria-label={`Edit ${resource.title}`}><PersonalOpsIcon name="edit" /></button><Link href={`/admin/resources/${resource.id}`} aria-label={`Open ${resource.title}`}><PersonalOpsIcon name="open" /></Link><button type="button" className={styles.deleteIcon} onClick={() => void removeComponent(resource)} aria-label={`Remove ${resource.title} from Style Guide`}><PersonalOpsIcon name="close" /></button></div></article>; })}</div> : <div className={styles.emptyState}><PersonalOpsIcon name="component" /><strong>No components yet</strong><span>Tag an existing Resource or save the first specimen.</span></div>}
          </section>

          <section id="icons" className={styles.guideSection}>
            <header><div className={styles.sectionIcon}><PersonalOpsIcon name="object" /></div><div><h2>Icon language</h2><p>{ICON_REGISTRY.length} comprehensive roles · five curated Tabler Line recommendations each · {selectedCount} selected.</p></div><a className={styles.streamlineLink} href="https://www.streamlinehq.com/icons/tabler-line" target="_blank" rel="noreferrer"><PersonalOpsIcon name="open" /> Streamline set</a></header>
            <StyleGuideIconRegistry assignments={draft.icons} modules={draft.modules} busy={busy} onSelect={selectIcon} />
          </section>
        </div>
      </main>

      {editor && <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}><form className={styles.editorDialog} onSubmit={saveComponent}><header><div><span className={styles.kicker}>Resource component</span><h2>{editor.id ? "Edit component" : "New component"}</h2></div><button type="button" className={styles.iconButton} onClick={() => setEditor(null)} aria-label="Close"><PersonalOpsIcon name="close" /></button></header><div className={styles.editorFields}>{fieldLabel("Name", <input required value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} />)}{fieldLabel("Reference URL", <input type="url" value={editor.url} onChange={(event) => setEditor({ ...editor, url: event.target.value })} placeholder="Optional" />)}{fieldLabel("Icon", <select aria-label="Icon" data-component-icon-select value={editor.icon} onChange={(event) => setEditor({ ...editor, icon: event.target.value as PersonalOpsIconName | "" })}><option value="">No icon</option>{PERSONAL_OPS_ICON_LIBRARY.map((item) => <option value={item.name} key={item.name}>{item.label}</option>)}</select>)}{fieldLabel("Tags", <input value={editor.tags} onChange={(event) => setEditor({ ...editor, tags: event.target.value })} placeholder="button, action, navigation" />)}{fieldLabel("Visual", <textarea value={editor.visual} onChange={(event) => setEditor({ ...editor, visual: event.target.value })} placeholder="Describe the specimen and its states." />, styles.fullField)}{fieldLabel("Code", <textarea className={styles.codeField} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })} placeholder="Paste the implementation or usage snippet." />, styles.fullField)}{fieldLabel("Animation", <textarea value={editor.animation} onChange={(event) => setEditor({ ...editor, animation: event.target.value })} placeholder="Duration, easing, trigger, and reduced-motion behavior." />, styles.fullField)}</div><footer><button type="button" className={styles.secondaryButton} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy}>Save component</button></footer></form></div>}
    </div>
  );
}
