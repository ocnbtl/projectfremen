"use client";
import SelectField from "../ui/SelectField";

import SystemState from "../operational/SystemState";
import { DirectoryLayout, MorphingArticle } from "../ui/DirectoryLayout";
import ViewCycleButton from "../ui/ViewCycleButton";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { useFinanceCollectionView } from "./FinanceCollectionControls";
import type { FinanceBudgetsViewModel } from "../../lib/modules/finance/budgets-view-model";
import type { FinanceFilter, FinanceSort } from "../../lib/native-objects/url-state";
import { IconTile, money } from "./FinancePrimitives";
import styles from "./FinanceCollections.module.css";

export type FinanceBudgetsViewProps = {
  model: FinanceBudgetsViewModel;
  months: string[];
  period: string;
  onPeriodChange: (month: string) => void;
  filter: FinanceFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: FinanceFilter) => void;
  onSortChange: (sort: FinanceSort) => void;
  onSelect: (id: string) => void;
  onOpenFilterPreview: () => void;
  onOpenPeriodPreview: () => void;
};

const PERCENT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

function percent(value: number | null): string {
  return value === null ? "Unavailable" : `${PERCENT.format(value)}%`;
}

export default function FinanceBudgetsView({
  model, months, period, onPeriodChange,
  filter,
  onQueryChange,
  onFilterChange,
  onSortChange,
  onSelect
}: FinanceBudgetsViewProps) {
  const [view, setView] = useFinanceCollectionView("budgets");
  return (
    <div className={styles.collection}>
      <div className={styles.budgetBar}>
        <div className={styles.metrics} aria-label="Budget totals">
          <article><span>Spent</span><strong>{money(model.totals.spent)}</strong></article>
          <article><span>Planned</span><strong>{money(model.totals.limit)}</strong></article>
          <article><span>Remaining</span><strong>{money(model.totals.remaining)}</strong></article>
        </div>
        <div className={styles.budgetControls}>
          <SelectField aria-label="Budget month" value={period} onChange={event=>onPeriodChange(event.target.value)}>
            {months.map(m=><option key={m} value={m}>{new Date(m+"-01T12:00:00Z").toLocaleDateString("en-US",{month:"short",year:"numeric",timeZone:"UTC"})}</option>)}
          </SelectField>
          <SelectField aria-label="Budget filter" value={filter} onChange={e=>onFilterChange(e.target.value as FinanceFilter)}>
            <option value="">All</option><option value="over-budget">Over budget</option>
          </SelectField>
          <SelectField className="toolbar-icon-select" aria-label="Sort budgets" title="Sort budgets" triggerContent={<UnigentamosIcon role="sort" size={19}/>} value={model.sort} onChange={e=>onSortChange(e.target.value as FinanceSort)}>
            <option value="attention">Highest utilization</option><option value="spent-desc">Spend high to low</option><option value="limit-desc">Cap high to low</option><option value="remaining-asc">Remaining low to high</option><option value="category-asc">Category A–Z</option>
          </SelectField>
          <ViewCycleButton label="budgets view" value={view} onChange={setView}/>
        </div>
      </div>
      <DirectoryLayout view={view} className={styles.budgetList} role="list" aria-label="Budget categories">
        {model.rows.map(({budget,remaining,usedPercent}) => <MorphingArticle key={budget.id} role="listitem" className={styles.card}>
          <button className={styles.budgetCard} type="button" data-finance-budget-id={budget.id} data-over={remaining<0} aria-controls="finance-inspector" onClick={()=>onSelect(budget.id)}>
            <span className={styles.budgetIdentity}><IconTile hue={budget.hue} icon={budget.icon}/><span><strong>{budget.category}</strong><small>{budget.entityScope==="business"?"Business":"Personal"}{budget.evidence && <span className={styles.pill}>{budget.evidence.automatic?"Auto-created":"From history"}</span>}</small></span></span>
            <span className={styles.budgetFigure}><strong>{money(budget.spent,{cents:true})}</strong><small>of {money(budget.limit,{cents:true})}</small></span>
            <span className={styles.budgetUsage}><progress value={Math.min(100,Math.max(0,usedPercent??(remaining<0?100:0)))} max={100} aria-label="Budget used"/><small>{usedPercent!==null && percent(usedPercent)+" · "}{money(Math.abs(remaining),{cents:true})} {remaining<0?"over budget":"left"}</small></span>
          </button>
        </MorphingArticle>)}
      </DirectoryLayout>
      {model.rows.length === 0 && (
        <SystemState
          variant="empty"
          title={model.sourceCount ? "No matching budgets" : "Make a plan for this month"}
          description={model.sourceCount ? "Try another category or return to All." : "Create a category budget to compare your spending with a monthly limit."}
          action={model.sourceCount ? { label: "Clear filters", onSelect: () => { onQueryChange(""); onFilterChange(""); } } : undefined}
        />
      )}

    </div>
  );
}
