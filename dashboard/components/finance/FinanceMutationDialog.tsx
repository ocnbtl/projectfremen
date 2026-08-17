"use client";

import { useEffect, useRef, useState } from "react";
import type { FinanceClosePeriodRecord, FinanceImportPreview, FinanceRecordKind, FinanceState } from "../../lib/modules/finance/native-types";
import { createFinanceRepository } from "../../lib/modules/finance/repository";
import { Icon } from "./FinancePrimitives";

export type FinanceOperation =
  | "account" | "edit" | "balance" | "transaction" | "transaction_review" | "import"
  | "transfer" | "savings" | "bill" | "payment" | "budget" | "close"
  | "close_check" | "complete_close" | "reopen_close" | "rule" | "archive" | "restore";

type Selection = { kind: FinanceRecordKind; id: string } | null;

const TITLES: Record<FinanceOperation, string> = {
  account: "Add account", edit: "Edit Finance record", balance: "Record balance snapshot", transaction: "Record transaction",
  transaction_review: "Reconcile transaction", import: "Import bank CSV", transfer: "Record paired transfer",
  savings: "Record savings movement", bill: "Add bill or subscription", payment: "Record bill payment",
  budget: "Create monthly budget", close: "Start monthly close", close_check: "Resolve close check",
  complete_close: "Complete monthly close", reopen_close: "Reopen monthly close", rule: "Create controlled rule",
  archive: "Archive Finance record", restore: "Restore Finance record"
};

const today = () => new Date().toISOString().slice(0, 10);
const month = () => today().slice(0, 7);

function selectedRecord(state: FinanceState, selection: Selection): Record<string, unknown> | null {
  if (!selection) return null;
  const rows = selection.kind === "account" ? state.accounts
    : selection.kind === "transaction" ? state.transactions
      : selection.kind === "transfer" ? state.transfers
        : selection.kind === "savings_movement" ? state.savingsMovements
          : selection.kind === "bill" ? state.bills
            : selection.kind === "budget" ? state.budgets
              : selection.kind === "close_period" ? state.closePeriods : state.rules;
  return (rows.find((item) => item.id === selection.id) || null) as unknown as Record<string, unknown> | null;
}

function value(form: FormData, name: string): string {
  const item = form.get(name);
  return typeof item === "string" ? item.trim() : "";
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <label><span>{label}</span><input {...input} /></label>;
}

function Select({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string; children: React.ReactNode }) {
  return <label><span>{label}</span><select name={name} defaultValue={defaultValue}>{children}</select></label>;
}

function AccountOptions({ state }: { state: FinanceState }) {
  return <>{state.accounts.filter((item) => !item.archivedAt).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.entityScope}</option>)}</>;
}

function csvHeaders(text: string): string[] {
  const headers: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      headers.push(field.trim()); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      headers.push(field.trim());
      break;
    } else field += char;
  }
  if (!headers.length && field.trim()) headers.push(field.trim());
  return headers.filter(Boolean).slice(0, 100);
}

function MappingSelect({ label, name, headers }: { label: string; name: string; headers: readonly string[] }) {
  return <Select label={label} name={name} defaultValue=""><option value="">Auto-detect</option>{headers.map((header) => <option key={`${name}:${header}`} value={header}>{header}</option>)}</Select>;
}

