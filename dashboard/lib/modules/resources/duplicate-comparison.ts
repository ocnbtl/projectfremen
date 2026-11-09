import type { ResourceRecord } from "./types";
import type { ResourceExactUrlCollisionGroup } from "./duplicate-evidence";

export function compareResourceDuplicates(group: ResourceExactUrlCollisionGroup, resources: readonly ResourceRecord[]) {
  const members = group.members.flatMap(member => {
    const resource = resources.find(item => item.id === member.resourceId);
    return resource ? [resource] : [];
  });
  const fields = [
    { id: "title", label: "Name", value: (r: ResourceRecord) => r.title },
    { id: "type", label: "Type", value: (r: ResourceRecord) => r.type.replaceAll("_", " ") },
    { id: "source", label: "Matching source", value: (r: ResourceRecord) => r.source.candidates.filter(c => c.matchKey === group.matchKey).map(c => c.value).sort().join("\n") },
    { id: "body", label: "Description", value: (r: ResourceRecord) => r.body.trim() },
    { id: "image", label: "Picture URL", value: (r: ResourceRecord) => r.metadata.imageUrl || "" },
    { id: "status", label: "Status", value: (r: ResourceRecord) => r.lifecycleState.replaceAll("_", " ") },
  ].map(field => ({ ...field, different: new Set(members.map(field.value)).size > 1 }));
  return {
    members,
    fields,
    differences: fields.filter(field => field.different),
    ignoresFragment: members.some(r => r.source.candidates.some(c => c.matchKey === group.matchKey && c.hadFragment)),
  };
}
