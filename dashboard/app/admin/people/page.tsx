import AdminChrome from "../../../components/AdminChrome";
import PeopleWorkspace from "../../../components/PeopleWorkspace";
import { readPersonalRecords, type PersonalRecord } from "../../../lib/personal-records-store";
import { requireAdminSession } from "../../../lib/require-admin";

export const dynamic = "force-dynamic";

function daysUntil(value?: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function isDue(record: PersonalRecord) {
  const days = daysUntil(record.time.nextReview);
  return days !== null && days <= 0;
}

function isThisWeek(record: PersonalRecord) {
  const days = daysUntil(record.time.nextReview);
  return days !== null && days > 0 && days <= 7;
}

function isDormant(record: PersonalRecord) {
  if (record.status === "inactive") {
    return true;
  }
  if (!record.time.lastReview && !record.time.nextReview) {
    return true;
  }
  const last = record.time.lastReview ? new Date(record.time.lastReview) : null;
  if (!last || Number.isNaN(last.getTime())) {
    return false;
  }
  return Date.now() - last.getTime() > 1000 * 60 * 60 * 24 * 75;
}

export default async function PeoplePage() {
  await requireAdminSession();
  const records = await readPersonalRecords().catch(() => []);
  const people = records.filter(
    (record): record is PersonalRecord => record.className === "person" || record.className === "org"
  );
  const due = people.filter(isDue).length;
  const thisWeek = people.filter(isThisWeek).length;
  const dormant = people.filter(isDormant).length;
  const strongTies = people.filter((record) => record.status === "active" || record.projects.length > 0).length;

  return (
    <main className="shell admin-chrome-main module-ref-shell people-module-shell">
      <AdminChrome
        showCommandSearch={false}
        sidebarTitle="People"
        sidebarSummary="Contacts, cadence, follow-ups, relationships, and profile context."
        sidebarItems={[
          { label: "Due", value: String(due) },
          { label: "This week", value: String(thisWeek) },
          { label: "Strong ties", value: String(strongTies) },
          { label: "Dormant", value: String(dormant) },
          { label: "Native people/org notes", value: String(people.length) }
        ]}
        sidebarActions={[
          { label: "Contact cadence", href: "/admin/people" },
          { label: "People list", href: "/admin/people" },
          { label: "Relationship map", href: "/admin/personal/family" },
          { label: "Birthdays & dates", href: "/admin/people" },
          { label: "Family Domain", href: "/admin/personal/family" },
          { label: "Create Person Note", href: "/admin/personal/notes-docs" }
        ]}
      />
      <PeopleWorkspace initialPeople={people} totalRecords={records.length} />
    </main>
  );
}