function EditFields({ state, selection, record }: { state: FinanceState; selection: Selection; record: Record<string, unknown> }) {
  if (selection?.kind === "account") return <>
    <Field label="Account name" name="name" defaultValue={String(record.name || "")} required maxLength={160} />
    <Select label="Type" name="kind" defaultValue={String(record.kind || "Checking")}>{["Checking", "Savings", "Credit", "Brokerage", "Cash", "Business"].map((item) => <option key={item}>{item}</option>)}</Select>
    <Field label="Institution" name="institution" defaultValue={String(record.institution || "")} maxLength={160} />
    <Field label="Last four digits" name="mask" defaultValue={String(record.mask || "")} maxLength={4} inputMode="numeric" />
    <Field label={record.kind === "Credit" ? "Amount owed" : "Current balance"} name="currentBalance" type="number" step="0.01" defaultValue={String(record.kind === "Credit" ? Math.abs(Number(record.currentBalance || 0)) : record.currentBalance ?? 0)} required />
    <Field label="Balance as of" name="balanceAsOf" type="date" defaultValue={String(record.balanceAsOf || today())} required />
    <Select label="Entity" name="entityScope" defaultValue={String(record.entityScope || "personal")}><option value="personal">Personal</option><option value="business">Business</option></Select>
  </>;
  if (selection?.kind === "transaction") return <>
    <Field label="Date" name="occurredOn" type="date" defaultValue={String(record.occurredOn || today())} required />
    <Field label="Merchant or source" name="merchant" defaultValue={String(record.merchant || "")} required maxLength={240} />
    <Select label="Account" name="accountId" defaultValue={String(record.accountId || "")}><AccountOptions state={state} /></Select>
    <Select label="Direction" name="direction" defaultValue={String(record.direction || "expense")}><option value="expense">Expense</option><option value="income">Income</option></Select>
    <Field label="Amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={String(record.amount || "")} required />
    <Field label="Category" name="category" defaultValue={String(record.category || "Uncategorized")} maxLength={160} />
    <Field label="Memo" name="memo" defaultValue={String(record.memo || "")} maxLength={1000} />
    <Select label="Status" name="status" defaultValue={String(record.status || "pending")}><option value="pending">Needs review</option><option value="cleared">Cleared</option></Select>
    <Select label="Entity" name="entityScope" defaultValue={String(record.entityScope || "personal")}><option value="personal">Personal</option><option value="business">Business</option></Select>
    <label><span>Reviewed</span><input name="reviewed" type="checkbox" defaultChecked={Boolean(record.reviewed)} /></label>
  </>;
  if (selection?.kind === "bill") return <>
    <Field label="Bill or subscription" name="name" defaultValue={String(record.name || "")} required maxLength={240} />
    <Field label="Amount" name="amount" type="number" min="0.01" step="0.01" defaultValue={String(record.amount || "")} required />
    <Field label="Due date" name="dueDate" type="date" defaultValue={String(record.dueDate || today())} required />
    <Select label="Account" name="accountId" defaultValue={String(record.accountId || "")}><AccountOptions state={state} /></Select>
    <Field label="Category" name="category" defaultValue={String(record.category || "Uncategorized")} maxLength={160} />
    <Select label="Status" name="status" defaultValue={String(record.status || "scheduled")}><option value="scheduled">Scheduled</option><option value="soon">Soon</option><option value="due">Due</option><option value="overdue">Overdue</option></Select>
    <Select label="Repeats" name="recurring" defaultValue={String(record.recurring || "")}><option value="">One-time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="annual">Annual</option></Select>
    <Select label="Entity" name="entityScope" defaultValue={String(record.entityScope || "personal")}><option value="personal">Personal</option><option value="business">Business</option></Select>
    <label><span>Autopay</span><input name="autopay" type="checkbox" defaultChecked={Boolean(record.autopay)} /></label>
  </>;
  if (selection?.kind === "budget") return <>
    <Field label="Month" name="period" type="month" defaultValue={String(record.period || month())} required />
    <Field label="Category" name="category" defaultValue={String(record.category || "")} required maxLength={160} />
    <Field label="Monthly limit" name="limit" type="number" min="0" step="0.01" defaultValue={String(record.limit ?? "")} required />
    <Select label="Entity" name="entityScope" defaultValue={String(record.entityScope || "personal")}><option value="personal">Personal</option><option value="business">Business</option></Select>
  </>;
  return <p>This record is managed through its specialized Finance workflow.</p>;
}

