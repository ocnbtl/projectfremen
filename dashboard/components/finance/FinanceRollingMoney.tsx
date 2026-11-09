"use client";

import { money } from "./FinancePrimitives";
import styles from "./FinanceChart.module.css";

/** Stable place-value columns retarget their CSS transition during fast hovering. */
export default function FinanceRollingMoney({ value }: { value: number }) {
  const formatted = money(value, { cents: true });
  return <span className={styles.rollingMoney} aria-label={formatted} data-amount={value}>
    <span aria-hidden="true">{Array.from(formatted).map((character, index) => /\d/.test(character)
      ? <span className={styles.digitWindow} key={`digit-${formatted.length - index}`}><span className={styles.digitStrip} style={{ transform: `translateY(-${Number(character) * 10}%)` }}>{Array.from({ length: 10 }, (_, digit) => <span key={digit}>{digit}</span>)}</span></span>
      : <span key={`symbol-${formatted.length - index}`}>{character}</span>)}</span>
  </span>;
}
