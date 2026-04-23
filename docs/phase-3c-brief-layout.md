# Phase 3c — Brief Surface Layout

## Context & Decision

The brief page (`/brief/[id]`) currently renders a single-column stack:
**header → blocks (above the fold) → chat transcript → PromptInput**.

The platform vision (captured in product discussions) is a **parallel-surface** model:
- **Chat** = persistent collaborator (Cursor-style) — always visible, never morphs into the document
- **Brief** = editable block document (Hex-cells-style) — agent writes directly into blocks
- **Doc** = live passport/evidence view (Perplexity-style) — read-only, auto-updating

This phase introduces a **layout toggle** on the brief page so we can test three layout variants
without committing to one permanently. Choosing the right geometry is a product decision, not an
engineering one — this phase gives us the scaffold to decide empirically.

---

## The Three Variants

### Variant A — "Side-by-Side" (two-column split)

```
┌────────────────────────────────┬─────────────────────┐
│                                │                     │
│        BRIEF DOCUMENT          │       CHAT          │
│       (65% / flex-1)           │     (35% / 420px)   │
│                                │                     │
│  ■ H1 Summary                  │  [PromptInput]      │
│  ■ Para…                       │                     │
│  ■ BulletList                  │  USER: draft…       │
│  ■ LandscapeEmbed              │  ATLAS: Added       │
│  ■ LivePassportView            │   "Summary" block   │
│                                │                     │
│  [+ Add block]                 │                     │
└────────────────────────────────┴─────────────────────┘
```

**When to use:** primary writing sessions — you want to see the document and chat simultaneously.
The agent writes into the left column; you read and edit it; chat stays available for meta-questions.

**Chat collapse:** chat column narrows to 52px (icon strip + mic button). Click the strip to expand.
This is the "Hex/Cursor" collapse — chat is never fully hidden.

**Responsive fallback:** < 1100px → single column (Variant B, stacked). Show a toast "Switch to desktop for side-by-side view."

---

### Variant B — "Focus Doc" (stacked, chat below)

```
┌────────────────────────────────────────────────────────┐
│                  BRIEF DOCUMENT                        │
│                  (full width)                          │
│  ■ H1 Summary                                          │
│  ■ Para…                                               │
│  ■ BulletList                                          │
│  ■ LandscapeEmbed                                      │
│  ■ LivePassportView                                    │
├────────────────────────────────────────────────────────┤
│  CHAT (collapsed by default — click chevron to expand) │
│  [PromptInput ─────────────────────────── gpt-4.1 🎤]  │
└────────────────────────────────────────────────────────┘
```

**When to use:** reading / reviewing a completed brief, or on smaller screens.
Chat is always reachable (PromptInput is always visible at the bottom), but the document
takes up the full viewport. Chat transcript slides up when you type.

**Chat expand:** clicking the chevron slides up a transcript panel (max 40vh) above the PromptInput.
The brief scrolls to accommodate.

**This is the current default layout** (roughly). Good for mobile, good for focus mode.

---

### Variant C — "Three-Panel Studio" (landscape + brief + chat)

```
┌────────────────┬─────────────────────┬──────────────┐
│                │                     │              │
│  LANDSCAPE     │   BRIEF DOCUMENT    │    CHAT      │
│   (ForceGraph  │   (35% / ~480px)    │  (25%/320px) │
│    Lens v2)    │                     │              │
│   (~40%)       │  ■ LandscapeEmbed   │  [Input]     │
│                │  ■ LivePassportView │              │
│                │  ■ H1 Summary       │  ATLAS:      │
│                │  ■ Para…            │  "Added…"    │
│                │                     │              │
└────────────────┴─────────────────────┴──────────────┘
```

**When to use:** the "full Atlas studio" experience — you're exploring the landscape, the agent
pins embed blocks into the brief, and you monitor the conversation on the right.
Matches the four-zone spec described in product discussions.

**Minimum screen:** 1440px. Below that, landscape panel hides and the layout degrades to Variant A.

