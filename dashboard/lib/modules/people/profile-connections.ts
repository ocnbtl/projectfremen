import type { PersonalRecord } from "../../personal-records-store";
import type { NativeObjectRef } from "../../native-objects/types";
import type { ObjectLink } from "../../native-objects/links";
import { isUsableObjectLink } from "../../native-objects/links";

export type ProfileConnection = { ref: NativeObjectRef; details: string[]; linkIds: string[] };
export type ProfileRecordEdge = { source: NativeObjectRef; target: NativeObjectRef; detail: string };
export const profileConnectionKey = (ref: NativeObjectRef) => `${ref.module}:${ref.objectType === "org" ? "organization" : ref.objectType}:${ref.containerObjectId || ""}:${ref.objectId}`;
const normalized = (text: string) => text.trim().toLocaleLowerCase();

/** Resolve IDs first, then an unambiguous exact name. Never guess between same-name profiles. */
export function resolveProfileTarget(value: string, targets: NativeObjectRef[], module?: string) {
  const scope = module ? targets.filter(target => target.module === module) : targets;
  const exactId = scope.filter(target => target.objectId === value);
  if (exactId.length === 1) return exactId[0];
  for (const name of [value, value.replace(/\s+\([^)]*\)$/, "")]) {
    const matches = scope.filter(target => normalized(target.label) === normalized(name));
    if (matches.length) return matches.length === 1 ? matches[0] : undefined;
  }
}

export function profileRecordReferences(record: PersonalRecord) {
  const result: { value: string; detail: string; module?: string }[] = [];
  for (const [field, values] of Object.entries(record.relations))
    for (const value of values) result.push({ value, detail: field === "related" ? "Related" : field.replace(/([A-Z])/g," $1") });
  for (const value of record.projects) result.push({value,detail:"Project",module:"projects"});
  if (record.profile) {
    const p = record.profile;
    for (const value of p.associatedPeople || []) result.push({value,detail:"Profile connection",module:"people"});
    for (const value of p.children || []) result.push({value,detail:"Family",module:"people"});
    if (p.partner) result.push({value:p.partner,detail:"Partner",module:"people"});
    for (const role of p.occupations || []) result.push({value:role.organizationId || role.employer || "",detail:role.title || "Work",module:"people"});
    for (const school of p.education || []) result.push({value:school.organizationId || school.institution || "",detail:"Education",module:"people"});
    for (const value of [p.primaryEmployer,p.secondaryEmployer,p.pastEmployer]) if (value) result.push({value,detail:"Work",module:"people"});
  }
  return result.filter(item=>item.value);
}

/** Derived edges only: no writes, name-based merging, or replacement relationship store. */
export function buildProfileRecordEdges(records: PersonalRecord[], targets: NativeObjectRef[]): ProfileRecordEdge[] {
  const edges: ProfileRecordEdge[] = [];
  for (const record of records) {
    if (record.archivedAt || record.resourceProfile?.deletedAt || record.mediaProfile?.archivedAt) continue;
    const source = targets.find(target=>target.objectId === record.id && (record.className === "person" || record.className === "org" ? target.module === "people" : true));
    if (!source) continue;
    for (const item of profileRecordReferences(record)) {
      const target = resolveProfileTarget(item.value,targets,item.module);
      if (target && profileConnectionKey(source) !== profileConnectionKey(target)) edges.push({source,target,detail:item.detail});
    }
  }
  return edges;
}

export function collectProfileConnections(source: NativeObjectRef, targets: NativeObjectRef[], links: ObjectLink[], edges: ProfileRecordEdge[], extra: {ref: NativeObjectRef; detail: string}[] = []) {
  const result = new Map<string,ProfileConnection>(), sourceKey = profileConnectionKey(source);
  const add = (ref: NativeObjectRef, detail: string, linkId?: string) => {
    const current = targets.find(target=>profileConnectionKey(target) === profileConnectionKey(ref));
    // These modules have a complete active target inventory. Do not resurrect archived/deleted profiles.
    if (!current && ["people","resources","projects","notes","media"].includes(ref.module)) return;
    ref = current || ref;
    const key = profileConnectionKey(ref);
    if (key === sourceKey) return;
    const item = result.get(key) || {ref,details:[],linkIds:[]};
    if (detail && !item.details.includes(detail)) item.details.push(detail);
    if (linkId && !item.linkIds.includes(linkId)) item.linkIds.push(linkId);
    result.set(key,item);
  };
  for (const link of links.filter(isUsableObjectLink)) {
    if (profileConnectionKey(link.source) === sourceKey) add(link.target,link.relationship.replaceAll("_"," "),link.id);
    else if (profileConnectionKey(link.target) === sourceKey) add(link.source,link.relationship.replaceAll("_"," "),link.id);
  }
  for (const edge of edges) {
    if (profileConnectionKey(edge.source) === sourceKey) add(edge.target,edge.detail);
    else if (profileConnectionKey(edge.target) === sourceKey) add(edge.source,edge.detail);
  }
  for (const item of extra) add(item.ref,item.detail);
  return [...result.values()].sort((a,b)=>a.ref.label.localeCompare(b.ref.label));
}