function Fields({ operation, state, record, selection, importHeaders, onImportFile }: {
  operation: FinanceOperation;
  state: FinanceState;
  record: Record<string, unknown> | null;
  selection: Selection;
  importHeaders: readonly string[];
  onImportFile: (file: File | null) => void;
}) {
  if (operation === "edit" && record) return <EditFields state={state} selection={selection} record={record} />;
  if (operation === "account") return <>
    <Field label="Account name" name="name" required maxLength={160} />
    <Select label="Type" name="accountKind" defaultValue="Checking">{["Checking", "Savings", "Credit", "Brokerage", "Cash", "Business"].map((item) => <option key={item}>{item}</option>)}</Select>
    <Field label="Institution (optional)" name="institution" maxLength={160} />
    <Field label="Display mask (last four only)" name="mask" maxLength={4} inputMode="numeric" />
    <Field label="Balance or amount owed" name="currentBalance" type="number" step="0.01" defaultValue="0" required />
    <Field label="Balance as of" name="balanceAsOf" type="date" defaultValue={today()} required />
    <Select label="Entity scope" name="entityScope" defaultValue="personal"><option value="personal">Personal</option><option value="business">Business</option></Select>
    <p>For a credit card, enter the amount owed as a positive number. Finance subtracts it from net worth automatically.</p>
  </>;
  if (operation === "balance") return <>
    <Field label={record?.kind === "Credit" ? "Amount owed" : "Balance"} name="currentBalance" type="number" step="0.01" defaultValue={String(record?.kind === "Credit" ? Math.abs(Number(record.currentBalance || 0)) : record?.currentBalance ?? 0)} required />
    <Field label="Balance as of" name="balanceAsOf" type="date" defaultValue={today()} required />
    <Select label="Source" name="balanceSource" defaultValue="manual"><option value="manual">Manual snapshot</option><option value="imported">Imported statement fact</option></Select>
  </>;
  if (operation === "transaction") return <>
    <Field label="Date" name="occurredOn" type="date" defaultValue={today()} required />
    <Field label="Merchant or source" name="merchant" required maxLength={240} />
    <Select label="Account" name="accountId" defaultValue={record && "currentBalance" in record ? String(record.id) : undefined}><AccountOptions state={state} /></Select>
    <Select label="Direction" name="direction" defaultValue="expense"><option value="expense">Expense</option><option value="income">Income</option></Select>
    <Field label="Amount" name="amount" type="number" min="0.01" step="0.01" required />
    <Field label="Category" name="category" defaultValue="Uncategorized" maxLength={160} />
    <Field label="Memo (optional)" name="memo" maxLength={1000} />
    <Select label="Entity scope" name="entityScope" defaultValue="personal"><option value="personal">Personal</option><option value="business">Business</option></Select>
  </>;
  if (operation === "transaction_review") return <p>This records review and clears pending status. It does not alter the explicit account balance snapshot.</p>;
  if (operation === "import") return <>
    <Select label="Destination account" name="accountId" defaultValue={record && "currentBalance" in record ? String(record.id) : undefined}><AccountOptions state={state} /></Select>
    <Select label="Entity scope" name="entityScope" defaultValue="personal"><option value="personal">Personal</option><option value="business">Business</option></Select>
    <label><span>Choose your bank CSV</span><input name="csv" type="file" accept=".csv,text/csv" required onChange={(event) => onImportFile(event.currentTarget.files?.[0] || null)} /></label>
    {importHeaders.length > 0 && <details className="finance-import-mapping"><summary>Check column matching</summary><div>
      <MappingSelect label="Date" name="mappingDate" headers={importHeaders} />
      <MappingSelect label="Description" name="mappingDescription" headers={importHeaders} />
      <MappingSelect label="Amount" name="mappingAmount" headers={importHeaders} />
      <MappingSelect label="Debit (if separate)" name="mappingDebit" headers={importHeaders} />
      <MappingSelect label="Credit (if separate)" name="mappingCredit" headers={importHeaders} />
      <MappingSelect label="Debit / credit type" name="mappingDirection" headers={importHeaders} />
      <MappingSelect label="Category" name="mappingCategory" headers={importHeaders} />
      <MappingSelect label="Memo" name="mappingMemo" headers={importHeaders} />
    </div></details>}
    <p>Finance previews everything first. Valid uncategorized rows are imported as “Needs review”; the original CSV itself is not stored.</p>
  </>;
  if (operation === "transfer" || operation === "savings") return <>
    <Field label="Date" name="occurredOn" type="date" defaultValue={today()} required />
    {operation === "savings" && <Select label="Direction" name="direction" defaultValue="to_savings"><option value="to_savings">To savings</option><option value="from_savings">From savings</option></Select>}
    <Select label="From account" name="fromAccountId" defaultValue={record && "currentBalance" in record ? String(record.id) : undefined}><AccountOptions state={state} /></Select>
    <Select label="To account" name="toAccountId"><AccountOptions state={state} /></Select>
    <Field label="Amount" name="amount" type="number" min="0.01" step="0.01" required />
    {operation === "savings" && <Field label="Existing transfer ID (optional)" name="transferId" maxLength={240} />}
    <Field label="Memo (optional)" name="memo" maxLength={1000} />
    <p>{operation === "transfer" ? "Paired ledger rows are excluded from income and spending." : "Savings movement is a first-class fact and may reference a transfer."}</p>
  </>;
  if (operation === "bill") return <>
    <Field label="Bill or vendor" name="name" required maxLength={240} />
    <Field label="Amount" name="amount" type="number" min="0.01" step="0.01" required />
    <Field label="Due date" name="dueDate" type="date" defaultValue={today()} required />
    <Select label="Expected account" name="accountId"><AccountOptions state={state} /></Select>
    <Field label="Category" name="category" defaultValue="Uncategorized" maxLength={160} />
    <Select label="Recurrence" name="recurring" defaultValue=""><option value="">One-time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="annual">Annual</option></Select>
    <Select label="Entity scope" name="entityScope" defaultValue="personal"><option value="personal">Personal</option><option value="business">Business</option></Select>
    <label><span>Autopay</span><input name="autopay" type="checkbox" /></label>
  </>;
  if (operation === "payment") return <>
    <p>Attach a canonical evidence reference when one exists. Otherwise, record an explicit exception.</p>
    <Field label="Evidence owner module" name="evidenceModule" placeholder="notes" maxLength={80} />
    <Field label="Evidence object type" name="evidenceObjectType" placeholder="note" maxLength={100} />
    <Field label="Evidence object ID" name="evidenceObjectId" maxLength={240} />
    <Field label="Evidence label" name="evidenceLabel" maxLength={500} />
    <Field label="Canonical evidence route" name="evidenceRoute" placeholder="/admin/notes/..." maxLength={1000} />
    <Field label="Exception reason (when evidence is unavailable)" name="exceptionReason" maxLength={1000} />
    <p>This records an observed outcome; it never sends money.</p>
  </>;
  if (operation === "budget") return <>
    <Field label="Period" name="period" type="month" defaultValue={month()} required />
    <Field label="Category" name="category" required maxLength={160} />
    <Field label="Monthly cap" name="limit" type="number" min="0" step="0.01" required />
    <Select label="Entity scope" name="entityScope" defaultValue="personal"><option value="personal">Personal</option><option value="business">Business</option></Select>
  </>;
  if (operation === "close") return <><Field label="Close period" name="period" type="month" defaultValue={month()} required /><p>Six named required checks will be created. Completion is evidence-gated.</p></>;
  if (operation === "close_check") return <>
    <Select label="Resolution" name="resolution" defaultValue="complete"><option value="complete">Complete</option><option value="waived">Waive with reason</option><option value="carried_forward">Carry forward</option><option value="open">Reopen check</option></Select>
    <Field label="Reason or evidence note" name="reason" maxLength={2000} />
    <Field label="Evidence owner module" name="evidenceModule" maxLength={80} />
    <Field label="Evidence object type" name="evidenceObjectType" maxLength={100} />
    <Field label="Evidence object ID" name="evidenceObjectId" maxLength={240} />
    <Field label="Evidence label" name="evidenceLabel" maxLength={500} />
    <Field label="Canonical evidence route" name="evidenceRoute" maxLength={1000} />
    <Field label="Owner module (carry-forward)" name="ownerModule" placeholder="personal_ops" maxLength={80} />
    <Field label="Owner object type" name="ownerObjectType" placeholder="decision" maxLength={100} />
    <Field label="Owner object ID" name="ownerObjectId" maxLength={240} />
    <Field label="Owner label" name="ownerLabel" maxLength={500} />
    <Field label="Canonical owner route" name="ownerRoute" placeholder="/admin/personal/decisions" maxLength={1000} />
  </>;
  if (operation === "complete_close") return <p>Every required check is revalidated. Completion is rejected while any remains open.</p>;
  if (operation === "reopen_close") return <Field label="Reason for reopening" name="reason" required maxLength={2000} />;
  if (operation === "rule") return <>
    <Field label="Rule name" name="name" required maxLength={200} />
    <Field label="Description" name="description" maxLength={1000} />
    <Select label="Type" name="type" defaultValue="categorization"><option value="categorization">Categorization</option><option value="receipt_evidence">Receipt evidence</option><option value="recurrence">Recurrence</option><option value="budget_variance">Budget variance</option><option value="savings">Savings</option><option value="import_repair">Import repair</option><option value="close_blocker">Close blocker</option><option value="project_link">Project link</option></Select>
    <Select label="Mode" name="mode" defaultValue="suggest"><option value="suggest">Suggestion</option><option value="manual_approval">Manual approval</option><option value="draft">Draft</option><option value="disabled">Disabled</option></Select>
    <Field label="Condition · merchant contains" name="conditionMerchant" required maxLength={240} />
    <Field label="Suggested action" name="actionLabel" required maxLength={240} placeholder="Suggest category: Software" />
    <Field label="Test merchant" name="testMerchant" required maxLength={240} />
    <label><span>Test should match</span><input name="expectedMatch" type="checkbox" defaultChecked /></label>
    <p>High-impact outcomes remain suggestions or drafts until explicitly confirmed.</p>
  </>;
  if (operation === "archive") return <Field label="Archive reason" name="reason" required maxLength={2000} />;
  return <p>The archived record and its audit history will be restored without recreating it.</p>;
}

