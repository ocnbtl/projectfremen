# Venue conflict ranking check — 2026-11-04 (America/New_York)

The [American Sign Museum's own visit page](https://www.americansignmuseum.org/visit/)
publishes **1330 Monmouth Avenue, Cincinnati, OH 45225**. Its directions also
name Monmouth Avenue. The captured search returned three same-name, same-city,
numbered candidates with equal relevance. Their order consequently followed
the provider/input order: OSM's Monmouth Street, Overture's Essex Place, then
Overture's Monmouth Avenue.

The immutable Overture tile data already contains a confidence estimate:

| Candidate | Provider confidence | Status | Result before / after |
| --- | --- | --- | --- |
| 1330 Monmouth Ave | 0.947545 | open | 3 / 1 |
| 2515 Essex Pl | 0.587643 | open | 2 / 2 |
| 1330 Monmouth Street (OSM) | unavailable | unavailable | 1 / 3 |

Both Overture records have Meta source records dated 2026-10-12 and confidence
calculations dated 2026-10-15. These dates describe the directory/source update,
not an operator verification of the address. Neither reported operating status
nor update date distinguishes these two records. Their upstream provenance is
the same provider family; they must not be counted as independent agreement.

The general change retains Overture's bounded numeric confidence on suggestions
and uses it only after equal relevance for an exact-name numbered venue.
Missing confidence is a neutral sorting value of 0.5, not an estimated probability
for the missing source. Explicit name, street and locality relevance wins first.
The [documented meaning](https://docs.overturemaps.org/schema/reference/places/place/)
is confidence that a place exists, **not** verified street correctness. All three
museum candidates and their source links remain available. No operator-specific
address override, new network lookup, automatic selection or saved-data change
was added.

## Independent new cases

These four cases and their expected operator addresses were frozen in
`scripts/place-venue-conflict-holdout.json` before sampling or changing ranking.
They are a small local holdout, not a representative worldwide accuracy estimate.

| Venue and official source | Expected address | Before / after |
| --- | --- | --- |
| [Northside Yacht Club](https://northsideyachtclub.com/) | 4231 Spring Grove Avenue, Cincinnati | 1 / 1 |
| [Southgate House Revival](https://www.southgatehouse.com/contact/) | 111 E. 6th St., Newport | 1 / 1 |
| [Iris Book Cafe](https://irisbookcafe.wordpress.com/about/) | 1331 Main Street, Cincinnati | 1 / 1 |
| [Lucky Cat Museum](https://ruby-wombat-8556.squarespace.com/) | 2511 Essex Place #150, Cincinnati | not fully matched / not fully matched |

Lucky Cat's first suggestion has the right building street and city, but omits
suite #150 and adds “by Appointment” to its name. The frozen strict scoring
continues to fail that case; its expected name/address were not relaxed after
inspection. Iris's operator source is an older published page; that is a limit
of the independent evidence, not a freshness claim.

The bounded new sample made 4 Photon requests and 7 archive requests with a
337,976-byte range budget, reusing the existing archive cache otherwise. No
production app requests or user data were involved. Subsequent evaluation was
offline, with zero provider requests:

- Original 8 venues: 8/8 operator street matches first, unchanged.
- Previous 4-venue holdout: 4/4 first, improved from 3/4.
- New 4-venue holdout: 3/4 strict complete operator-address matches first,
  unchanged; the suite omission remains visible.

The benchmark's historical `baseline` column still refers to the older
`7c0420c14f376d024025e86d32da31d374888b70` implementation. The before/after
comparison above refers to the immediate `b5fba5eef8b4fc32c3346be1bd8f640fc5d6286c`
implementation versus this confidence tie-breaker. The new pre-change result
is retained locally at `output/place-venue-benchmark/conflict-holdout-before-results.json`.

Deterministic search and orchestration harnesses passed, including explicit
street/locality/name precedence, invalid confidence, conflicting branch
preservation, no search writes, no automatic verification from confidence, and
saved-place reuse. The orchestration harness used an isolated workspace output
directory after the OS temporary directory denied a rename.
