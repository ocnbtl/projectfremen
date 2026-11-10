"use client";
import type { ReactNode } from "react";
import type { PersonalOpsObject, PersonalOpsRoutine } from "../../lib/modules/personal-ops/types";
import PersonalOpsIcon, { type PersonalOpsIconName } from "./PersonalOpsIcon";
import styles from "./PersonalRecordOverview.module.css";

function Section({ title, icon, children }: { title: string; icon: PersonalOpsIconName; children: ReactNode }) {
  return <section className={styles.section}><h3><PersonalOpsIcon name={icon}/>{title}</h3>{children}</section>;
}
const human = (value: string) => value.replaceAll("_", " ");
const timestampDate = (value: string) => new Date(value).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const date = (value?: string) => value ? new Date(value.slice(0,10)+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "Not scheduled";

/** Each view reads and updates its existing owner record; it never creates a parallel task. */
export default function PersonalRecordOverview({ item, busy, onKeyResult, onCriterion, onEvidence, onEdit }: {
  item: PersonalOpsObject | PersonalOpsRoutine; busy: boolean; onEdit: () => void;
  onKeyResult?: (id: string) => void; onCriterion?: (id: string) => void; onEvidence?: (id: string) => void;
}) {
  const locked = busy || item.lifecycle === "archived" || item.lifecycle === "complete";
  const prompt = (text: string) => <button className={styles.prompt} type="button" disabled={busy || item.lifecycle === "archived"} onClick={onEdit}><PersonalOpsIcon name="plus"/>{text}</button>;
  return <div className={styles.overview} data-record-overview={item.objectType}>
    <div className={styles.facts}>
      <span><PersonalOpsIcon name="week"/>{item.objectType === "routine" ? `Next: ${date(item.nextRunDate || item.nextRunAt)}` : `Due: ${date(item.dueAt)}`}</span>
      <span title="Life area"><PersonalOpsIcon name="object"/>{item.domain}</span>
      <span><PersonalOpsIcon name="today"/>Created {timestampDate(item.createdAt)}</span>
      <span><PersonalOpsIcon name="edit"/>Updated {timestampDate(item.updatedAt)}</span>
    </div>
    <div className={styles.grid}>
      {item.objectType === "goal" && <>
        <Section title="Desired outcome" icon="goal"><p>{item.outcome || item.title}</p>{item.targetPeriod && <small>Target period: {item.targetPeriod}</small>}{item.description && <p className={styles.muted}>{item.description}</p>}</Section>
        <Section title="Progress & key results" icon="check">
          {item.keyResults.length ? <><div className={styles.progress}><progress aria-label="Goal progress" max={item.keyResults.length} value={item.keyResults.filter(result=>result.complete).length}/><span>{item.keyResults.filter(result=>result.complete).length} / {item.keyResults.length}</span></div>
            <ul className={styles.checks}>{item.keyResults.map(result=><li key={result.id}><label><input type="checkbox" disabled={locked} checked={result.complete} onChange={()=>onKeyResult?.(result.id)}/><span>{result.title}{result.measure && <small>{result.currentValue ?? 0} / {result.targetValue ?? "—"} {result.measure}</small>}</span></label></li>)}</ul></> : prompt("Add a measurable result")}
        </Section>
      </>}
      {item.objectType === "follow_up" && <>
        <Section title="Next action" icon="follow-up"><p>{item.context || item.description || item.title}</p><small>{human(item.followUpType)}</small>{item.description && item.context && item.description !== item.context && <p className={styles.muted}>{item.description}</p>}</Section>
        <Section title="Outcome" icon="check"><p>{item.outcome || "Record what happened when you follow up."}</p>{!item.outcome && prompt("Record an outcome")}{item.completionCriteria && <><h4>Done when</h4><p>{item.completionCriteria}</p></>}</Section>
        {(item.deferredUntil || item.deferReason) && <Section title="Revisit" icon="week"><p>{date(item.deferredUntil)}</p>{item.deferReason && <p>{item.deferReason}</p>}</Section>}
      </>}
      {item.objectType === "decision" && <>
        <Section title="The choice" icon="decision"><p>{item.question || item.title}</p>{item.description && <p className={styles.muted}>{item.description}</p>}<div className={styles.facts}><span>{human(item.reversibility)}</span><span>{human(item.risk)} risk</span></div></Section>
        <Section title="Decision & reasoning" icon="check"><p>{item.finalDecision || "No decision recorded yet."}</p>{item.rationale && <><h4>Why this choice</h4><p>{item.rationale}</p></>}{!item.finalDecision && prompt("Record the decision")}</Section>
        <Section title="Options considered" icon="list">{item.options.length ? <ul className={styles.options}>{item.options.map(option=><li key={option.id} data-chosen={option.selected || undefined}><strong>{option.selected && <PersonalOpsIcon name="check"/>}{option.title}</strong>{option.pros.length>0 && <p>Benefits: {option.pros.join(" · ")}</p>}{option.cons.length>0 && <p>Trade-offs: {option.cons.join(" · ")}</p>}{option.rejectionReason && <small>{option.rejectionReason}</small>}</li>)}</ul> : prompt("Add an option")}</Section>
        {(item.revisitAt || item.deferReason || item.supersededBy) && <Section title="Revisit & context" icon="week">{item.revisitAt && <p>{date(item.revisitAt)}</p>}{item.deferReason && <p>{item.deferReason}</p>}{item.supersededBy && <a href={item.supersededBy.route}>{item.supersededBy.label}</a>}</Section>}
      </>}
      {item.objectType === "obligation" && <>
        <Section title="The commitment" icon="check"><p>{item.description || item.title}</p>{item.consequence && <><h4>Why it matters</h4><p>{item.consequence}</p></>}{item.completionNote && <><h4>Completion note</h4><p>{item.completionNote}</p></>}</Section>
        <Section title="Requirements" icon="list">{item.completionCriteria.length ? <ul className={styles.checks}>{item.completionCriteria.map(criterion=><li key={criterion.id}><label><input type="checkbox" checked={criterion.satisfied} disabled={locked} onChange={()=>onCriterion?.(criterion.id)}/><span>{criterion.label}</span></label></li>)}</ul> : prompt("Add a completion requirement")}</Section>
        <Section title="Supporting evidence" icon="resource">{item.requiredEvidence.length ? <ul className={styles.options}>{item.requiredEvidence.map(evidence=><li key={evidence.id}><span>{evidence.label}{evidence.required && <small>Required</small>}</span><button type="button" disabled={locked} title="Cycle evidence: missing, received, verified" onClick={()=>onEvidence?.(evidence.id)}>{human(evidence.state)}<PersonalOpsIcon name={evidence.state === "verified" ? "check" : "review"}/></button></li>)}</ul> : <p className={styles.muted}>No evidence required.</p>}</Section>
      </>}
      {item.objectType === "routine" && <>
        <Section title="The routine" icon="routine"><p>{item.summary || item.title}</p>{item.completionCriteria.length ? <><h4>Each time</h4><ul className={styles.steps}>{item.completionCriteria.map((step,index)=><li key={index}>{step}</li>)}</ul></> : prompt("Add the steps")}</Section>
        <Section title="Schedule" icon="week"><dl><dt>Repeat</dt><dd>{item.cadenceRule.label || `${item.cadenceRule.interval > 1 ? `Every ${item.cadenceRule.interval} periods · ` : ""}${human(item.cadenceRule.frequency)}`}</dd>{item.cadenceRule.weekdays.length>0 && <><dt>Days</dt><dd>{item.cadenceRule.weekdays.map(day=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day]).join(", ")}</dd></>}<dt>Next run</dt><dd>{date(item.nextRunDate || item.nextRunAt)}{item.nextRunTime ? ` · ${item.nextRunTime}` : ""}</dd><dt>Time zone</dt><dd>{item.cadenceRule.timezone.replaceAll("_"," ")}</dd><dt>Last completed</dt><dd>{item.lastRunAt ? timestampDate(item.lastRunAt) : "Not yet"}</dd></dl></Section>
        <Section title="Recent completions" icon="timeline">{item.runHistory.length ? <ol className={styles.steps}>{item.runHistory.slice(-5).reverse().map(run=><li key={run.id}>{run.reopenedAt?"Reopened · ":""}{timestampDate(run.reopenedAt || run.completedAt)}{run.generatedRefs.length>0 && <small>{run.generatedRefs.length} linked next steps</small>}</li>)}</ol> : <p className={styles.muted}>Completed runs will appear here.</p>}</Section>
      </>}
    </div>
  </div>;
}
