# Changelog

## 1.0.0 (2026-04-29)


### Features

* add deterministic passport smoke tests and admin testing page ([0c3f2b7](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/0c3f2b712e6723fd6145f1b4dbc1d8ea41f5c196))
* add dev quick-login buttons (Admin/Guest bypass) to sign-in page ([1ef899b](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/1ef899b98111039f6ab2451dfd31b6cf966d6ff3))
* add four passport pipeline artefacts (Step 9) ([ad9fe90](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/ad9fe90c70e5925ed09af9153aa5ae6bf6a1c467))
* add live /api/chat smoke with mocked streamText ([243eb67](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/243eb67e328a41abb211d5a78175c7f9f6b6d5f3))
* add supabase-atlas MCP server config (Sprint 2 Step 3) ([e677d84](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/e677d84f0cc953f9d0d442ec053f22d19fd6f0fd))
* **atlas:** AccessScope type + brief-repository with permit/deny tests ([a6fb9b3](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/a6fb9b36513ce95f7cdc854b4c77a1d05f290021))
* **atlas:** add atlas schema + briefs/messages/share-token/telemetry tables ([a20ab58](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/a20ab58ee1c2ecd247710da03ea4c8691f95f035))
* **atlas:** message-repository + telemetry-repository with permit/deny tests ([885fd40](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/885fd404c18cb705df9afd1946bf1301139d71c9))
* **blocks:** BlockRepository with AccessScope CRUD + permit/deny tests ([5543332](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/55433322e86c11f296efdaadee80f78fea5b5a14))
* **blocks:** Phase 2a.1 inline editing ([#7](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/7)) ([277d032](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/277d032f9a639bbb90fdf63dd07b3964d5a2515d))
* **blocks:** Phase 3a — live-passport-view block ([#11](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/11)) ([cfeda1b](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/cfeda1b2ddea4ba928e2255d1543d6f2dcb02165))
* **blocks:** read-only heading + paragraph RSC renderers with silent placeholder ([2951ff1](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/2951ff169464a13849aa516659954fe9443fb006))
* **brief-page:** render block list on /brief/[id] owner + share + e2e specs ([b7a3fce](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/b7a3fce37a3ce2eda5862f6ad880cd5600f177c8))
* **brief:** /brief/[id] shell + ChatBot mount + messages persist to atlas.messages ([52178d5](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/52178d515bb85ac4280db0f4b34b617e5994a2a1))
* **brief:** /briefs list route + server actions (create/rename/delete) ([135df2e](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/135df2ec54efa757b34b1491a547270c1285016b))
* **brief:** Phase 2b — wire block tools to chat (owner scope) ([#9](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/9)) ([a13d1a9](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/a13d1a94d8a2640aef9b01dcd223d7ec017ec712))
* **brief:** Phase 3c-a — layout toggle (Focus / Side-by-Side) ([27a8acb](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/27a8acb163f24114427ac12a462a7a0ac6775afa))
* **brief:** sidebar entry, block-authoring prompt, KB tool, PromptInput reuse ([#13](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/13)) ([3414963](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/341496373995fc3bdadb00054a236b1bdfe75488))
* **canvas:** add /canvas page shell with three-column workbench ([6cea9f5](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/6cea9f510d346b543b0a633495743402a9097580))
* **canvas:** add getCanvasState read tool + client tool dispatcher ([0515d8f](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/0515d8fcc3f33bbfe7d65529aafc63aabb9c2782))
* **canvas:** add six canvas write tools (focus/highlight/colorBy/filter/reset) ([a5e52ab](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/a5e52ab8c287989fcc79ea067281dc81c8b224dc))
* **canvas:** stage-mount commit 1 — mount full-size charts in the main stage ([014be3c](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/014be3cfed4cab00119c8713d33040d0e512989e))
* **canvas:** stage-mount commit 2 — mount capability passports in the main stage ([c7372e9](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/c7372e9003f8bdcaf1d98609bcd57d002c3d325c))
* **canvas:** stage-mount commit 3 — mount interactive tables in the main stage ([8b6af0d](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/8b6af0d0fc823df444bd7dec431d3e679da6d052))
* **canvas:** status popover + feature-status registry + legacy banners ([c03a39c](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/c03a39c0ca767e7e6c3aa5089622bf2ba97cd805))
* **canvas:** wire floating mic to Realtime voice (Sprint A §3 R6) ([27d003a](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/27d003ae245b9b5f075cb26e3cd0926c85367943))
* **cicerone:** merge PR [#16](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/16) -- full CICERONE agent build ([8f69502](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/8f69502212e7e5cd267871d62c4e942d19e07b28))
* **cicerone:** Stage 2.5 + 2.6 ingestion + 7c/8a/8b refresh ([5e229b3](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/5e229b3d54172ae327241f2fb8d42f89db143e68))
* **cicerone:** Stage 3/5 — system prompt, tool kit, seed script ([9b46a3f](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/9b46a3f61d7809e08cd7ecc77e12cc9314a9f949))
* **cicerone:** Stage 4 — canonical SVG diagrams + Stage 3/7/8 smoke results ([80d4540](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/80d4540a02319068c5999de3a3d6d53ac1b9456e))
* create JARVIS agent and register claude-sonnet-4-6 (Sprint 2 Step 4) ([26bc09c](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/26bc09cbd45ed4f77a18d29667ef1362f52fc2fb))
* **deps:** add ulid and fractional-indexing for block foundation ([3c445b9](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/3c445b99880cbb5a06c3584b6da642169ea3c3a2))
* guided demo narration, voice defaults, and fixes ([8bf0684](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/8bf0684070a91421b38f8d31684bad318757ca0f))
* integrate better-chatbot base (Sprint 2 Step 1) ([ba6bff8](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/ba6bff81e99fac1fb30937e2a33da1b9c1e81672))
* **kb:** Curated Knowledge Base — atlas.knowledge_* tables + surfaceKnowledgeBase tool ([#10](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/10)) ([af6a150](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/af6a150f9445680c90d144643c5cbd7d54cc3e58))
* **kb:** Phase 5-7 KB library, retrieval improvements, admin test page ([af88e42](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/af88e42c1558397d7fd828964778090e89273460))
* landscape 3D force graph, layout spread toggle, edge toggles ([51d1dc4](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/51d1dc476211c169a4c00dbbbe20cc759aa7f832))
* landscape force graph, chat-plus, ingest pipelines, demo mode, CPC theme ([00087bf](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/00087bf79dcff805f5088f3a167ffb78f40249fe))
* landscape v2 UMAP canvas, passport admin, ingest and tooling ([fed50f2](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/fed50f2678650ee369495f94b14dbe87da07ad2f))
* **landscape-3d:** add WIP chip + onHover wiring to canvas.hoveredNodeId ([09797bc](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/09797bc5d5980b8b261f5a2c5bdf5e2a2f1e396e))
* **landscape:** merge Phase 3d — 3D lens, focus-card, fly-through (PR [#15](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/15)) ([d54cedb](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/d54cedb6d74b1f1743083af9086f3889607e07eb))
* **landscape:** Phase 3b — ForceGraph Lens v2 + landscape-embed block ([#12](https://github.com/DayoOdunlami/InnovationAtlas4.0/issues/12)) ([52a236b](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/52a236bfe3a49dbce5a0bca656279cda4eb0c451))
* **landscape:** Phase 3d — 3D lens + brief storytelling (themes, focus-card, fly-through) ([2d003ab](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/2d003aba4c003ce080193dc825c3128d571e0965))
* passport selection flow + project context (Changes 1 and 2) ([629959f](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/629959f6bc522b1ac8843e33039399fe8f231161))
* pnpm seed:demo for shared admin + tester accounts (local + hosted DB) ([994112c](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/994112c51ba99c11b247ff66d485c786a61782ae))
* rebrand app to Innovation Atlas (Step 5) ([b007528](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/b007528bb9db604087ac2c27ab1611f851496e38))
* **schema:** add atlas.blocks table and indexes for Phase 2a.0 ([d1d8812](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/d1d881206991694e45236d8f9db05e65f14aceed))
* seamless dev test login (defaults, preview auto, bootstrap admin) ([e567602](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/e567602e060c030efcc22212c3016eebc1b9f399))
* Step 10 — /landscape page with UMAP scatter (projects + live calls) ([19a26b1](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/19a26b1899fe86e6727f5e1ea0e92162130bac92))
* Step 11 — /passport/[id] scaffold with claims HITL ([320f391](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/320f39182bc9ca239fe35676978af9be5c01939d))
* Step 13 matching engine (pgvector + Claude summaries) ([b6572ac](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/b6572ac700791eb65367bcb13ecdbc3d567f2e4f))
* Step 14 — gap denormalisation (atlas.matches gaps -&gt; atlas.passport_gaps) ([54ea2ea](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/54ea2ea0f1c913df04b616093f7ffff31dab49f5))
* Step 6 — Supabase Storage passport-documents bucket and atlas tables ([72367e3](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/72367e3b1408bdbc6a63174aa78ce2376e2d9e93))
* Step 7 — claim extraction API (Path A file + Path B self-reported, confidence ceiling guard) ([9fa36c2](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/9fa36c22331a1d0929bdfcba0c97408df2d7b8b3))
* Step 8 — HITL verify-claim route (only path to confidence_tier=verified) ([c77aac9](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/c77aac95b8f148a4b3c97120818f7c7c6896f34d))
* **store:** add canvas + briefing slices to appStore with sessionStorage mirror for briefing ([7c3b209](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/7c3b2099c86abaed1f1ec100a2cf3bf791069d39))
* **telemetry:** envelope + emit() + stdout + atlas-pg destinations + nav event catalogue ([a402b4c](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/a402b4caf2a0d78c47efb5e4a1ead0bfe96c2a25))
* **tools:** promote surfaceKnowledgeBase to its own toggleable toolkit ([30e832c](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/30e832ca95405c9365a9655fe792aec3042765b2))
* **tools:** register canvas + briefing tool-kits in enums + APP_DEFAULT_TOOL_KIT ([af336a2](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/af336a24b12d0b35e2b6de289506c21e18a1f536))
* voice audit Phase 2, HYVE agent, landscape 3D polish, admin usage, org ingest ([4c978b0](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/4c978b01863e95f303b16334f5ca974999d56979))
* wire Drizzle ORM to Supabase (Sprint 2 Step 2) ([6a124b5](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/6a124b5398dc19cf5fb89c749aa8ce12011458e3))


### Bug Fixes

* add Passport toolkit to default enabled toolkits and bump store version ([3ab29e8](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/3ab29e87a762f3b532179dbe3620d30671092ac1))
* allow internal tool API calls through middleware via x-tool-secret header ([18834fa](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/18834fadc9189a2649101466c8ab442c91f3314d))
* **brief:** live sync for AI block tools (revalidatePath + router.refresh) ([cad0fea](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/cad0feafbb441ca94c1117119e7e705fb2b4c0a1))
* **brief:** move /brief/[id] to (shared-brief) group so share URLs work without a session ([8ec412a](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/8ec412aea4716d0a7b56ebef789f7ace6e9d412c))
* **canvas:** inject canvas state into prompt and wire mode/query filters ([163e9dc](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/163e9dc163ed66be4f5c1d773564f190d61bcaff))
* **canvas:** route handleReturnToForceGraph through dispatcher, add ClearStage tool, un-skip [BUG-1] tests ([b6950eb](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/b6950eb3b6b0058a7304a79f190c313401cf42b5))
* **chat-plus:** use globalThis.Map for project lookup in session doc copy ([e802e34](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/e802e34e7340e6a879e3599c3407e7658893bfde))
* **chat:** guard surfaceKnowledgeBase against poisoned tool streams ([89f88d8](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/89f88d806bfe75833478a602792c2e9de2d60e19))
* default passport_type to 'evidence_profile' on new passport creation ([fd1a84e](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/fd1a84e29efcab8c49e1201a4d4bc25f3f2a3c19))
* preserve default toolkits when agent is mentioned (not when tool/mcp mentioned) ([5c0cb1b](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/5c0cb1b024b8252b56a5870c36e54b5ba202bb4e))
* restore default toolkit tools when agent is selected without explicit defaultTool mentions ([abade87](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/abade87a96e6a0ecf5fcb0da4521d328cb614691))
* route all passport writes through API endpoints, not direct MCP SQL ([16a74dd](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/16a74dd78cdd2b85ce5459bd06fb3f11ba9ce6fb))
* **telemetry:** preload load-env in emit.test.ts so static import chain finds POSTGRES_URL ([7ecfa35](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/7ecfa351a6acc9e04de35c62346269eab7de5e1d))
* unblock Vercel build (passport modules, landscape client lazy, dev-bypass) ([68e186a](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/68e186a5a6c77639db79f5d90d98950fc6879b4d))


### Performance Improvements

* **briefs:** single round-trip getBriefById (Rec 1) and cache share-token lookups (Rec 2) ([abc84e6](https://github.com/DayoOdunlami/InnovationAtlas4.0/commit/abc84e6afffc0e6b3d3adac38bb75ad2247fc0a3))

## [1.26.0](https://github.com/cgoinglove/better-chatbot/compare/v1.25.0...v1.26.0) (2025-11-07)


### Features

* add LaTeX/TeX math equation rendering support ([#318](https://github.com/cgoinglove/better-chatbot/issues/318)) ([c0a8b5b](https://github.com/cgoinglove/better-chatbot/commit/c0a8b5b9b28599716013c83cac03fa5745ffd403)) by @jezweb


### Bug Fixes

* hide MCP server credentials from non-owners ([#317](https://github.com/cgoinglove/better-chatbot/issues/317)) ([#319](https://github.com/cgoinglove/better-chatbot/issues/319)) ([6e32417](https://github.com/cgoinglove/better-chatbot/commit/6e32417535c27f1215f96d68b7302dba4a1b904d)) by @jezweb

## [1.25.0](https://github.com/cgoinglove/better-chatbot/compare/v1.24.0...v1.25.0) (2025-10-30)


### Features

* s3 storage and richer file support ([#301](https://github.com/cgoinglove/better-chatbot/issues/301)) ([051a974](https://github.com/cgoinglove/better-chatbot/commit/051a9740a6ecf774bfead9ce327c376ea5b279a5)) by @mrjasonroy


### Bug Fixes

* model name for gpt-4.1-mini in staticModels ([#299](https://github.com/cgoinglove/better-chatbot/issues/299)) ([4513ac0](https://github.com/cgoinglove/better-chatbot/commit/4513ac0e842f588a24d7075af8700e3cc7a3eb39)) by @mayur9210

## [1.24.0](https://github.com/cgoinglove/better-chatbot/compare/v1.23.0...v1.24.0) (2025-10-06)


### Features

* generate image Tool (Nano Banana) ([#284](https://github.com/cgoinglove/better-chatbot/issues/284)) ([984ce66](https://github.com/cgoinglove/better-chatbot/commit/984ce665ceef7225870f4eb751afaf65bf8a2dd4)) by @cgoinglove
* openai image generate ([#287](https://github.com/cgoinglove/better-chatbot/issues/287)) ([0deef6e](https://github.com/cgoinglove/better-chatbot/commit/0deef6e8a83196afb1f44444ab2f13415de20e73)) by @cgoinglove

## [1.23.0](https://github.com/cgoinglove/better-chatbot/compare/v1.22.0...v1.23.0) (2025-10-04)


### Features

* export chat thread ([#278](https://github.com/cgoinglove/better-chatbot/issues/278)) ([23e79cd](https://github.com/cgoinglove/better-chatbot/commit/23e79cd570c24bab0abc496eca639bfffcb6060b)) by @cgoinglove
* **file-storage:** image uploads, generate profile with ai ([#257](https://github.com/cgoinglove/better-chatbot/issues/257)) ([46eb43f](https://github.com/cgoinglove/better-chatbot/commit/46eb43f84792d48c450f3853b48b24419f67c7a1)) by @brrock


### Bug Fixes

* Apply DISABLE_SIGN_UP to OAuth providers ([#282](https://github.com/cgoinglove/better-chatbot/issues/282)) ([bcc0db8](https://github.com/cgoinglove/better-chatbot/commit/bcc0db8eb81997e54e8904e64fc76229fbfc1338)) by @cgoing-bot
* ollama disable issue ([#283](https://github.com/cgoinglove/better-chatbot/issues/283)) ([5e0a690](https://github.com/cgoinglove/better-chatbot/commit/5e0a690bb6c3f074680d13e09165ca9fff139f93)) by @cgoinglove

## [1.22.0](https://github.com/cgoinglove/better-chatbot/compare/v1.21.0...v1.22.0) (2025-09-25)

### Features

- admin and roles ([#270](https://github.com/cgoinglove/better-chatbot/issues/270)) ([63bddca](https://github.com/cgoinglove/better-chatbot/commit/63bddcaa4bc62bc85204a0982a06f2bed09fc5f5)) by @mrjasonroy
- groq provider ([#268](https://github.com/cgoinglove/better-chatbot/issues/268)) ([aef213d](https://github.com/cgoinglove/better-chatbot/commit/aef213d2f9dd0255996cc4184b03425db243cd7b)) by @cgoinglove
- hide LLM providers without API keys in model selection ([#269](https://github.com/cgoinglove/better-chatbot/issues/269)) ([63c15dd](https://github.com/cgoinglove/better-chatbot/commit/63c15dd386ea99b8fa56f7b6cb1e58e5779b525d)) by @cgoinglove
- **voice-chat:** binding agent tools ([#275](https://github.com/cgoinglove/better-chatbot/issues/275)) ([ed45e82](https://github.com/cgoinglove/better-chatbot/commit/ed45e822eb36447f2a02ef3aa69eeec88009e357)) by @cgoinglove

### Bug Fixes

- ensure PKCE works for MCP Server auth ([#256](https://github.com/cgoinglove/better-chatbot/issues/256)) ([09b938f](https://github.com/cgoinglove/better-chatbot/commit/09b938f17ca78993a1c7b84c5a702b95159542b2)) by @jvg123

## [1.21.0](https://github.com/cgoinglove/better-chatbot/compare/v1.20.2...v1.21.0) (2025-08-24)

### Features

- agent sharing ([#226](https://github.com/cgoinglove/better-chatbot/issues/226)) ([090dd8f](https://github.com/cgoinglove/better-chatbot/commit/090dd8f4bf4fb82beb2cd9bfa0b427425bbbf352)) by @mrjasonroy
- ai v5 ([#230](https://github.com/cgoinglove/better-chatbot/issues/230)) ([0461879](https://github.com/cgoinglove/better-chatbot/commit/0461879740860055a278c96656328367980fa533)) by @cgoinglove
- improve markdown table styling ([#244](https://github.com/cgoinglove/better-chatbot/issues/244)) ([7338e04](https://github.com/cgoinglove/better-chatbot/commit/7338e046196f72a7cc8ec7903593d94ecabcc05e)) by @hakonharnes

### Bug Fixes

- [#111](https://github.com/cgoinglove/better-chatbot/issues/111) prevent MCP server disconnection during long-running tool calls ([#238](https://github.com/cgoinglove/better-chatbot/issues/238)) ([b5bb3dc](https://github.com/cgoinglove/better-chatbot/commit/b5bb3dc40a025648ecd78f547e0e1a2edd8681ca)) by @cgoinglove

## [1.20.2](https://github.com/cgoinglove/better-chatbot/compare/v1.20.1...v1.20.2) (2025-08-09)

### Bug Fixes

- improve error display with better UX and animation handling ([#227](https://github.com/cgoinglove/better-chatbot/issues/227)) ([35d62e0](https://github.com/cgoinglove/better-chatbot/commit/35d62e05bb21760086c184511d8062444619696c)) by @cgoinglove
- **mcp:** ensure database and memory manager sync across server instances ([#229](https://github.com/cgoinglove/better-chatbot/issues/229)) ([c4b8ebe](https://github.com/cgoinglove/better-chatbot/commit/c4b8ebe9566530986951671e36111a2e529bf592)) by @cgoinglove

## [1.20.1](https://github.com/cgoinglove/better-chatbot/compare/v1.20.0...v1.20.1) (2025-08-06)

### Bug Fixes

- **mcp:** fix MCP infinite loading issue ([#220](https://github.com/cgoinglove/better-chatbot/issues/220)) ([c25e351](https://github.com/cgoinglove/better-chatbot/commit/c25e3515867c76cc5494a67e79711e9343196078)) by @cgoing-bot

## [1.20.0](https://github.com/cgoinglove/better-chatbot/compare/v1.19.1...v1.20.0) (2025-08-04)

### Features

- add qwen3 coder to models file for openrouter ([#206](https://github.com/cgoinglove/better-chatbot/issues/206)) ([3731d00](https://github.com/cgoinglove/better-chatbot/commit/3731d007100ac36a814704f8bde8398ce1378a4e)) by @brrock
- improve authentication configuration and social login handling ([#211](https://github.com/cgoinglove/better-chatbot/issues/211)) ([cd25937](https://github.com/cgoinglove/better-chatbot/commit/cd25937020710138ab82458e70ea7f6cabfd03ca)) by @mrjasonroy
- introduce interactive table creation and enhance visualization tools ([#205](https://github.com/cgoinglove/better-chatbot/issues/205)) ([623a736](https://github.com/cgoinglove/better-chatbot/commit/623a736f6895b8737acaa06811088be2dc1d0b3c)) by @cgoing-bot
- **mcp:** oauth ([#208](https://github.com/cgoinglove/better-chatbot/issues/208)) ([136aded](https://github.com/cgoinglove/better-chatbot/commit/136aded6de716367380ff64c2452d1b4afe4aa7f)) by @cgoinglove
- **web-search:** replace Tavily API with Exa AI integration ([#204](https://github.com/cgoinglove/better-chatbot/issues/204)) ([7140487](https://github.com/cgoinglove/better-chatbot/commit/7140487dcdadb6c5cb6af08f92b06d42411f7168)) by @cgoing-bot

### Bug Fixes

- implement responsive horizontal layout for chat mention input with improved UX And generate Agent Prompt ([43ec980](https://github.com/cgoinglove/better-chatbot/commit/43ec98059e0d27ab819491518263df55fb1c9ad3)) by @cgoinglove
- **mcp:** Safe MCP manager init logic for the Vercel environment ([#202](https://github.com/cgoinglove/better-chatbot/issues/202)) ([708fdfc](https://github.com/cgoinglove/better-chatbot/commit/708fdfcfed70299044a90773d3c9a76c9a139f2f)) by @cgoing-bot

## [1.19.1](https://github.com/cgoinglove/better-chatbot/compare/v1.19.0...v1.19.1) (2025-07-29)

### Bug Fixes

- **agent:** improve agent loading logic and validation handling in EditAgent component [#198](https://github.com/cgoinglove/better-chatbot/issues/198) ([ec034ab](https://github.com/cgoinglove/better-chatbot/commit/ec034ab51dfc656d7378eca1e2b4dc94fbb67863)) by @cgoinglove
- **agent:** update description field to allow nullish values in ChatMentionSchema ([3e4532d](https://github.com/cgoinglove/better-chatbot/commit/3e4532d4c7b561ad03836c743eefb7cd35fe9e74)) by @cgoinglove
- **i18n:** update agent description fields in English, Spanish, and French JSON files to improve clarity and consistency ([f07d1c4](https://github.com/cgoinglove/better-chatbot/commit/f07d1c4dc64b96584faa7e558f981199834a5370)) by @cgoinglove
- Invalid 'tools': array too long. Expected an array with maximum length 128, but got an array with length 217 instead. [#197](https://github.com/cgoinglove/better-chatbot/issues/197) ([b967e3a](https://github.com/cgoinglove/better-chatbot/commit/b967e3a30be3a8a48f3801b916e26ac4d7dd50f4)) by @cgoinglove

## [1.19.0](https://github.com/cgoinglove/better-chatbot/compare/v1.18.0...v1.19.0) (2025-07-28)

### Features

- Add Azure OpenAI provider support with comprehensive testing ([#189](https://github.com/cgoinglove/better-chatbot/issues/189)) ([edad917](https://github.com/cgoinglove/better-chatbot/commit/edad91707d49fcb5d3bd244a77fbaae86527742a)) by @shukyr
- add bot name preference to user settings ([f4aa588](https://github.com/cgoinglove/better-chatbot/commit/f4aa5885d0be06cc21149d09e604c781e551ec4a)) by @cgoinglove
- **agent:** agent and archive ([#192](https://github.com/cgoinglove/better-chatbot/issues/192)) ([c63ae17](https://github.com/cgoinglove/better-chatbot/commit/c63ae179363b66bfa4f4b5524bdf27b71166c299)) by @cgoinglove

### Bug Fixes

- enhance event handling for keyboard shortcuts in chat components ([95dad3b](https://github.com/cgoinglove/better-chatbot/commit/95dad3bd1dac4b6e56be2df35957a849617ba056)) by @cgoinglove
- refine thinking prompt condition in chat API ([0192151](https://github.com/cgoinglove/better-chatbot/commit/0192151fec1e33f3b7bc1f08b0a9582d66650ef0)) by @cgoinglove

## [1.18.0](https://github.com/cgoinglove/better-chatbot/compare/v1.17.1...v1.18.0) (2025-07-24)

### Features

- add sequential thinking tool and enhance UI components ([#183](https://github.com/cgoinglove/better-chatbot/issues/183)) ([5bcbde2](https://github.com/cgoinglove/better-chatbot/commit/5bcbde2de776b17c3cc1f47f4968b13e22fc65b2)) by @cgoinglove

## [1.17.1](https://github.com/cgoinglove/better-chatbot/compare/v1.17.0...v1.17.1) (2025-07-23)

### Bug Fixes

- ensure thread date fallback to current date in AppSidebarThreads component ([800b504](https://github.com/cgoinglove/better-chatbot/commit/800b50498576cfe1717da4385e2a496ac33ea0ad)) by @cgoinglove
- link to the config generator correctly ([#184](https://github.com/cgoinglove/better-chatbot/issues/184)) ([1865ecc](https://github.com/cgoinglove/better-chatbot/commit/1865ecc269e567838bc391a3236fcce82c213fc0)) by @brrock
- python executor ([ea58742](https://github.com/cgoinglove/better-chatbot/commit/ea58742cccd5490844b3139a37171b1b68046f85)) by @cgoinglove

## [1.17.0](https://github.com/cgoinglove/better-chatbot/compare/v1.16.0...v1.17.0) (2025-07-18)

### Features

- add Python execution tool and integrate Pyodide support ([#176](https://github.com/cgoinglove/better-chatbot/issues/176)) ([de2cf7b](https://github.com/cgoinglove/better-chatbot/commit/de2cf7b66444fe64791ed142216277a5f2cdc551)) by @cgoinglove

### Bug Fixes

- generate title by user message ([9ee4be6](https://github.com/cgoinglove/better-chatbot/commit/9ee4be69c6b90f44134d110e90f9c3da5219c79f)) by @cgoinglove
- generate title sync ([5f3afdc](https://github.com/cgoinglove/better-chatbot/commit/5f3afdc4cb7304460606b3480f54f513ef24940c)) by @cgoinglove

## [1.16.0](https://github.com/cgoinglove/better-chatbot/compare/v1.15.0...v1.16.0) (2025-07-15)

### Features

- Lazy Chat Title Generation: Save Empty Title First, Then Generate and Upsert in Parallel ([#162](https://github.com/cgoinglove/better-chatbot/issues/162)) ([31dfd78](https://github.com/cgoinglove/better-chatbot/commit/31dfd7802e33d8d4e91aae321c3d16a07fe42552)) by @cgoinglove
- publish container to GitHub registry ([#149](https://github.com/cgoinglove/better-chatbot/issues/149)) ([9f03cbc](https://github.com/cgoinglove/better-chatbot/commit/9f03cbc1d2890746f14919ebaad60f773b0a333d)) by @codingjoe
- update mention ux ([#161](https://github.com/cgoinglove/better-chatbot/issues/161)) ([7ceb9c6](https://github.com/cgoinglove/better-chatbot/commit/7ceb9c69c32de25d523a4d14623b25a34ffb3c9d)) by @cgoinglove

### Bug Fixes

- bug(LineChart): series are incorrectly represented [#165](https://github.com/cgoinglove/better-chatbot/issues/165) ([4e4905c](https://github.com/cgoinglove/better-chatbot/commit/4e4905c0f7f6a3eca73ea2ac06f718fa29b0f821)) by @cgoinglove
- ignore tool binding on unsupported models (server-side) ([#160](https://github.com/cgoinglove/better-chatbot/issues/160)) ([277b4fe](https://github.com/cgoinglove/better-chatbot/commit/277b4fe986d5b6d9780d9ade83f294d8f34806f6)) by @cgoinglove
- js executor tool and gemini model version ([#169](https://github.com/cgoinglove/better-chatbot/issues/169)) ([e25e10a](https://github.com/cgoinglove/better-chatbot/commit/e25e10ab9fac4247774b0dee7e01d5f6a4b16191)) by @cgoinglove
- **scripts:** parse openai compatible on windows ([#164](https://github.com/cgoinglove/better-chatbot/issues/164)) ([41f5ff5](https://github.com/cgoinglove/better-chatbot/commit/41f5ff55b8d17c76a23a2abf4a6e4cb0c4d95dc5)) by @axel7083
- **workflow-panel:** fix save button width ([#168](https://github.com/cgoinglove/better-chatbot/issues/168)) ([3e66226](https://github.com/cgoinglove/better-chatbot/commit/3e6622630c9cc40ff3d4357e051c45f8c860fc10)) by @axel7083

## [1.15.0](https://github.com/cgoinglove/better-chatbot/compare/v1.14.1...v1.15.0) (2025-07-11)

### Features

- Add js-execution tool and bug fixes(tool call) ([#148](https://github.com/cgoinglove/better-chatbot/issues/148)) ([12b18a1](https://github.com/cgoinglove/better-chatbot/commit/12b18a1cf31a17e565eddc05764b5bd2d0b0edee)) by @cgoinglove

### Bug Fixes

- enhance ToolModeDropdown with tooltip updates and debounce functionality ([d06db0b](https://github.com/cgoinglove/better-chatbot/commit/d06db0b3e1db34dc4785eb31ebd888d7c2ae0d64)) by @cgoinglove

## [1.14.1](https://github.com/cgoinglove/better-chatbot/compare/v1.14.0...v1.14.1) (2025-07-09)

### Bug Fixes

- tool select ui ([#141](https://github.com/cgoinglove/better-chatbot/issues/141)) ([0795524](https://github.com/cgoinglove/better-chatbot/commit/0795524991a7aa3e17990777ca75381e32eaa547)) by @cgoinglove

## [1.14.0](https://github.com/cgoinglove/better-chatbot/compare/v1.13.0...v1.14.0) (2025-07-07)

### Features

- web-search with images ([bea76b3](https://github.com/cgoinglove/better-chatbot/commit/bea76b3a544d4cf5584fa29e5c509b0aee1d4fee)) by @cgoinglove
- **workflow:** add auto layout feature for workflow nodes and update UI messages ([0cfbffd](https://github.com/cgoinglove/better-chatbot/commit/0cfbffd631c9ae5c6ed57d47ca5f34b9acbb257d)) by @cgoinglove
- **workflow:** stable workflow ( add example workflow : baby-research ) ([#137](https://github.com/cgoinglove/better-chatbot/issues/137)) ([c38a7ea](https://github.com/cgoinglove/better-chatbot/commit/c38a7ea748cdb117a4d0f4b886e3d8257a135956)) by @cgoinglove

### Bug Fixes

- **api:** handle error case in chat route by using orElse for unwrap ([25580a2](https://github.com/cgoinglove/better-chatbot/commit/25580a2a9f6c9fbc4abc29fee362dc4b4f27f9b4)) by @cgoinglove
- **workflow:** llm structure Output ([c529292](https://github.com/cgoinglove/better-chatbot/commit/c529292ddc1a4b836a5921e25103598afd7e3ab7)) by @cgoinglove

## [1.13.0](https://github.com/cgoinglove/better-chatbot/compare/v1.12.1...v1.13.0) (2025-07-04)

### Features

- Add web search and content extraction tools using Tavily API ([#126](https://github.com/cgoinglove/better-chatbot/issues/126)) ([f7b4ea5](https://github.com/cgoinglove/better-chatbot/commit/f7b4ea5828b33756a83dd881b9afa825796bf69f)) by @cgoing-bot

### Bug Fixes

- workflow condition node issue ([78b7add](https://github.com/cgoinglove/better-chatbot/commit/78b7addbba51b4553ec5d0ce8961bf90be5d649c)) by @cgoinglove
- **workflow:** improve mention handling by ensuring empty values are represented correctly ([92ff9c3](https://github.com/cgoinglove/better-chatbot/commit/92ff9c3e14b97d9f58a22f9df2559e479f14537c)) by @cgoinglove
- **workflow:** simplify mention formatting by removing bold styling for non-empty values ([ef65fd7](https://github.com/cgoinglove/better-chatbot/commit/ef65fd713ab59c7d8464cae480df7626daeff5cd)) by @cgoinglove

## [1.12.1](https://github.com/cgoinglove/better-chatbot/compare/v1.12.0...v1.12.1) (2025-07-02)

### Bug Fixes

- **workflow:** enhance structured output handling and improve user notifications ([dd43de9](https://github.com/cgoinglove/better-chatbot/commit/dd43de99881d64ca0c557e29033e953bcd4adc0e)) by @cgoinglove

## [1.12.0](https://github.com/cgoinglove/better-chatbot/compare/v1.11.0...v1.12.0) (2025-07-01)

### Features

- **chat:** enable [@mention](https://github.com/mention) and tool click to trigger workflow execution in chat ([#122](https://github.com/cgoinglove/better-chatbot/issues/122)) ([b4e7f02](https://github.com/cgoinglove/better-chatbot/commit/b4e7f022fa155ef70be2aee9228a4d1d2643bf10)) by @cgoing-bot

### Bug Fixes

- clean changlelog and stop duplicate attributions in the changelog file ([#119](https://github.com/cgoinglove/better-chatbot/issues/119)) ([aa970b6](https://github.com/cgoinglove/better-chatbot/commit/aa970b6a2d39ac1f0ca22db761dd452e3c7a5542)) by @brrock

## [1.11.0](https://github.com/cgoinglove/better-chatbot/compare/v1.10.0...v1.11.0) (2025-06-28)

### Features

- **workflow:** Add HTTP and Template nodes with LLM structured output supportWorkflow node ([#117](https://github.com/cgoinglove/better-chatbot/issues/117)) ([10ec438](https://github.com/cgoinglove/better-chatbot/commit/10ec438f13849f0745e7fab652cdd7cef8e97ab6)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot
- **workflow:** add HTTP node configuration and execution support ([7d2f65f](https://github.com/cgoinglove/better-chatbot/commit/7d2f65fe4f0fdaae58ca2a69abb04abee3111c60)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

### Bug Fixes

- add POST endpoint for MCP client saving with session validation ([fa005aa](https://github.com/cgoinglove/better-chatbot/commit/fa005aaecbf1f8d9279f5b4ce5ba85343e18202b)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- split theme system into base themes and style variants ([61ebd07](https://github.com/cgoinglove/better-chatbot/commit/61ebd0745bcfd7a84ba3ad65c3f52b7050b5131a)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- update ToolMessagePart to use isExecuting state instead of isExpanded ([752f8f0](https://github.com/cgoinglove/better-chatbot/commit/752f8f06e319119569e9ee7c04d621ab1c43ca54)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.10.0](https://github.com/cgoinglove/better-chatbot/compare/v1.9.0...v1.10.0) (2025-06-27)

### Features

- **releases:** add debug logging to the add authors and update release step ([#105](https://github.com/cgoinglove/better-chatbot/issues/105)) ([c855a6a](https://github.com/cgoinglove/better-chatbot/commit/c855a6a94c49dfd93c9a8d1d0932aeda36bd6c7e)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock
- workflow beta ([#100](https://github.com/cgoinglove/better-chatbot/issues/100)) ([2f5ada2](https://github.com/cgoinglove/better-chatbot/commit/2f5ada2a66e8e3cd249094be9d28983e4331d3a1)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

### Bug Fixes

- update tool selection logic in McpServerSelector to maintain current selections ([4103c1b](https://github.com/cgoinglove/better-chatbot/commit/4103c1b828c3e5b513679a3fb9d72bd37301f99d)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- **workflow:** MPC Tool Response Structure And Workflow ([#113](https://github.com/cgoinglove/better-chatbot/issues/113)) ([836ffd7](https://github.com/cgoinglove/better-chatbot/commit/836ffd7ef5858210bdce44d18ca82a1c8f0fc87f)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

## [1.9.0](https://github.com/cgoinglove/better-chatbot/compare/v1.8.0...v1.9.0) (2025-06-16)

### Features

- credit contributors in releases and changlogs ([#104](https://github.com/cgoinglove/better-chatbot/issues/104)) ([e0e4443](https://github.com/cgoinglove/better-chatbot/commit/e0e444382209a36f03b6e898f26ebd805032c306)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock

### Bug Fixes

- increase maxTokens for title generation in chat actions issue [#102](https://github.com/cgoinglove/better-chatbot/issues/102) ([bea2588](https://github.com/cgoinglove/better-chatbot/commit/bea2588e24cf649133e8ce5f3b6391265b604f06)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- temporary chat initial model ([0393f7a](https://github.com/cgoinglove/better-chatbot/commit/0393f7a190463faf58cbfbca1c21d349a9ff05dc)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- update adding-openAI-like-providers.md ([#101](https://github.com/cgoinglove/better-chatbot/issues/101)) ([2bb94e7](https://github.com/cgoinglove/better-chatbot/commit/2bb94e7df63a105e33c1d51271751c7b89fead23)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock
- update config file path in release workflow ([7209cbe](https://github.com/cgoinglove/better-chatbot/commit/7209cbeb89bd65b14aee66a40ed1abb5c5f2e018)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.8.0](https://github.com/cgoinglove/better-chatbot/compare/v1.7.0...v1.8.0) (2025-06-11)

### Features

- add openAI compatible provider support ([#92](https://github.com/cgoinglove/better-chatbot/issues/92)) ([6682c9a](https://github.com/cgoinglove/better-chatbot/commit/6682c9a320aff9d91912489661d27ae9bb0f4440)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock

### Bug Fixes

- Enhance component styles and configurations ([a7284f1](https://github.com/cgoinglove/better-chatbot/commit/a7284f12ca02ee29f7da4d57e4fe6e8c6ecb2dfc)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.7.0](https://github.com/cgoinglove/better-chatbot/compare/v1.6.2...v1.7.0) (2025-06-06)

### Features

- Per User Custom instructions ([#86](https://github.com/cgoinglove/better-chatbot/issues/86)) ([d45c968](https://github.com/cgoinglove/better-chatbot/commit/d45c9684adfb0d9b163c83f3bb63310eef572279)) by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu

## [1.6.2](https://github.com/cgoinglove/better-chatbot/compare/v1.6.1...v1.6.2) (2025-06-04)

### Bug Fixes

- enhance error handling in chat bot component ([1519799](https://github.com/cgoinglove/better-chatbot/commit/15197996ba1f175db002b06e3eac2765cfae1518)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- improve session error handling in authentication ([eb15b55](https://github.com/cgoinglove/better-chatbot/commit/eb15b550facf5368f990d58b4b521bf15aecbf72)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- support OpenAI real-time chat project instructions ([2ebbb5e](https://github.com/cgoinglove/better-chatbot/commit/2ebbb5e68105ef6706340a6cfbcf10b4d481274a)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- unify SSE and streamable config as RemoteConfig ([#85](https://github.com/cgoinglove/better-chatbot/issues/85)) ([66524a0](https://github.com/cgoinglove/better-chatbot/commit/66524a0398bd49230fcdec73130f1eb574e97477)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

## [1.6.1](https://github.com/cgoinglove/better-chatbot/compare/v1.6.0...v1.6.1) (2025-06-02)

### Bug Fixes

- speech ux ([baa849f](https://github.com/cgoinglove/better-chatbot/commit/baa849ff2b6b147ec685c6847834385652fc3191)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

## [1.6.0](https://github.com/cgoinglove/better-chatbot/compare/v1.5.2...v1.6.0) (2025-06-01)

### Features

- add husky for formatting and checking commits ([#71](https://github.com/cgoinglove/better-chatbot/issues/71)) ([a379cd3](https://github.com/cgoinglove/better-chatbot/commit/a379cd3e869b5caab5bcaf3b03f5607021f988ef)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- add Spanish, French, Japanese, and Chinese language support with UI improvements ([#74](https://github.com/cgoinglove/better-chatbot/issues/74)) ([e34d43d](https://github.com/cgoinglove/better-chatbot/commit/e34d43df78767518f0379a434f8ffb1808b17e17)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot
- implement cold start-like auto connection for MCP server and simplify status ([#73](https://github.com/cgoinglove/better-chatbot/issues/73)) ([987c442](https://github.com/cgoinglove/better-chatbot/commit/987c4425504d6772e0aefe08b4e1911e4cb285c1)) by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot by @cgoing-bot

## [1.5.2](https://github.com/cgoinglove/better-chatbot/compare/v1.5.1...v1.5.2) (2025-06-01)

### Features

- Add support for Streamable HTTP Transport [#56](https://github.com/cgoinglove/better-chatbot/issues/56) ([8783943](https://github.com/cgoinglove/better-chatbot/commit/878394337e3b490ec2d17bcc302f38c695108d73)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- implement speech system prompt and update voice chat options for enhanced user interaction ([5a33626](https://github.com/cgoinglove/better-chatbot/commit/5a336260899ab542407c3c26925a147c1a9bba11)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- update MCP server UI and translations for improved user experience ([1e2fd31](https://github.com/cgoinglove/better-chatbot/commit/1e2fd31f8804669fbcf55a4c54ccf0194a7e797c)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

### Bug Fixes

- enhance mobile UI experience with responsive design adjustments ([2eee8ba](https://github.com/cgoinglove/better-chatbot/commit/2eee8bab078207841f4d30ce7708885c7268302e)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove
- UI improvements for mobile experience ([#66](https://github.com/cgoinglove/better-chatbot/issues/66)) ([b4349ab](https://github.com/cgoinglove/better-chatbot/commit/b4349abf75de69f65a44735de2e0988c6d9d42d8)) by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove by @cgoinglove

### Miscellaneous Chores

- release 1.5.2 ([d185514](https://github.com/cgoinglove/better-chatbot/commit/d1855148cfa53ea99c9639f8856d0e7c58eca020)) by @cgoinglove
