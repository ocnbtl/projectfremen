import type { ResourceRecord, ResourceTimelineEvent } from "../../lib/modules/resources/types";
import PersonalOpsIcon, { type PersonalOpsIconName } from "../personal-ops/PersonalOpsIcon";
import styles from "./ResourceExperience.module.css";

function iconFor(event: ResourceTimelineEvent): PersonalOpsIconName {
  if (event.kind === "created") return "plus";
  if (event.kind === "reviewed") return "review";
  if (event.kind === "linked") return "link";
  if (event.kind === "automation") return "run";
  if (event.kind === "archived") return "archive";
  return "edit";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(date);
}

export default function ResourceTimelineView({ resource }: { resource: ResourceRecord }) {
  const timeline = [...resource.timeline].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return (
    <div className={styles.overview}>
      <section className={styles.timelineCard}>
        <header><h3>Timeline <span>{timeline.length}</span></h3></header>
        <div className={styles.timeline}>
          {timeline.map((event) => <article className={styles.timelineItem} key={event.id}>
            <span className={styles.timelineGlyph}><PersonalOpsIcon name={iconFor(event)} /></span>
            <div className={styles.timelineCopy}><strong>{event.title}</strong>{event.detail ? <span>{event.detail}</span> : null}</div>
            <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
          </article>)}
        </div>
      </section>
    </div>
  );
}
