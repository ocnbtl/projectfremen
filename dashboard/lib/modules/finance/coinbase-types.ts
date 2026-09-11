/** Public read model: never include keys, JWTs or provider payloads. */
export interface CoinbaseHolding {
  id: string;
  name: string;
  currency: string;
  quantity: string;
  valueUsd: number | null;
}
export interface CoinbaseActivity {
  id: string;
  accountId: string;
  type: string;
  status: string;
  occurredAt: string;
  quantity: string;
  currency: string;
  valueUsd: number | null;
}
export interface CoinbaseSnapshot {
  retrievedAt: string;
  totalUsd: number | null;
  holdings: CoinbaseHolding[];
  activity: CoinbaseActivity[];
}
export interface CoinbaseView {
  configured: boolean;
  connected: boolean;
  accountId?: string;
  snapshot?: CoinbaseSnapshot;
  error?: string;
}
