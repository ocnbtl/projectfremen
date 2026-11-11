"use client";

import type { ReactNode } from "react";
import type { PersonalRecord } from "../../lib/personal-records-store";
import { createNativeObjectRef } from "../../lib/native-objects/routes";
import { organizationLabels } from "../../lib/modules/people/organization-labels";
import { EventObjectPreview } from "../planning/EventLinksPreview";

/** Uses the same lightweight, locally populated preview as Calendar. */
export default function PeopleProfilePreview({ person, onOpen, className = "", children }: {
  person: PersonalRecord; onOpen: (person: PersonalRecord) => void; className?: string; children: ReactNode;
}) {
  const profile = person.profile;
  const summary = person.className === "org"
    ? [...Object.values(organizationLabels(profile)), profile?.headquarters || profile?.livesIn]
    : [profile?.primaryOccupation || profile?.occupations?.[0]?.title, profile?.primaryEmployer || profile?.occupations?.[0]?.employer, profile?.livesIn];
  const record = {
    ...createNativeObjectRef({ module: "people", objectType: person.className === "org" ? "organization" : "person", objectId: person.id, label: person.title }),
    preview: { imageUrl: profile?.photoUrl, imageUpdatedAt: profile?.photoUpdatedAt, detail: [...summary, profile?.context || person.body].filter(Boolean).join(" · ").slice(0, 600) }
  };
  return <EventObjectPreview record={record} triggerClassName={className} onOpenProfile={()=>onOpen(person)}>{children}</EventObjectPreview>;
}
