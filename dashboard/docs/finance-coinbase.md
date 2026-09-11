# Personal Coinbase connection

Open Finance → Accounts → Connections (or Finance Settings) → Coinbase. Create a Coinbase App Secret API key with **View only** and **ECDSA / ES256**. Trade, Transfer and Receive must be disabled. Select the personal portfolio you intend to view, paste the complete key name and private key in the protected form, and match an existing personal Brokerage account or create a Coinbase record. An empty portfolio response is treated as missing access, not a zero balance.

The server verifies key permissions before every connection and sync. All Coinbase transport calls are GET requests to a fixed endpoint allowlist on api.coinbase.com. The key cannot be used by this connector to trade, send funds, create addresses or call arbitrary endpoints. The owner can use Sync Coinbase for a fresh snapshot, with a one-minute cooldown. No background refresh, OAuth partner registration, paid aggregator, Plaid Item or trading feature is involved.

## Storage and ownership

The existing FINANCE_BANKING_KEY, FINANCE_BANKING_ORIGIN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are sufficient; no Coinbase credential is needed in Vercel. Do not rotate the existing encryption key. Production fails closed without a valid 32-byte key, HTTPS origin and durable storage. Isolated local testing additionally requires FINANCE_COINBASE_TEST_MODE=true, FREMEN_DATA_DIR and VERCEL not equal to 1.

Credentials, holdings and activity are stored in finance-coinbase-personal.json through the existing private CAS app_state store, encrypted with AES-256-GCM. A Coinbase-specific HKDF key and origin-bound authenticated data separate it from Plaid storage. Private credentials and JWTs never enter Finance records, audit events, public DTOs, browser persistence or provider error messages. The setup form clears submitted values. Encrypted backups remain subject to the existing storage retention policy.

One aggregate Brokerage account owns the estimated USD portfolio value. Sync preserves its name, institution and user metadata, records an audit event, and protects linked balance/type/scope fields from manual changes. Reconnecting should match the existing account. Native matching is idempotent if an update is interrupted before encrypted snapshot persistence. A durable operation lease serializes connect, sync and disconnect; network calls stay outside CAS callbacks. Disconnect removes the application's saved key and native link while preserving the dated balance and last snapshot. Revoking the API key itself is a separate action in Coinbase.

## Data meaning and limits

This is an owner-only Coinbase App connector, not a public multi-user integration. It shows wallets accessible to the selected key; restricted portfolios may not represent the user's entire Coinbase holdings. Account pagination is completed before publishing a snapshot (up to 500 wallets / 100 funded wallets). Quantity strings preserve crypto precision. Public USD spot quotes produce estimates, including a market quote for stablecoins; no stablecoin is assumed to equal one dollar. If any holding cannot be priced, the aggregate is unavailable and an existing Finance account retains its prior dated balance. Creating a new Finance account requires a complete USD estimate. A failed account/activity request preserves the last successful snapshot.

Recent activity contains up to 100 newest entries for each funded wallet and USD wallet, newest 500 overall. Historical wallets with zero balance are excluded. This is a bounded portfolio activity view, not complete accounting, cost-basis, tax or realized-profit history. Buys, sells and transfers are not automatically imported into spending/income totals. Existing bank/CSV entries remain unchanged. The retrieved time is a snapshot timestamp, not a guarantee of live prices or complete Coinbase coverage.

## Validation and primary sources

Run npm run test:finance-coinbase, test:finance-banking, typecheck, build and regress. The Coinbase harness uses generated test keys and intercepts every provider call. Live checks verify the authenticated setup and denied API paths; real account compatibility is only verified after the owner submits their key and reviews the result.

- [Coinbase App key setup](https://docs.cdp.coinbase.com/coinbase-app/authentication-authorization/api-key-authentication)
- [Permissions](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/data-api/get-api-key-permissions)
- [Accounts](https://docs.cdp.coinbase.com/coinbase-app/track-apis/accounts)
- [Transactions](https://docs.cdp.coinbase.com/coinbase-app/track-apis/transactions)
- [Prices](https://docs.cdp.coinbase.com/coinbase-app/track-apis/prices)

Plaid's public coverage explorer listed PayPal Balance and Transactions on September 11, 2026 (table updated August 12). The bank connection now includes the paypal depository subtype; account eligibility remains institution-specific and only USD imports are accepted. Vanguard Investments remains unimplemented. Plaid's current Trial includes Investments and Investments Refresh under its shared lifetime ten-Item cap, with no paid upgrade needed within that limit.
