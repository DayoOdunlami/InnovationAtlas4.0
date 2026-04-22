# Phase 1 caching calibration

_Companion report to the Phase 1 Brief-First Rebuild — one of the nine
Phase 1 commits. Feeds recommendations into Phase 2a.0 rather than
gating Phase 1._

## Purpose

Phase 1 introduces four new hot read paths on the critical request
path for `/briefs` and `/brief/[id]`:

1. `pgBriefRepository.listBriefsForUser(userId, scope)` — fires on every
   `/briefs` load.
2. `pgBriefRepository.getBriefById(id, scope)` — fires on every
   `/brief/[id]` load.
3. `pgMessageRepository.listMessagesByBriefId(briefId, scope)` — fires
   on every `/brief/[id]` load once the brief has any history.
4. `pgBriefShareTokenRepository.findActiveByToken(token)` — fires on
   every share-scope `/brief/[id]` load.

Phase 1 ships with **no application-level caching** on these paths on
purpose. The goal of this calibration pass is to establish baseline
numbers so Phase 2a.0 can add caching where it actually helps, rather
than padding the whole repository layer with TTL-ed wrappers.

## Methodology

The probe script `scripts/caching-calibration/measure-brief-reads.ts`
creates a throwaway test user, one brief, N seeded messages, and one
active share token against whatever `POSTGRES_URL` points to. It then
calls each of the four methods twice back-to-back via
`performance.now()`. The first call is the "cold" baseline (Postgres
shared buffers not warm for this brief, drizzle connection pool not
primed for this session); the second is the "warm" call (everything
is hot).

Runs below are captured against the Supabase Postgres backing the
shared dev environment, pooled connection (`ssl: rejectUnauthorized:
false`), unloaded, over-the-internet round-trip from the Phase 1
sandbox (approx 70 ms base RTT). Numbers therefore include network
time — these are **user-visible latency ceilings**, not pure DB work.

To reproduce:

```bash
# default: 50 messages per brief
pnpm exec tsx scripts/caching-calibration/measure-brief-reads.ts

# sweep message count
CALIBRATION_MESSAGE_COUNT=500 pnpm exec tsx scripts/caching-calibration/measure-brief-reads.ts
```

## Observations

### At 50 messages per brief

| Probe                                    | Cold (ms) | Warm (ms) |
|------------------------------------------|-----------|-----------|
| `listBriefsForUser`                      |      76.7 |      72.9 |
| `getBriefById` (user scope)              |     144.8 |     145.0 |
| `listMessagesByBriefId` (n=50)           |     146.8 |     145.3 |
| `findActiveByToken`                      |      73.3 |      73.0 |

### At 500 messages per brief

| Probe                                    | Cold (ms) | Warm (ms) |
|------------------------------------------|-----------|-----------|
| `listBriefsForUser`                      |      73.6 |      72.2 |
| `getBriefById` (user scope)              |     144.4 |     143.9 |
| `listMessagesByBriefId` (n=500)          |     354.3 |     215.6 |
| `findActiveByToken`                      |      72.4 |      72.4 |

### Takeaways

1. **Single-round-trip reads are network-bound.** `listBriefsForUser`
   and `findActiveByToken` both settle at roughly the base RTT (~72
   ms). They are each a single SELECT over a well-indexed column (the
   partial indexes on `atlas_briefs_owner_updated_idx` and
   `atlas_brief_share_tokens_active_idx` respectively). The cold/warm
   delta is within noise — Postgres is not the bottleneck for these.

2. **`getBriefById` is two round-trips today.** It costs ~2× the base
   RTT because the repository first fetches `ownerId` for the row to
   run the permit check, then fetches the row again. That is a
   deliberate shape for clarity in Phase 1 but is a cheap
   optimisation target for Phase 2a.0: combine into one SELECT and
   short-circuit on the check. Expected saving: ~70 ms per brief
   view.

3. **`listMessagesByBriefId` scales with message count.** At 50
   messages we pay ~145 ms (one RTT + light row payload). At 500
   messages we pay 216–354 ms: the extra ~80–280 ms is JSON parsing
   and `libpq` transfer, not Postgres planner time. Cold-vs-warm
   matters here (354 vs 216 ms) — the first 500-row pull seems to
   trigger some connection-pool warmup that the warm pull avoids.

4. **The existing `MemoryCache` / Redis adapter in `src/lib/cache/`
   is _not_ wired to any of the Phase 1 hot paths.** Good: it means
   Phase 2a.0 owns the decision about where to add caching.

## Recommendations for Phase 2a.0

Order by expected win per hour of engineering:

1. **Drop the second round-trip inside `getBriefById`** by selecting
   the full row and doing the permit check in application code.
   Saves ~70 ms on every `/brief/[id]` page load. Risk: low — one
   repository method, covered by permit/deny tests.

2. **Cache `findActiveByToken` behind a short-TTL `serverCache`
   entry** keyed by `atlas.share-token:<token>`. Share tokens are
   read on every share-scope load, change only on mint / revoke (both
   of which are already server actions and can invalidate the entry
   explicitly), and the `~72 ms` is pure RTT that a same-region cache
   would collapse to <5 ms. TTL 60 s with explicit invalidation on
   mint/revoke.

3. **Do NOT pre-emptively cache `listBriefsForUser` or
   `listMessagesByBriefId`.** The former is already fast and the
   staleness window would complicate the Phase 2a.0 block-edit flow;
   the latter grows with history size and caching it would double
   the memory footprint per brief for a marginal win. Revisit once
   Phase 2a.0 lands block renderers and we can measure the new
   `content_json`-heavy pages.

4. **Measure again with the full block-heavy `/brief/[id]` RSC
   payload** at the end of Phase 2a.0. If block rendering adds >200
   ms of additional server-side fetch fan-out, layer an
   `unstable_cache` wrapper per-brief (TTL tied to `updated_at`) on
   the outermost RSC fetcher rather than on repositories.

## Script reference

- `scripts/caching-calibration/measure-brief-reads.ts` — the probe
  used above. Reads `POSTGRES_URL` and `CALIBRATION_MESSAGE_COUNT`.
  Creates + cleans up its own data; safe to run repeatedly against a
  shared dev DB.
