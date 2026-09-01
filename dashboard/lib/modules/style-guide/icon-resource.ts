import { createHash } from "node:crypto";
import { ICON_REGISTRY_BY_ID, candidateLabel, iconModules, streamlineIconUrl } from "../../icons/icon-registry";
import { createPersonalRecord, readPersonalRecords, updatePersonalRecord, type PersonalRecord } from "../../personal-records-store";
import { resourceCreateInputToLegacy, resourceUpdateInputToLegacy } from "../resources/legacy-adapter";
import { encodeStyleGuideComponent, STYLE_GUIDE_AREA } from "./component-resource";

const ROLE_PREFIX = "Icon role:";
const CANDIDATE_PREFIX = "Tabler Line:";
const MODULE_PREFIX = "Module:";

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function sameList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deterministicResourceId(role: string): string {
  const hex = createHash("sha256").update(`unigentamos:style-guide:icon:${role}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join("");
  return `personal-${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function generatedSubjects(role: string, candidate: string): string[] {
  const entry = ICON_REGISTRY_BY_ID.get(role);
  if (!entry) throw new Error("Unknown icon role");
  return [
    "Component: Icon",
    `${ROLE_PREFIX} ${role}`,
    `${CANDIDATE_PREFIX} ${candidate}`,
    ...iconModules(entry).filter((module) => module !== "System").map((module) => `${MODULE_PREFIX} ${module}`)
  ];
}

function resourceBody(role: string, candidate: string): string {
  const entry = ICON_REGISTRY_BY_ID.get(role);
  if (!entry) throw new Error("Unknown icon role");
  const usage = entry.usages.map((item) => `${item.module} › ${item.breadcrumb}`).join("; ");
  return encodeStyleGuideComponent({
    visual: `${candidateLabel(candidate)} from Streamline’s Tabler Line set. 24 × 24 grid, 2 px stroke, round caps and joins, currentColor by default. Usage: ${usage}.`,
    code: `<UnigentamosIcon role="${role}" />`,
    animation: "Static semantic icon. Color may inherit the owning module token; motion is not applied to the glyph itself."
  });
}

function findExisting(records: PersonalRecord[], role: string): PersonalRecord | undefined {
  const id = deterministicResourceId(role);
  return records.find((record) => record.id === id) || records.find((record) =>
    record.className === "resource" &&
    record.subjects.some((subject) => subject.toLowerCase() === `${ROLE_PREFIX} ${role}`.toLowerCase())
  );
}

export async function ensureIconComponentResource(role: string, candidate: string): Promise<{ records: PersonalRecord[]; resourceId: string }> {
  const entry = ICON_REGISTRY_BY_ID.get(role);
  if (!entry || !entry.candidates.includes(candidate)) throw new Error("Invalid icon selection");
  const currentRecords = await readPersonalRecords();
  const existing = findExisting(currentRecords, role);
  const title = `${entry.label} (Icon)`;
  const url = streamlineIconUrl(candidate);
  const subjects = generatedSubjects(role, candidate);
  const notes = [
    "Source set: Streamline HQ · Tabler Line",
    "Geometry: 24 × 24",
    "Stroke: 2 px",
    `Selected glyph: ${candidateLabel(candidate)}`
  ];

  if (!existing) {
    const records = await createPersonalRecord(resourceCreateInputToLegacy({
      title,
      url,
      body: resourceBody(role, candidate),
      areas: [STYLE_GUIDE_AREA],
      subjects,
      type: "tool",
      lifecycle: "active",
      sourceDomain: "streamlinehq.com",
      usefulness: 5,
      trust: 5,
      notes
    }), { requestedId: deterministicResourceId(role) });
    return { records, resourceId: deterministicResourceId(role) };
  }

  const preservedSubjects = existing.subjects.filter((subject) => {
    const normalized = subject.toLowerCase();
    return !normalized.startsWith(ROLE_PREFIX.toLowerCase())
      && !normalized.startsWith(CANDIDATE_PREFIX.toLowerCase())
      && !normalized.startsWith(MODULE_PREFIX.toLowerCase())
      && normalized !== "component: icon";
  });
  const nextAreas = unique([...existing.areas, STYLE_GUIDE_AREA]);
  const nextSubjects = unique([...preservedSubjects, ...subjects]);
  const nextBody = resourceBody(role, candidate);
  const profile = existing.resourceProfile;
  if (
    existing.title === title &&
    existing.url === url &&
    existing.body === nextBody &&
    sameList(existing.areas, nextAreas) &&
    sameList(existing.subjects, nextSubjects) &&
    profile?.resourceType === "tool" &&
    profile.lifecycle === "active" &&
    profile.sourceDomain === "streamlinehq.com" &&
    profile.usefulness === 5 &&
    profile.trust === 5 &&
    sameList(profile.notes, notes)
  ) {
    return { records: currentRecords, resourceId: existing.id };
  }
  const records = await updatePersonalRecord(existing.id, resourceUpdateInputToLegacy({
    title,
    url,
    body: nextBody,
    areas: nextAreas,
    subjects: nextSubjects,
    type: "tool",
    lifecycle: "active",
    sourceDomain: "streamlinehq.com",
    usefulness: 5,
    trust: 5,
    notes
  }), { expectedUpdatedAt: existing.updatedAt });
  return { records, resourceId: existing.id };
}
