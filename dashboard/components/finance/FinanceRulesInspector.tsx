"use client";

import Link from "next/link";
import InspectorRail from "../admin-shell/InspectorRail";
import DetailTabs, { DetailTabPanel, type DetailTab } from "../operational/DetailTabs";
import ObjectHeader from "../operational/ObjectHeader";
import QuickActionBar from "../operational/QuickActionBar";
import SystemState from "../operational/SystemState";
import type { FinanceRule } from "../../lib/modules/finance/types";
import type { FinanceRuleTestRun } from "../../lib/modules/finance/rules-view-model";
import type { FinanceTab } from "../../lib/native-objects/url-state";
import {
  Chip,
  Icon
} from "./FinancePrimitives";
import {
  RULE_MUTATION_REASON,
  financeRuleHealthHue,
  financeRuleHealthLabel,
  financeRuleModeLabel
} from "./FinanceRulesView";
import styles from "./FinanceRules.module.css";

const RULE_TABS: readonly DetailTab[] = [
  { id: "overview", label: "Overview" },
  { id: "conditions", label: "Conditions" },
  { id: "actions", label: "Actions" },
  { id: "tests", label: "Tests" },
  { id: "links", label: "Links" },
  { id: "activity", label: "Activity" },
  { id: "properties", label: "Properties" }
];

const RULE_TAB_IDS = new Set(RULE_TABS.map((tab) => tab.id));

export function isFinanceRuleTab(tab: string): tab is FinanceTab {
  return RULE_TAB_IDS.has(tab);
}