**The landscape panel** renders `<ForceGraphLens variant="embed" />` (the same shared lens,
not a full page). It is purely read-only from the brief's perspective — the agent can call
`AppendLandscapeEmbed` to snapshot the current lens state into a block.

---

## Layout Toggle Implementation

### State

```typescript
type BriefLayout = "side-by-side" | "focus-doc" | "studio";
```

Persisted in `localStorage` under the key `atlas.briefLayout`. Falls back to `"side-by-side"` 
on first visit (unless viewport < 1100px, which falls back to `"focus-doc"`).

Also readable from URL param `?layout=side-by-side|focus-doc|studio` so share links can
specify a preferred layout (read-only for share scope — they always get `"focus-doc"`).

### Toggle UI

Three icon buttons in the brief header bar (right side, next to the Share button):

```
[≡] [⬛⬛] [⬛⬛⬛]
  B    A      C
```

Icons:
- **B (Focus Doc):** `AlignLeft` from lucide — single column
- **A (Side-by-Side):** `Columns2` — two columns
- **C (Studio):** `LayoutTemplate` — three panes

Active variant is highlighted. Studio button is dimmed (with tooltip "Requires 1440px+") on narrow viewports.

### Files to create / modify

| File | Change |
|------|--------|
| `src/hooks/use-brief-layout.ts` | `useState` + `localStorage` + URL-param hook |
| `src/app/(shared-brief)/brief/[id]/brief-layout.tsx` | Client wrapper component that renders the correct variant |
| `src/app/(shared-brief)/brief/[id]/brief-chat-shell.tsx` | Remove hardcoded single-column, accept `layout` prop |
| `src/app/(shared-brief)/brief/[id]/page.tsx` | Pass `layout` to shell |
| `src/components/landscape/force-graph-lens/index.tsx` | Add `variant="embed"` prop (compact mode, no header chrome) |
| `src/components/brief/layout-toggle.tsx` | The three-button toggle component |

### Estimated scope

- **A + B** (Side-by-Side + Focus Doc toggle): ~200 lines, 1–2 hours. No new dependencies.
- **Add C** (Studio with ForceGraphLens embed): +100 lines in the layout, +50 in the lens component. ~half a day. Requires Phase 3b to be merged (the lens component).

---

## Recommended Default

**Ship Variant A (Side-by-Side) as the default for owner scope on desktop.**

Rationale from the product discussion:
- The "chat is a collaborator, always visible" principle (Cursor/Hex model) is violated by the current stacked layout — you can't see blocks and chat at the same time.
- Variant A is the minimum geometry that honours the spec: brief on the left, chat on the right, both always in view.
- Variant B is the right fallback for mobile / focus mode and for share-scope (read-only visitors have no chat anyway).
- Variant C is the "wow" demo geometry for a 1440px+ screen — don't make it the default; make it easy to discover.

**Rollout order:**
1. Phase 3c-a: toggle UI + A/B only (no landscape panel). Ship this first — zero dependency on 3b, addressable in one PR.
2. Phase 3c-b: add C (Studio) once 3b is merged and the lens `variant="embed"` is in place.

---

## What is NOT in this phase

- Full Notion-style inline slash commands (Phase 4 enhancement)
- Perplexity-style "Doc tab" (live passport reading pane) — that is a separate brief panel spec
- Binary-star compare view in the landscape panel (Phase 3b follow-up)
- Mobile-specific brief layout (deferred; `"focus-doc"` covers 99% of mobile use)

---

## Acceptance Criteria

- [ ] Layout toggle renders three buttons in the brief header.
- [ ] Clicking A/B/C switches layout without losing chat history or block state.
- [ ] Choice persists in `localStorage` across page reloads.
- [ ] `?layout=` URL param overrides stored preference.
- [ ] Share scope always renders Variant B (no chat, no toggle visible).
- [ ] Variant C button shows a tooltip and is disabled/dimmed on viewports < 1440px.
- [ ] In Variant A, chat column collapses to 52px strip on click; expands on re-click.
- [ ] In Variant B, chat transcript slides up from PromptInput on first keystroke or explicit expand.
- [ ] `pnpm check-types`, `pnpm lint`, `pnpm test` all pass.
