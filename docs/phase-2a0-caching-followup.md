# Phase 2a.0 caching follow-up (Rec 4)

_Companion report to the Phase 2a.0 Block Foundation commit._

## Purpose

Phase 1 closed with three caching recommendations (see
`docs/phase-1-caching-calibration.md`):

1. **Rec 1** — collapse `pgBriefRepository.getBriefById` into one
   round-trip.
2. **Rec 2** — cache `pgBriefShareTokenRepository.findActiveByToken`
   behind a 60-second `serverCache` entry, invalidated from mint and
   revoke.
3. **Rec 4** — remeasure the whole `/brief/[id]` fetch fan-out under
   a realistic block payload once the block renderer tree ships, and
   decide whether an `unstable_cache` RSC wrapper is warranted.

Rec 1 and Rec 2 landed in this phase (see
`src/lib/db/pg/repositories/brief-repository.pg.ts` and
`brief-share-token-repository.pg.ts`). This document captures the
Rec 4 remeasurement.

## Methodology

The probe at `scripts/caching-calibration/measure-brief-reads.ts` was
extended to accept `CALIBRATION_BLOCK_COUNT` and to include two new
probes:

- `block-repository.listByBrief (n=N)` — the new block list fetch.
- `/brief fetch fan-out (brief + messages + blocks)` — a
  `Promise.all` over the three repository calls the
  `(shared-brief)/brief/[id]/page.tsx` server component now performs
  per request.

Runs below are against the same Supabase Postgres used in the Phase
1 report — ~72 ms base round-trip — with 50 atlas.messages per
brief and the block count swept from {0, 5, 20, 50}.

## Observations

### N = 0 blocks

| Probe                                            | Cold (ms) | Warm (ms) |
|--------------------------------------------------|-----------|-----------|
| `listBriefsForUser`                              |      77.5 |      71.9 |
| `getBriefById` (user scope)                      |      71.9 |      71.7 |
| `listMessagesByBriefId` (n=50)                   |     147.0 |     144.8 |
| `findActiveByToken`                              |      72.3 |       0.1 |
| `block-repository.listByBrief` (n=0)             |     151.1 |     143.2 |
| `/brief` fetch fan-out (brief + messages + blocks) | 602.4   |     152.4 |

### N = 5 blocks

| Probe                                            | Cold (ms) | Warm (ms) |
|--------------------------------------------------|-----------|-----------|
| `getBriefById` (user scope)                      |      73.4 |      73.2 |
| `listMessagesByBriefId` (n=50)                   |     146.3 |     146.4 |
| `findActiveByToken`                              |      73.8 |       0.1 |
| `block-repository.listByBrief` (n=5)             |     149.0 |     146.1 |
| `/brief` fetch fan-out                           |     587.7 |     144.9 |

### N = 20 blocks

| Probe                                            | Cold (ms) | Warm (ms) |
|--------------------------------------------------|-----------|-----------|
| `getBriefById` (user scope)                      |      73.1 |      72.8 |
| `listMessagesByBriefId` (n=50)                   |     146.7 |     147.3 |
| `findActiveByToken`                              |      73.7 |       0.1 |
| `block-repository.listByBrief` (n=20)            |     146.9 |     146.5 |
| `/brief` fetch fan-out                           |     597.3 |     146.2 |

### N = 50 blocks

| Probe                                            | Cold (ms) | Warm (ms) |
|--------------------------------------------------|-----------|-----------|
| `getBriefById` (user scope)                      |      72.2 |      72.1 |
| `listMessagesByBriefId` (n=50)                   |     146.3 |     144.1 |
| `findActiveByToken`                              |      72.2 |       0.1 |
| `block-repository.listByBrief` (n=50)            |     144.3 |     144.6 |
| `/brief` fetch fan-out                           |     660.9 |     146.3 |

## Wins confirmed

- **Rec 1:** `getBriefById` drops from **~145 ms → ~72 ms** warm, one
  RTT rather than two. Target was ≤80 ms; solidly met at every block
  count.
- **Rec 2:** `findActiveByToken` second-hit collapses from **~72 ms →
  ~0.1 ms**. Target was <10 ms; memory cache is effectively free once
  warm. Mint/revoke explicitly invalidate the entry via
  `serverCache.delete(shareTokenCacheKey(...))`.
- **Rec 3 respected:** no new `serverCache` wrappers on the list
  paths. `grep 'serverCache' src/lib/db/pg/repositories/` returns
  exactly one file (the share-token repo). The brief, message, and
  block list methods remain cache-free.

## Block payload

`listByBrief` costs a flat **~145 ms** at N = {0, 5, 20, 50}. That
matches the base RTT + a tiny amount of row payload — the
`(brief_id, position COLLATE "C")` index serves the ordered list from
Postgres without a sort step, and the payload per block is small
(~200 bytes of content JSON in the probe mix). **It does not scale
with block count in this band**, which is consistent with a single
indexed scan + serialise.

Equally important: the **warm `/brief` fan-out stays at ~145 ms**
even at N = 50 blocks, because the three repository calls run in
parallel via `Promise.all` and are each bounded by the same
~145 ms ceiling. The cold fan-out inflates (~600 ms) because the
first request primes the connection pool. Warm is the right number
to judge against the 800 ms "time to first block rendered" budget
(#8 §2).

## Decision: do NOT add an `unstable_cache` RSC wrapper in 2a.0

Rec 4 asked whether we need a per-brief RSC cache with TTL tied to
`updated_at`. Looking at the numbers, the answer is **no, not in
2a.0**:

- Warm fan-out is ~145 ms, well under the 800 ms budget.
- Block writes in 2a.1 will invalidate `updated_at` on every edit; a
  Next `unstable_cache` wrapper would need careful revalidation to
  avoid showing stale content during editing. Spending that
  complexity for a ~150 ms win we do not need is a bad trade.
- Supabase regional latency (the ~72 ms RTT baseline) will fall
  substantially if the app is deployed in the same region; the
  warm-path headroom is larger in prod than here.

The 2a.1 team should **re-measure after wiring block edits** — if
edits cause the block list to stall on cold-path reads (different
worker, different pool), revisit with an `unstable_cache` wrapper on
the outermost server fetcher tagged by `brief:<id>` and invalidated
in the block write action.

## Escalation thresholds (carried from the 2a.0 brief)

- **Soft miss**: if the warm `/brief` fan-out crosses **800 ms** at
  N=20 under realistic conditions after Rec 1 + Rec 2, pause and
  flag — cache-layering may hide a deeper query-plan regression.
- **Hard miss**: if *time to first block rendered* exceeds **1200 ms
  at N=20**, escalate immediately (§9 of the brief).

## Reproducing

```bash
POSTGRES_URL=... \
  CALIBRATION_MESSAGE_COUNT=50 \
  CALIBRATION_BLOCK_COUNT=20 \
  pnpm exec tsx scripts/caching-calibration/measure-brief-reads.ts
```