function initials(label: string): string {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatTimestamp(value: string | null): string {
  if (!value) return "Not run";
  return value.replace("T", " ").replace(/([+-]\d\d:\d\d|Z)$/, "");
}

function actionLabel(rule: FinanceRule, actionId: string): string {
  return rule.actions.find((action) => action.id === actionId)?.label || actionId;
}

export default function FinanceRulesInspector({
  rule,
  run,
  activeTab,
  onTabChange,
  onRunTests,
  onClose,
  mobileOpen,
  overlay,
  overlayOpen
}: {
  rule: FinanceRule;
  run: FinanceRuleTestRun | null;
  activeTab: FinanceTab;
  onTabChange: (tab: FinanceTab) => void;
  onRunTests: () => void;
  onClose: () => void;
  mobileOpen: boolean;
  overlay: boolean;
  overlayOpen: boolean;
}) {
  const safeTab = isFinanceRuleTab(activeTab) ? activeTab : "overview";
  const facts: ReadonlyArray<readonly [string, string]> = [
    ["Status", rule.enabled ? "Active fixture" : rule.mode === "draft" ? "Draft fixture" : "Disabled fixture"],
    ["Rule type", rule.type.replaceAll("_", " ")],
    ["Mode", financeRuleModeLabel(rule.mode)],
    ["Fixture tests", String(rule.tests.length)],
    ["Fixture blockers", String(rule.generatedCloseBlockers)],
    ["Linked references", String(rule.linkedObjects.length)],
    ["Health", financeRuleHealthLabel(rule.health)],
    ["Owner", "Finance"]
  ];

  return (
    <InspectorRail
      id="finance-inspector"
      title={(
        <ObjectHeader
          headingLevel="h2"
          className={styles.inspectorHeader}
          objectType="Selected Finance rule fixture"
          title={rule.name}
          subtitle={`${rule.id} · ${rule.scope}`}
          identity={initials(rule.name)}
          states={(
            <>
              <Chip hue={rule.enabled ? "green" : rule.mode === "draft" ? "neutral" : "brown"}>{rule.enabled ? "active" : rule.mode}</Chip>
              <Chip hue="purple">{rule.type.replaceAll("_", " ")}</Chip>
              <Chip hue={financeRuleHealthHue(rule.health)}>{financeRuleHealthLabel(rule.health)}</Chip>
              {rule.requiresApproval ? <Chip hue="crimson">Requires approval</Chip> : null}
            </>
          )}
          metadata={`${rule.conditions.length} conditions · ${rule.actions.length} actions · ${rule.tests.length} fixture tests`}
        />
      )}
      actions={<button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close Finance rule inspector"><Icon name="X" /></button>}
      footer={(
        <div className={styles.inspectorFooter}>
          <QuickActionBar
            ariaLabel={`${rule.name} actions`}
            actions={[
              { id: "finance-rule-test", label: "Test rule", onSelect: onRunTests, intent: "primary" },
              { id: "finance-rule-apply", label: "Apply suggestion", disabled: true, disabledReason: RULE_MUTATION_REASON },
              { id: "finance-rule-edit", label: "Edit rule", disabled: true, disabledReason: RULE_MUTATION_REASON },
              { id: "finance-rule-disable", label: "Disable", disabled: true, disabledReason: "Disabling must preserve run history through a native FinanceRule audit writer." }
            ]}
          />
        </div>
      )}
      className={`finance-right-rail ${mobileOpen ? "is-mobile-open" : ""}`}
      ariaLabel={`${rule.name} Finance rule inspector`}
      readOnly
      overlay={overlay}
      overlayOpen={overlayOpen}
      onRequestClose={onClose}
    >
      <DetailTabs
        id="finance-rule-tabs"
        className={styles.inspectorTabs}
        tabs={RULE_TABS}
        activeTab={safeTab}
        onTabChange={(tab) => onTabChange(tab as FinanceTab)}
        ariaLabel={`${rule.name} details`}
      />

      <div className={styles.inspectorPanel}>
        <DetailTabPanel tabsId="finance-rule-tabs" tabId="overview" active={safeTab === "overview"} className={styles.inspectorPanel}>
          <div className={styles.factGrid}>
            {facts.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <section className={styles.inspectorSection}>
            <h3>Rule summary</h3>
            <p>{rule.description}</p>
          </section>
          <section className={styles.inspectorSection}>
            <h3>Generated preview actions</h3>
            <ul className={styles.compactList}>
              {rule.actions.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  <small>{item.destination} · {item.mutationLevel.replaceAll("_", " ")} · {item.approvalRequired ? "approval required" : "preview only"}</small>
                </li>
              ))}
            </ul>
          </section>
          <section className={styles.inspectorSection}>
            <h3>Guardrails</h3>
            <ul className={styles.compactList}>
              {rule.guardrails.map((guardrail) => <li key={guardrail}><strong>{guardrail}</strong></li>)}
            </ul>
            <p><strong>Failure mode:</strong> {rule.failureMode}</p>
          </section>
          <div className={styles.boundary}>
            <strong>Read-only deterministic preview</strong>
            <span>Tests run only against literal browser fixtures. They create no rule run, blocker, decision, evidence request, transaction change, or audit event.</span>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId="finance-rule-tabs" tabId="conditions" active={safeTab === "conditions"} className={styles.inspectorPanel}>
          <section className={styles.inspectorSection}>
            <h3>Structured conditions</h3>
            <ul className={styles.compactList}>
              {rule.conditions.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  <small>{item.field} · {item.operator.replaceAll("_", " ")}{item.value !== undefined ? ` · ${String(item.value)}` : ""} · {item.required ? "required" : "optional"}</small>
                </li>
              ))}
            </ul>
          </section>
          <SystemState variant="read_only" title="Condition editing is unavailable" description="There is no freeform code editor. A future structured editor must validate fields, operators, grouping, exceptions, and source schemas before save." />
        </DetailTabPanel>

        <DetailTabPanel tabsId="finance-rule-tabs" tabId="actions" active={safeTab === "actions"} className={styles.inspectorPanel}>
          <section className={styles.inspectorSection}>
            <h3>Declared actions</h3>
            <ul className={styles.compactList}>
              {rule.actions.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong>
                  <small>{item.destination} owner · {item.mutationLevel.replaceAll("_", " ")} · {item.approvalRequired ? "explicit approval required" : "suggestion only"}</small>
                </li>
              ))}
            </ul>
          </section>
          <div className={styles.boundary}>
            <strong>Source mutation is never implied</strong>
            <span>Budget caps, Project ownership, close blockers, bill payment, evidence waivers, and accepted Personal Ops records remain unchanged.</span>
          </div>
        </DetailTabPanel>

        <DetailTabPanel tabsId="finance-rule-tabs" tabId="tests" active={safeTab === "tests"} className={styles.inspectorPanel}>
          <section className={styles.inspectorSection}>
            <div className={styles.testSummary}>
              <h3>Deterministic fixture tests</h3>
              <button type="button" className={styles.testButton} onClick={onRunTests}>Run tests</button>
            </div>
            {run ? (
              <>
                <div className={styles.inlineChips} role="status" aria-live="polite">
                  <Chip hue="green">{run.passed} pass</Chip>
                  <Chip hue={run.failed ? "crimson" : "neutral"}>{run.failed} fail</Chip>
                  <Chip hue={run.review ? "orange" : "neutral"}>{run.review} review</Chip>
                  <Chip hue="blue">0 source mutations</Chip>
                </div>
                <p>Ran {formatTimestamp(run.executedAt)} in deterministic browser-preview mode.</p>
              </>
            ) : (
              <p>Run the selected fixture cases to compare expected actions with the condition engine. No request leaves the browser.</p>
            )}
            <ul className={styles.compactList}>
              {rule.tests.map((testCase) => {
                const result = run?.results.find((candidate) => candidate.testId === testCase.id);
                return (
                  <li className={styles.testResult} data-status={result?.status} key={testCase.id}>
                    <span>
                      <strong>{testCase.label}</strong>
                      <small>
                        Expected: {testCase.expectedActionIds.length
                          ? testCase.expectedActionIds.map((id) => actionLabel(rule, id)).join(" · ")
                          : "no actions"}
                      </small>
                      {result ? <small>Preview: {result.actualActionIds.length ? result.actualActionIds.map((id) => actionLabel(rule, id)).join(" · ") : "no actions"} · {result.explanation}</small> : null}
                    </span>
                    <Chip hue={!result ? "neutral" : result.status === "pass" ? "green" : result.status === "review" ? "orange" : "crimson"}>
                      {result?.status || "not run"}
                    </Chip>
                  </li>
                );
              })}
            </ul>
          </section>
        </DetailTabPanel>

        <DetailTabPanel tabsId="finance-rule-tabs" tabId="links" active={safeTab === "links"} className={styles.inspectorPanel}>
          {rule.linkedObjects.length ? (
            <section className={`${styles.inspectorSection} ${styles.linkList}`}>
              <h3>Verified owner-route references</h3>
              <p>Opening a reference preserves native ownership; the rule fixture does not copy the target object.</p>
              {rule.linkedObjects.map((reference) => (
                <Link href={reference.route} key={`${reference.module}:${reference.objectType}:${reference.objectId}`}>
                  <strong>{reference.label}</strong>
                  <small>{reference.module} · {reference.objectType} · {reference.objectId}</small>
                </Link>
              ))}
            </section>
          ) : (
            <SystemState variant="empty" title="No stable fixture references" description="No link is inferred from display text alone. Future links must use NativeObjectRef identities." />
          )}
        </DetailTabPanel>

        <DetailTabPanel tabsId="finance-rule-tabs" tabId="activity" active={safeTab === "activity"} className={styles.inspectorPanel}>
          <section className={styles.inspectorSection}>
            <h3>Fixture provenance</h3>
            <ul className={styles.compactList}>
              {rule.activity.map((item) => (
                <li key={item.id}>
                  <strong>{item.summary}</strong>
                  <small>{formatTimestamp(item.occurredAt)} · {item.action.replaceAll("_", " ")}</small>
                </li>
              ))}
              {run ? (
                <li>
                  <strong>Session-only test preview</strong>
                  <small>{formatTimestamp(run.executedAt)} · {run.passed} pass · {run.failed} fail · not persisted</small>
                </li>
              ) : null}
            </ul>
          </section>
          <SystemState variant="read_only" title="No authoritative FinanceRule audit exists" description="Fixture provenance and session-only test results are deliberately separate from a future append-only rule audit." />
        </DetailTabPanel>

        <DetailTabPanel tabsId="finance-rule-tabs" tabId="properties" active={safeTab === "properties"}>
          <div className={styles.factGrid}>
            <div><span>Rule ID</span><strong>{rule.id}</strong></div>
            <div><span>Name</span><strong>{rule.name}</strong></div>
            <div><span>Type</span><strong>{rule.type}</strong></div>
            <div><span>Scope</span><strong>{rule.scope}</strong></div>
            <div><span>Mode</span><strong>{rule.mode}</strong></div>
            <div><span>Health</span><strong>{rule.health}</strong></div>
            <div><span>Enabled fixture</span><strong>{rule.enabled ? "true" : "false"}</strong></div>
            <div><span>Approval required</span><strong>{rule.requiresApproval ? "true" : "false"}</strong></div>
            <div><span>Condition count</span><strong>{rule.conditions.length}</strong></div>
            <div><span>Action count</span><strong>{rule.actions.length}</strong></div>
            <div><span>Test count</span><strong>{rule.tests.length}</strong></div>
            <div><span>Last fixture event</span><strong>{formatTimestamp(rule.lastEventAt)}</strong></div>
            <div><span>Persistence</span><strong>Not connected</strong></div>
            <div><span>Execution mode</span><strong>Browser preview only</strong></div>
          </div>
        </DetailTabPanel>
      </div>
    </InspectorRail>
  );
}