export default function FinanceMutationDialog({ operation, state, selection, closeCheckId, onClose, onState }: {
  operation: FinanceOperation | null;
  state: FinanceState;
  selection: Selection;
  closeCheckId?: string;
  onClose: () => void;
  onState: (state: FinanceState, message: string) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const idempotencyKeyRef = useRef("");
  const repository = useRef(createFinanceRepository()).current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<FinanceImportPreview | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const record = selectedRecord(state, selection);

  useEffect(() => {
    idempotencyKeyRef.current = operation ? `finance-${crypto.randomUUID()}` : "";
  }, [operation]);

  useEffect(() => {
    if (!operation) return;
    setError("");
    setPreview(null);
    setImportHeaders([]);
  }, [operation]);

  useEffect(() => {
    if (!operation || !dialogRef.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])") || []);
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = controls(); if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [busy, onClose, operation]);

  if (!operation) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    let result;
    if (operation === "import") {
      const file = form.get("csv");
      if (!(file instanceof File) || !file.size) { setError("Choose a CSV file."); setBusy(false); return; }
      if (file.size > 5_000_000) { setError("Choose a CSV smaller than 5 MB."); setBusy(false); return; }
      const mapping = {
        date: value(form, "mappingDate"),
        description: value(form, "mappingDescription"),
        amount: value(form, "mappingAmount"),
        debit: value(form, "mappingDebit"),
        credit: value(form, "mappingCredit"),
        direction: value(form, "mappingDirection"),
        category: value(form, "mappingCategory"),
        memo: value(form, "mappingMemo")
      };
      const outcome = await repository.previewImport({ accountId: value(form, "accountId"), entityScope: value(form, "entityScope"), sourceFilename: file.name, csvText: await file.text(), mapping });
      setBusy(false); if (!outcome.ok) { setError(outcome.error.message); return; } setPreview(outcome.data); return;
    }
    if (operation === "edit" && selection && record) {
      const fields: Record<string, unknown> = {};
      for (const [name, item] of form.entries()) if (!(item instanceof File)) fields[name] = item;
      if (selection.kind === "transaction") fields.reviewed = form.has("reviewed");
      if (selection.kind === "bill") fields.autopay = form.has("autopay");
      result = await repository.patch({ kind: selection.kind, id: selection.id, expectedUpdatedAt: record.updatedAt, action: "update", fields });
    } else if (operation === "transaction_review" && selection && record) {
      result = await repository.patch({ kind: selection.kind, id: selection.id, expectedUpdatedAt: record.updatedAt, action: "update", fields: { reviewed: true, status: "cleared" } });
    } else if (operation === "payment" && selection && record) {
      const evidenceObjectId = value(form, "evidenceObjectId");
      result = await repository.patch({
        kind: selection.kind,
        id: selection.id,
        expectedUpdatedAt: record.updatedAt,
        action: "mark_paid",
        exceptionReason: value(form, "exceptionReason"),
        ...(evidenceObjectId ? { paymentEvidenceRef: {
          module: value(form, "evidenceModule"),
          objectType: value(form, "evidenceObjectType"),
          objectId: evidenceObjectId,
          label: value(form, "evidenceLabel"),
          route: value(form, "evidenceRoute")
        } } : {})
      });
    } else if (operation === "close_check" && selection && record) {
      const ownerId = value(form, "ownerObjectId");
      const evidenceId = value(form, "evidenceObjectId");
      result = await repository.patch({ kind: selection.kind, id: selection.id, expectedUpdatedAt: record.updatedAt, action: "resolve_close_check", checkId: closeCheckId, resolution: value(form, "resolution"), reason: value(form, "reason"),
        ...(evidenceId ? { evidenceRefs: [{ module: value(form, "evidenceModule"), objectType: value(form, "evidenceObjectType"), objectId: evidenceId, label: value(form, "evidenceLabel"), route: value(form, "evidenceRoute") }] } : {}),
        ...(ownerId ? { carryForwardOwnerRef: { module: value(form, "ownerModule"), objectType: value(form, "ownerObjectType"), objectId: ownerId, label: value(form, "ownerLabel"), route: value(form, "ownerRoute") } } : {}) });
    } else if ((operation === "complete_close" || operation === "reopen_close") && selection && record) {
      result = await repository.patch({ kind: selection.kind, id: selection.id, expectedUpdatedAt: record.updatedAt, action: operation, reason: value(form, "reason") });
    } else if ((operation === "archive" || operation === "restore") && selection && record) {
      result = await repository.patch({ kind: selection.kind, id: selection.id, expectedUpdatedAt: record.updatedAt, action: operation, reason: value(form, "reason") });
    } else if (operation === "balance" && selection && record) {
      result = await repository.patch({ kind: selection.kind, id: selection.id, expectedUpdatedAt: record.updatedAt, action: "update", fields: { currentBalance: value(form, "currentBalance"), balanceAsOf: value(form, "balanceAsOf"), balanceSource: value(form, "balanceSource") } });
    } else {
      const input: Record<string, unknown> = { kind: operation === "savings" ? "savings_movement" : operation === "close" ? "close_period" : operation };
      for (const [name, item] of form.entries()) if (!(item instanceof File)) input[name] = item;
      if (operation === "bill") input.autopay = form.has("autopay");
      if (operation === "rule") {
        const actionId = `finance-rule-action-${crypto.randomUUID()}`;
        input.enabled = !["draft", "disabled"].includes(value(form, "mode"));
        input.scope = "Finance transactions";
        input.trigger = "Manual deterministic evaluation";
        input.conditions = [{
          id: `finance-rule-condition-${crypto.randomUUID()}`,
          field: "merchant",
          operator: "contains",
          value: value(form, "conditionMerchant"),
          label: `Merchant contains ${value(form, "conditionMerchant")}`,
          required: true
        }];
        input.actions = [{ id: actionId, label: value(form, "actionLabel"), destination: "finance", approvalRequired: true, mutationLevel: "flag_only" }];
        input.tests = [{ id: `finance-rule-test-${crypto.randomUUID()}`, label: "Configured merchant test", input: { merchant: value(form, "testMerchant") }, expectedActionIds: form.has("expectedMatch") ? [actionId] : [] }];
      }
      result = await repository.create(input, idempotencyKeyRef.current);
    }
    setBusy(false); if (!result.ok) { setError(result.error.message); return; }
    idempotencyKeyRef.current = "";
    onState(result.data.state, `${TITLES[operation]} saved.`); onClose();
  };

  const confirm = async () => {
    if (!preview) return; setBusy(true); setError("");
    const importableRows = preview.rows.filter((row) => row.status !== "rejected");
    const result = await repository.confirmImport({
      previewId: preview.previewId,
      selectedFingerprints: importableRows.map((row) => row.fingerprint)
    }, idempotencyKeyRef.current);
    setBusy(false); if (!result.ok) { setError(result.error.message); return; }
    idempotencyKeyRef.current = "";
    onState(result.data.state, `${importableRows.length} transaction${importableRows.length === 1 ? "" : "s"} imported. ${preview.counts.ambiguous} still need categorization; ${preview.counts.rejected} invalid or duplicate row${preview.counts.rejected === 1 ? " was" : "s were"} skipped.`); onClose();
  };

  const needsAccount = ["transaction", "import", "transfer", "savings", "bill"].includes(operation);
  return <div className="finance-modal-backdrop" role="presentation">
    <section ref={dialogRef} className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="finance-mutation-title">
      <button type="button" className="finance-rail-close" onClick={onClose} aria-label="Close Finance operation" disabled={busy}><Icon name="X" /></button>
      <h2 id="finance-mutation-title">{TITLES[operation]}</h2>
      {error && <p className="finance-form-error" role="alert">{error}</p>}
      {preview ? <div className="finance-import-preview">
        <p><strong>{preview.sourceFilename}</strong> is ready.</p>
        <dl><div><dt>Ready to import</dt><dd>{preview.counts.accepted + preview.counts.ambiguous}</dd></div><div><dt>Needs category</dt><dd>{preview.counts.ambiguous}</dd></div><div><dt>Skipped</dt><dd>{preview.counts.rejected}</dd></div><div><dt>Needs review after import</dt><dd>{preview.counts.accepted + preview.counts.ambiguous}</dd></div></dl>
        <div className="finance-import-preview__rows" aria-label="CSV preview rows">{preview.rows.slice(0, 8).map((row) => <div key={`${row.rowNumber}:${row.fingerprint}`} data-status={row.status}><span>{row.occurredOn || `Row ${row.rowNumber}`}</span><strong>{row.merchant || row.reason || "Unreadable row"}</strong><span>{row.amount === undefined ? "Skipped" : `$${row.amount.toFixed(2)}`}</span><small>{row.status === "ambiguous" ? "Needs category" : row.status === "rejected" ? "Skipped" : "Ready"}</small></div>)}</div>
        <p>Ready rows become transactions immediately. Uncategorized rows stay visible as “Needs review,” so you can categorize and reconcile them later.</p>
        <div className="finance-modal-actions"><button type="button" className="finance-action" onClick={() => setPreview(null)} disabled={busy}>Back</button><button type="button" className="finance-action is-primary" onClick={() => void confirm()} disabled={busy}>{busy ? "Importing…" : preview.counts.accepted + preview.counts.ambiguous ? `Import ${preview.counts.accepted + preview.counts.ambiguous} transactions` : "Save skipped-row record"}</button></div>
      </div> : <form onSubmit={(event) => void submit(event)}>
        <div><Fields operation={operation} state={state} record={record} selection={selection} importHeaders={importHeaders} onImportFile={(file) => {
          setError("");
          if (!file) { setImportHeaders([]); return; }
          if (file.size > 5_000_000) { setImportHeaders([]); setError("Choose a CSV smaller than 5 MB."); return; }
          void file.text().then((text) => setImportHeaders(csvHeaders(text))).catch(() => setError("This CSV could not be read."));
        }} /></div>
        <div className="finance-modal-actions"><button type="button" className="finance-action" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="finance-action is-primary" disabled={busy || (needsAccount && state.accounts.filter((item) => !item.archivedAt).length === 0)}>{busy ? "Saving…" : operation === "import" ? "Preview CSV" : "Save"}</button></div>
      </form>}
    </section>
  </div>;
}

export function activeCloseForState(state: FinanceState): FinanceClosePeriodRecord | null {
  return state.closePeriods.filter((item) => !item.archivedAt).sort((left, right) => right.period.localeCompare(left.period))[0] || null;
}
