import type { PersonalRecord } from "../../personal-records-store";

/** Include both ends of profile relationships, including employment and education. */
export function peopleWithRelationships(records: PersonalRecord[], links: { status?: string; source: { module: string; objectId: string }; target: { module: string; objectId: string } }[] = []) {
  const active = records.filter(r => !r.archivedAt), ids = new Set<string>();
  const key = (value: string) => value.trim().toLocaleLowerCase();
  const resolve = (value: string) => active.find(r => r.id === value || key(r.title) === key(value));
  for (const record of active) {
    const p = record.profile;
    const references = [...record.relations.related, ...record.projects, ...(p?.associatedPeople || []), ...(p?.children || []),
      ...[p?.partner, p?.primaryEmployer, p?.secondaryEmployer, p?.pastEmployer].filter((v): v is string => Boolean(v)),
      ...(p?.occupations || []).map(e => e.organizationId || e.employer || ""), ...(p?.education || []).map(e => e.organizationId || e.institution || "")].filter(Boolean);
    if (references.length) ids.add(record.id);
    for (const value of references) { const target = resolve(value); if (target) ids.add(target.id); }
  }
  for (const link of links.filter(l => l.status !== "removed")) for (const ref of [link.source, link.target]) if (ref.module === "people" && active.some(r => r.id === ref.objectId)) ids.add(ref.objectId);
  return ids;
}

export function isSchoolOrganization(record: Pick<PersonalRecord, "title" | "profile">) {
  const type = record.profile?.organizationType || "", industry = record.profile?.industry || "";
  if (/student organization|alumni organization/i.test(industry)) return false;
  return /school|university|college|academy|polytechnic|educational institution/i.test(type)
    || /^(?:primary \/ secondary education|college \/ university|higher education|vocational \/ technical)$/i.test(industry)
    || /\b(school|university|college|academy|polytechnic|kindergarten|lycee|lycée)\b/i.test(record.title);
}
