/** Public banking DTOs. Provider credentials and sync cursors never belong here. */
export type BankingProduct = "transactions" | "investments";

export interface InvestmentHolding {
  accountId: string;
  securityId: string;
  name: string;
  ticker: string | null;
  quantity: number;
  value: number;
  price: number | null;
  priceAsOf: string | null;
  costBasis: number | null;
}

export interface InvestmentActivity {
  id: string;
  accountId: string;
  name: string;
  ticker: string | null;
  date: string;
  type: string;
  subtype: string;
  amount: number;
  quantity: number;
  cancelTransactionId: string | null;
}

export interface InvestmentSnapshot {
  holdings: InvestmentHolding[];
  activity: InvestmentActivity[];
  retrievedAt: string;
  activityReady: boolean;
  activityFrom: string;
  activityThrough: string;
  activityRetrievedAt?: string;
}

export interface BankAccount {
  id: string;
  name: string;
  mask: string;
  kind: "Checking" | "Savings" | "Credit" | "Brokerage";
  balance: number | null;
  supported: boolean;
  currency: string;
}

export interface BankConnectionView {
  product?: BankingProduct;
  investments?: InvestmentSnapshot;
  id: string;
  name: string;
  status: "mapping" | "connected" | "reconnect" | "disconnected";
  accounts: BankAccount[];
  mappings: Record<string, string>;
  lastSyncedAt?: string;
  error?: string;
  initialComplete?: boolean;
}

export interface BankingView {
  configured: boolean;
  environment: "sandbox" | "production";
  origin?: string;
  connectionsUsed: number;
  connections: BankConnectionView[];
}

export interface BankTransaction {
  id: string;
  pendingId?: string;
  accountId: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  direction: "income" | "expense" | "transfer";
  pending: boolean;
}

export interface BankReview {
  id: string;
  connectionId: string;
  transaction: BankTransaction;
  accountId: string;
  candidates: string[];
  resolved?: "imported" | "matched" | "ignored" | "removed";
}
