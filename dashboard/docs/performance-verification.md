# Verification without unnecessary hosted CPU

Run full responsive, interaction and data-preservation checks on a local production build with synthetic storage. Clear remote database and email credentials in test-server environments. Never point a broad browser matrix or performance benchmark at production or a hosted preview.

For release verification, inspect the deployment status and use a small, targeted read-only smoke check. Reuse one browser context if browser inspection is necessary. Prefer a few API requests for backend-only changes; do not reload every module or run the same viewport/view matrix again live. Do not submit real forms or change production records as test cleanup.

For photo/preloading changes, run `node scripts/photo-access-harness.cjs`, `node scripts/cpu-efficiency-browser-harness.cjs` after building, and the existing profile-photo tests. The focused browser harness checks authentication, conditional image responses, crop/source preservation, deletion, lazy loading, and actual navigation without eager module requests. It uses an isolated temporary store and blocks off-origin browser traffic.

A private image may be retained by the browser only with mandatory server revalidation. Check the session and current profile before returning either bytes or 304. Keep edit/source responses and errors no-store. Do not introduce public caching of personal photos, stale authorization caches, or production-data migrations to optimize image delivery.

The current narrow identity reader still reads the stored JSON collection. It avoids directory normalization and linked-place reads; a future storage redesign needs separate measurement and migration review. Request reductions and local microbenchmarks are not proof of a particular reduction in Vercel CPU billing.
