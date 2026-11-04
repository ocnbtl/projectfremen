"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { FinanceAccountRowViewModel } from "../../lib/modules/finance/accounts-view-model";
import type { FinanceAccountRecord } from "../../lib/modules/finance/native-types";
import { accountBalanceSource, accountDate } from "../../lib/modules/finance/account-details";
import UnigentamosIcon from "../icons/UnigentamosIcon";
import { MorphingArticle, MorphingButton, MorphingDiv, MorphingSpan } from "../ui/DirectoryLayout";
import FinanceMerchantAvatar from "./FinanceMerchants";
import { Icon, accountIcon, money } from "./FinancePrimitives";
import styles from "./FinanceCollections.module.css";
import accountStyles from "./FinanceAccounts.module.css";

interface AccountCardProps {
  row: FinanceAccountRowViewModel;
  record?: FinanceAccountRecord;
  selected: boolean;
  onSelect: (id: string) => void;
}

export default function FinanceAccountCard({row, record, selected, onSelect}: AccountCardProps) {
  const {account, activity} = row;
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const review = activity.transactions.filter(entry => !entry.ufInit || entry.status === "pending").length;
  const retrieved = record?.balanceSource === "plaid" || record?.balanceSource === "coinbase"
    ? record.balanceRetrievedAt : undefined;
  const balanceDate = retrieved || record?.balanceAsOf;
  const source = accountBalanceSource(record);
  const dateLabel = (retrieved ? "Last retrieved" : "Balance dated") + " · " + accountDate(balanceDate, true);
  const latest = useMemo(() => activity.transactions.reduce<typeof activity.transactions[number] | undefined>(
    (last, entry) => !last || (entry.occurredOn ?? "") > (last.occurredOn ?? "") ? entry : last, undefined,
  ), [activity.transactions]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function schedule(next: boolean, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  }
  function close() {
    clearTimeout(timer.current);
    setOpen(false);
  }

  return <Popover.Root open={open} onOpenChange={next => {if (!next) close();}}>
    <MorphingArticle className={styles.card} data-selected={selected || undefined} role="listitem">
      <Popover.Anchor asChild>
        <MorphingButton ref={button} className={styles.open} type="button" data-finance-account-id={account.id}
          aria-pressed={selected} aria-controls="finance-inspector" aria-describedby={open ? previewId : undefined}
          onPointerEnter={event => {if (event.pointerType === "mouse") schedule(true, 240);}}
          onPointerLeave={() => {if (!button.current?.matches(":focus-visible")) schedule(false, 130);}}
          onFocus={event => {if (event.currentTarget.matches(":focus-visible")) schedule(true, 0);}}
          onBlur={close} onClick={() => {close(); onSelect(account.id);}}>
          <MorphingDiv className={styles.top}>
            <span className={styles.symbol}><Icon name={accountIcon(account.kind)}/></span>
            <span className={styles.identity}><strong>{account.name}</strong><small>{account.inst}{account.mask !== "—" && " · ••" + account.mask.replace(/^[•*]+/, "")}</small></span>
            <span className={styles.amount}><strong>{money(account.balance, {cents:true})}</strong>{account.balance < 0 && <small>Balance owed</small>}</span>
          </MorphingDiv>
          <MorphingDiv className={styles.footer}>
            <span className={styles.pill}>{account.kind}</span>
            <span aria-label={dateLabel} title={source + " · " + dateLabel}><UnigentamosIcon role="routine" candidate="refresh" size={14}/>{accountDate(balanceDate)}</span>
          </MorphingDiv>
          <MorphingDiv className={styles.footer}>
            <span>{activity.transactions.length} {activity.transactions.length === 1 ? "transaction" : "transactions"}</span>
            {review > 0 && <MorphingSpan className={styles.pill} data-tone="attention">{review} to review</MorphingSpan>}
          </MorphingDiv>
        </MorphingButton>
      </Popover.Anchor>
    </MorphingArticle>
    <Popover.Portal><Popover.Content id={previewId} role="tooltip" tabIndex={undefined}
      className={accountStyles.preview} side="bottom" align="start" sideOffset={5} collisionPadding={12}
      onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
      onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={() => {if (!button.current?.matches(":focus-visible")) schedule(false, 130);}}>
      <strong>{account.name}</strong>
      <dl><div><dt>Balance source</dt><dd>{source}</dd></div>
        <div><dt>Income</dt><dd>{money(activity.totals.income,{cents:true})}</dd></div>
        <div><dt>Spending</dt><dd>{money(activity.totals.spending,{cents:true})}</dd></div>
      </dl>
      {latest ? <div className={accountStyles.latest}>
        <FinanceMerchantAvatar kind="transaction" id={latest.id} label={latest.merchant}/>
        <span><small>Latest transaction · {latest.date}</small><strong>{latest.merchant}</strong></span>
        <b>{money(latest.amount,{sign:true,cents:true})}</b>
      </div> : <p>Activity will appear here when you add your first transaction.</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
