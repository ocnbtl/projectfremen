/** Public banking DTOs. Provider credentials and sync cursors never belong here. */
export interface BankAccount {
  id: string;
  name: string;
  mask: string;
  kind: "Checking" | "Savings" | "Credit";
  balance: number | null;
  supported: boolean;
  currency: string;
}

export interface BankConnectionView {
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
