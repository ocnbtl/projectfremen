import styles from "./FinanceDirectionDot.module.css";
import type { FinanceTransactionDirection } from "../../lib/modules/finance/types";

export default function FinanceDirectionDot({ direction }: { direction: FinanceTransactionDirection }) {
  const label = { income: "Income", expense: "Spending", transfer: "Transfer", savings: "Savings" }[direction];
  return <span className={styles.dot} data-direction={direction} role="img" aria-label={label} title={label}/>;
}
