"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { updateWritingPreferences, useWritingPreferences, type WritingPreferences, type WritingSkill } from "../../lib/writing/preferences";
import { WorkspaceButton, WorkspaceSheet } from "../admin-shell/WorkspaceKit";
import SettingsSwitch from "./SettingsSwitch";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import WritingSkillUsage from "./WritingSkillUsage";
import styles from "./WritingSettings.module.css";

const settingsPath = "/admin/personal/settings";
const skillPath = (id: string) => settingsPath + "?skill=" + encodeURIComponent(id);
const actions: Record<WritingSkill["behavior"], string> = {
  collection: "Collect passages",
  copy: "Copy a passage",
  snippet: "Insert reusable text"
};

type Toggle = "objectSuggestions" | "skillSuggestions" | "mediaEmbeds";
type Shortcut = "objectTrigger" | "skillTrigger";
type SkillDraft = { original?: WritingSkill; value: WritingSkill; keepAction: boolean };

function suggestedAction(description: string): WritingSkill["behavior"] {
  if (/\b(snippet|template|insert|expand|reusable text|boilerplate)\b/i.test(description)) return "snippet";
  if (/\b(copy|clipboard|copyable)\b/i.test(description)) return "copy";
  return "collection";
}

export default function WritingSettings() {
  const preferences = useWritingPreferences();
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get("skill");
  const selected = preferences.skills.find(skill => skill.id === selectedId);
  const linkedBehavior = params.get("behavior");
  const linkedSkill: WritingSkill | undefined = selectedId && /^[\w-]{1,128}$/.test(selectedId) ? {
    id: selectedId, name: params.get("name")?.trim().slice(0, 80) || "Linked skill", description: "", snippet: "",
    behavior: linkedBehavior === "copy" || linkedBehavior === "snippet" ? linkedBehavior : "collection"
  } : undefined;
  const viewedSkill = selected ?? linkedSkill;
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [remove, setRemove] = useState<WritingSkill | null>(null);
  const [shortcuts, setShortcuts] = useState<Partial<Record<Shortcut, { original: string; value: string }>>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const libraryHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!selectedId || !libraryHeading.current) return;
    libraryHeading.current.focus({ preventScroll: true });
    libraryHeading.current.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  async function save(update: (current: WritingPreferences) => WritingPreferences, message: string) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await updateWritingPreferences(update);
      setNotice(message);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save writing preferences.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: Toggle, value: boolean) {
    void save(current => ({ ...current, [key]: value }), "Preference saved.");
  }

  function editShortcut(key: Shortcut, value: string) {
    setShortcuts(current => ({ ...current, [key]: { original: current[key]?.original ?? preferences[key], value } }));
  }

  async function saveShortcuts(event: FormEvent) {
    event.preventDefault();
    const saved = await save(current => {
      const next = { ...current };
      for (const key of ["objectTrigger", "skillTrigger"] as const) {
        const edit = shortcuts[key];
        if (!edit || edit.value === edit.original) continue;
        if (current[key] !== edit.original && current[key] !== edit.value) throw new Error("A shortcut changed in another tab. Cancel these edits to load it.");
        next[key] = edit.value;
      }
      return next;
    }, "Shortcuts saved.");
    if (saved) setShortcuts({});
  }

  function openSkill(skill?: WritingSkill) {
    setError("");
    setNotice("");
    setDraft({
      original: skill,
      keepAction: Boolean(skill),
      value: skill ?? { id: crypto.randomUUID(), name: "", behavior: "collection", description: "", snippet: "" }
    });
  }

  async function saveSkill(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const skill = { ...draft.value, name: draft.value.name.trim(), description: draft.value.description.trim() };
    const saved = await save(current => {
      const existing = current.skills.find(item => item.id === skill.id);
      if (JSON.stringify(existing) !== JSON.stringify(draft.original)) throw new Error("This skill changed in another tab. Close this editor and reopen the skill to load its latest settings.");
      return { ...current, skills: existing ? current.skills.map(item => item.id === skill.id ? skill : item) : [...current.skills, skill] };
    }, "Skill saved.");
    if (saved) {
      setDraft(null);
      router.replace(skillPath(skill.id), { scroll: false });
    }
  }

  async function removeSkill() {
    if (!remove) return;
    const saved = await save(current => {
      const existing = current.skills.find(item => item.id === remove.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(remove)) throw new Error("This skill changed in another tab. Close this dialog and review it before removing it.");
      return { ...current, skills: current.skills.filter(item => item.id !== remove.id) };
    }, "Skill removed from this browser.");
    if (saved) {
      setRemove(null);
      if (selectedId === remove.id) router.replace(settingsPath + "/writing", { scroll: false });
    }
  }

  function closeDialog() {
    if (busy) return;
    setDraft(null);
    setRemove(null);
    setError("");
  }

  const feedback = error ? <p className={styles.error} role="alert">{error}</p> : notice ? <p className={styles.notice} role="status">{notice}</p> : null;
  return (
    <>
      <form className={styles.shortcutPanels} onSubmit={saveShortcuts}>
        <section className={styles.panel} aria-labelledby="object-links">
          <header className={styles.shortcutHeading}><kbd>{preferences.objectTrigger}</kbd><h2 id="object-links">Object links</h2></header>
          <p>Mention a person, project, place, or other saved item. Select a match to insert a link you can follow back to that item.</p>
          <p className={styles.example}>In a meeting note, type <code>{preferences.objectTrigger}Alex</code> and choose Alex’s profile. The note will appear under <strong>Mentioned in</strong> on that profile.</p>
          <SettingsSwitch label="Object suggestions" detail="Show matching workspace items as you type." checked={preferences.objectSuggestions} onChange={value => toggle("objectSuggestions", value)}/>
          <SettingsSwitch label="Media previews" detail="Show previews for linked media in your writing." checked={preferences.mediaEmbeds} onChange={value => toggle("mediaEmbeds", value)}/>
          <label className={styles.triggerField}>Object shortcut<input value={shortcuts.objectTrigger?.value ?? preferences.objectTrigger} maxLength={4} required spellCheck={false} onChange={event => editShortcut("objectTrigger", event.target.value)}/></label>
        </section>
        <section className={styles.panel} aria-labelledby="skill-actions">
          <header className={styles.shortcutHeading}><kbd>{preferences.skillTrigger}</kbd><h2 id="skill-actions">Skill shortcuts</h2></header>
          <p>Use a writing action where your cursor is. A skill can collect a passage in a library, add a copy button, or insert text you reuse.</p>
          <p className={styles.example}>{preferences.skills.length ? <>Type <code>{preferences.skillTrigger}{preferences.skills[0].name}</code> and choose <strong>{preferences.skills[0].name}</strong> to {preferences.skills[0].behavior === "collection" ? "collect the passage in its library" : preferences.skills[0].behavior === "copy" ? "add a button that copies the passage" : "insert its saved text"}.</> : <>Add your first skill below, then type <code>{preferences.skillTrigger}</code> to find it while writing.</>}</p>
          <SettingsSwitch label="Skill suggestions" detail="Show matching writing actions as you type." checked={preferences.skillSuggestions} onChange={value => toggle("skillSuggestions", value)}/>
          <label className={styles.triggerField}>Skill shortcut<input value={shortcuts.skillTrigger?.value ?? preferences.skillTrigger} maxLength={4} required spellCheck={false} onChange={event => editShortcut("skillTrigger", event.target.value)}/></label>
        </section>
        <div className={styles.shortcutFooter}><small>Tap a suggestion or press Tab to insert it. Each shortcut can use one to four punctuation marks.</small>
          {Object.keys(shortcuts).length > 0 && <div className={styles.buttons}><WorkspaceButton disabled={busy} onClick={() => { setShortcuts({}); setError(""); }}>Cancel</WorkspaceButton><WorkspaceButton intent="primary" type="submit" busy={busy}>Save shortcuts</WorkspaceButton></div>}
        </div>
      </form>
      {!draft && !remove && feedback}
          <section className={styles.panel} aria-labelledby="writing-skills">
            <header className={styles.panelHeader}><h2 id="writing-skills">Writing skills</h2><WorkspaceButton icon="plus" onClick={() => openSkill()}>Add skill</WorkspaceButton></header>
            {!preferences.skills.length && <p>Add a skill to collect a passage, copy text, or insert a snippet.</p>}
            <ul className={styles.skills}>
              {preferences.skills.map(skill => (
                <li key={skill.id}>
                  <Link href={skillPath(skill.id)} prefetch={false} scroll={false} aria-current={selectedId === skill.id ? "page" : undefined}>
                    <span className={styles.skillIcon}><UnigentamosIcon role={skill.behavior === "copy" ? "copy" : skill.behavior === "snippet" ? "edit" : "list"} size={18} /></span>
                    <span><strong>{skill.name}</strong><small>{skill.description}</small></span>
                    <UnigentamosIcon role="chevron-right" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          {viewedSkill && <section className={styles.panel} aria-label={viewedSkill.name + " skill"}>
            <header className={styles.panelHeader}><div><h2 ref={libraryHeading} tabIndex={-1}>{viewedSkill.name}</h2><small>{actions[viewedSkill.behavior]}</small></div>{selected && <div className={styles.buttons}>
              <WorkspaceButton icon="edit" onClick={() => openSkill(selected)}>Edit skill</WorkspaceButton>
              <WorkspaceButton icon="delete" aria-label={"Remove " + selected.name} onClick={() => { setRemove(selected); setError(""); setNotice(""); }} />
            </div>}</header>
            {!selected && <p>Only saved uses are available for this skill in this browser profile.</p>}
            {selected?.behavior === "snippet" && <pre className={styles.snippet}>{selected.snippet}</pre>}
            <WritingSkillUsage key={viewedSkill.id} skill={viewedSkill} />
          </section>}
          {selectedId && !viewedSkill && <p role="status">This skill link is invalid.</p>}

      <WorkspaceSheet open={Boolean(draft)} onClose={closeDialog} title={draft?.original ? "Edit writing skill" : "New writing skill"} titleIcon="edit">
        {draft && <form data-writing-settings className={styles.editForm} onSubmit={saveSkill}>
          <label>Name<input required maxLength={80} value={draft.value.name} onChange={event => setDraft({ ...draft, value: { ...draft.value, name: event.target.value } })}/></label>
          <label>Description<textarea required rows={3} maxLength={1000} placeholder="What do you want this skill to help you do?" value={draft.value.description} onChange={event => {
            const description = event.target.value;
            setDraft({ ...draft, value: { ...draft.value, description, behavior: draft.keepAction ? draft.value.behavior : suggestedAction(description) } });
          }}/></label>
          <label>Action<select value={draft.value.behavior} onChange={event => setDraft({ ...draft, keepAction: true, value: { ...draft.value, behavior: event.target.value as WritingSkill["behavior"] } })}>{Object.entries(actions).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          {draft.value.behavior === "snippet" && <label>Reusable text<textarea rows={5} required maxLength={4000} value={draft.value.snippet} onChange={event => setDraft({ ...draft, value: { ...draft.value, snippet: event.target.value } })}/></label>}
          {error && feedback}
          <div className={styles.buttons}><WorkspaceButton onClick={closeDialog} disabled={busy}>Cancel</WorkspaceButton><WorkspaceButton type="submit" intent="primary" busy={busy}>Save skill</WorkspaceButton></div>
        </form>}
      </WorkspaceSheet>
      <WorkspaceSheet open={Boolean(remove)} onClose={closeDialog} title="Remove writing skill" titleIcon="delete">
        {remove && <div className={styles.editForm} data-writing-settings><p>Remove <strong>{remove.name}</strong> from this browser’s skill menu? Passages already saved in your writing will remain in their sources.</p>
          {error && feedback}
          <div className={styles.buttons}><WorkspaceButton disabled={busy} onClick={closeDialog}>Cancel</WorkspaceButton><WorkspaceButton intent="danger" busy={busy} onClick={() => void removeSkill()}>Remove skill</WorkspaceButton></div>
        </div>}
      </WorkspaceSheet>
    </>
  );
}
