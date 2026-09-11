# Personal banking with Plaid Trial

This integration serves the existing authenticated owner of the private Finance workspace. It supports USD depository and credit-card accounts through Transactions. It does not create a public banking service, enable payments, or request investment access. Brokerage holdings and crypto need a separate integration pass.

## Server configuration

Configure these as server environment variables in the production Vercel project. Never use NEXT_PUBLIC names or paste values into source, chat, issues, screenshots or logs.

| Variable | Value |
| --- | --- |
| PLAID_ENV | production |
| PLAID_PLAN | trial |
| PLAID_CLIENT_ID | The approved Trial team's client ID |
| PLAID_SECRET | That team's Production secret, entered directly into the hosting provider's secret field |
| FINANCE_BANKING_KEY | A cryptographically random 32-byte key encoded as base64; retain securely for recovery |
| FINANCE_BANKING_ORIGIN | https://unigentamos.com |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | Existing durable server store configuration |

Register `https://unigentamos.com/admin/finance/accounts` as a redirect URI in the Plaid dashboard. Link creation supplies `https://unigentamos.com/api/finance/banking/webhook` as the webhook URL. Use the same production origin for the browser session and callback.

The feature fails closed until all configuration is present. Production cannot fall back to local or ephemeral token storage. No paid-plan upgrade is automated. The app conservatively caps new exchange attempts at ten; removed Items keep their lifetime count. Ambiguous exchanges block creation of another new Item until investigated in Plaid. Do not reset this counter to recover a slot.

For local tests, use PLAID_ENV=sandbox with an explicit FREMEN_DATA_DIR outside the repository. `npm run test:finance-banking` supplies isolated fixtures and a fake provider without any real API calls.

## Connecting

1. Open Finance → Accounts → Connections, then Bank connections, or open Finance settings.
2. Connect an institution and complete its authentication and consent inside Plaid Link.
3. Match each returned account to an existing personal account of the same type, create a new account, or skip it. Save matches to enable balance and transaction imports. One bank login can contain several accounts.
4. Review possible duplicate entries in the connection panel before including them in totals. Matched manual entries retain their notes and category. Review normal bank entries in Transactions.

The app retrieves up to 90 days of available initial history. Plaid's signed transaction webhooks drive subsequent imports; Sync now retrieves available updates with a one-minute cooldown. This does not guarantee real-time bank data and does not invoke the optional Transactions Refresh endpoint. Initial empty responses are valid while history is being prepared. Balance timestamps describe retrieval, not an independently verified bank valuation time.

## Persistence and failure behavior

The existing CAS-backed app_state store holds an AES-256-GCM-encrypted document at `finance-banking-production.json`. The random nonce and authenticated environment/schema binding protect the entire document, including access tokens, cursors and Link sessions. Finance accounts and transactions remain in their existing owner store. API responses contain explicit public DTO fields and never access tokens, private cursors or provider errors. All banking APIs require an admin session and CSRF for browser mutations; webhooks instead require an ES256 signature, fresh timestamp and exact raw-body digest.

Each connection has a durable lease. Provider calls run outside compare-and-set callbacks. A full pagination batch is validated before ledger writes; cursor advancement follows successful Finance persistence. A crash replays stable provider IDs. Pending entries retain their native identity when posted, removed entries are archived, and edits to notes/categories are preserved. Bank-origin dates, amounts, statuses and connected balances cannot be overwritten by ordinary edits.

Unrecognized currencies, invalid dates, zero/invalid amounts, or updates beyond 5,000 entries pause sync without advancing its cursor. The panel shows the error. Do not dismiss this by deleting the connection; inspect and extend the importer under controlled tests. Account matching is fixed for a connection after confirmation. Adding more accounts later and public multi-user ownership require a follow-up implementation.

Disconnect invokes Plaid item/remove, then erases active credentials and releases account links while preserving Finance history. Retries handle already-removed Items and already-disconnected native cleanup. If a crash occurs immediately after a public-token exchange but before encrypted persistence, do not create another Item: reconcile the ambiguous session using the Plaid dashboard first. Revocation cannot erase historical encrypted backups; manage retention through the existing storage provider.

The encryption key is part of recovery: replacing it without re-encrypting the store locks existing connections. Routine key rotation requires a deliberate migration with the prior key available. The app never silently resets a store that cannot be decrypted.

## Validation

Run `npm run test:finance-banking`, `npm run test:finance-redesign`, `npm run typecheck`, `npm run build`, and the repository regression harness before release. Live verification should check authenticated/no-store boundaries and the owner setup screen without creating Trial Items. A real institution connection is only verified after the owner completes Plaid consent and checks the resulting accounts and transactions.

Primary protocol references: [Link](https://plaid.com/docs/api/link/), [Transactions Sync](https://plaid.com/docs/api/products/transactions/), [OAuth](https://plaid.com/docs/link/oauth/), [update mode](https://plaid.com/docs/link/update-mode/), [webhook verification](https://plaid.com/docs/api/webhooks/webhook-verification/), [Trial billing](https://plaid.com/docs/account/billing/).
