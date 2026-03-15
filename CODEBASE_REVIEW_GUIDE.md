You are performing a full senior-level codebase review of a platform called Meridian.

Your job is not to be nice. Your job is to determine:
1. what is actually implemented,
2. what is partially implemented or faked,
3. what is broken or risky,
4. what will fail under real users, real data volume, and real-time collaboration,
5. what must be changed before this platform is production-ready.

You must review the actual codebase, not just documentation, README claims, route names, or UI screenshots.

==================================================
PLATFORM CONTEXT
==================================================

Meridian is intended to be a global situational awareness and collaborative intelligence platform built on open/public OSINT data. It includes:

- multi-panel dashboard
- map-first UI
- many live/open data feeds
- alerts and notifications
- AI analysis/reporting
- collaborative “Plan Mode”
- multi-user org/workspace/role architecture
- exports/reports
- free + team/pro monetization model

Planned/claimed architectural characteristics include:
- React 18 + TypeScript frontend
- MapLibre GL JS map stack
- Node.js backend
- Socket.io real-time layer
- Yjs collaboration / CRDT sync for Plan Mode
- PostgreSQL + PostGIS + TimescaleDB + pgvector
- Redis + BullMQ workers
- AI layer using OpenAI/Claude-style tooling
- alert engine
- ingestion/normalization pipeline for many feeds
- RBAC with organizations, workspaces, rooms, room roles
- audit logging, auth, token/API access, exports, status monitoring

The platform’s major differentiator is supposed to be Plan Mode:
- shared live map
- shared annotations
- shared event timeline
- task board
- watch lists
- shared AI context
- briefing/presenter behavior
- room collaboration for 2–50 users

This review must determine whether the codebase truly supports those claims.

==================================================
REVIEW OBJECTIVES
==================================================

Perform a full repo review across the following dimensions:

A. PRODUCT TRUTH CHECK
- What features are actually implemented versus merely scaffolded?
- What features appear in UI but are stubbed, mocked, hardcoded, or non-functional?
- What routes/endpoints/components exist but do not have full behavior?
- Which major roadmap claims are materially incomplete?

B. ARCHITECTURE QUALITY
- Is the architecture coherent, maintainable, and scalable?
- Are concerns separated correctly?
- Are there obvious anti-patterns, dead abstractions, or “vibe-coded” glue?
- Is the app structured for future growth or already becoming a mess?

C. FRONTEND QUALITY
- State management sanity
- component boundaries
- rendering performance
- map rendering performance
- unnecessary rerenders
- data-fetching strategy
- real-time subscription handling
- error states / loading states / stale-data states
- accessibility
- mobile/responsive truth versus claims
- route/layout consistency
- design system consistency

D. BACKEND QUALITY
- API design consistency
- schema validation
- auth boundaries
- permission enforcement
- background jobs
- ingestion architecture
- alert rule execution
- error handling
- retries
- idempotency
- concurrency hazards
- use of Redis/BullMQ/queues
- webhooks/outbound delivery robustness

E. DATA / DB / MODELING
- schema quality
- indexes
- spatial query strategy
- time-series strategy
- partitioning/hypertables if applicable
- event normalization design
- denormalization choices
- migration quality
- DB constraints
- row ownership / multi-tenant isolation
- auditability
- retention strategy
- data correctness risks
- whether the schema matches the platform claims

F. REAL-TIME + COLLABORATION
- Does Socket.io usage look production-safe?
- Does Plan Mode collaboration actually work from code structure, or is it mostly theater?
- Is Yjs/CRDT integration real, correct, and scoped appropriately?
- Presence/cursors/view sync/annotation sync/timeline sync/task sync/watch-list sync: which are real and which are fake?
- Are there race conditions, ghost state, ordering issues, reconnect issues, or conflict bugs?
- Can this survive multiple concurrent users in the same room?

G. SECURITY
- authentication correctness
- authorization correctness
- tenant isolation
- secret handling
- API key exposure risk
- SSRF / injection / XSS / CSRF / IDOR / broken access control
- webhook abuse
- prompt injection surfaces
- unsafe tool execution patterns
- export/download vulnerabilities
- file handling risks
- rate limiting / abuse prevention
- whether “server-side managed API credentials” is actually true in implementation

H. AI LAYER
- Is the AI integration clean and bounded, or is it duct-taped onto everything?
- Prompt construction quality
- tool/function calling implementation
- citation/provenance support
- streaming support
- failure handling
- cost controls
- caching
- hallucination risk due to bad retrieval or weak source grounding
- permission scoping for AI features in shared rooms
- whether “AI embedded everywhere” is sustainable or a maintenance trap

I. FEED INGESTION / OSINT DATA PIPELINE
- Are ingestion workers robust?
- Are feed failures isolated?
- Is normalization consistent?
- Is source freshness tracked correctly?
- Is deduplication real?
- Are polling intervals realistic?
- Is backoff/retry present?
- Are rate limits respected?
- Are there hidden assumptions that will make the platform brittle?
- Are there places where the code pretends to handle 150+ feeds but clearly does not?

J. ALERTING / RULE ENGINE
- Is the alert engine truly event-driven or just periodic polling with weak logic?
- Geography conditions, thresholds, keyword matches, time windows, team delivery, digests: how real are they?
- Is rule evaluation efficient?
- Is it safe against duplicate alerts, noisy alerts, or missed alerts?
- Are delivery guarantees acceptable?

K. PERFORMANCE / SCALE
- What will break first under:
  - 10 users
  - 100 users
  - 1,000 concurrent dashboard users
  - 50 collaborators in one Plan Room
  - high event ingestion bursts
- Identify CPU, memory, DB, websocket, map, and frontend bottlenecks
- Distinguish theoretical concerns from code-evident problems

L. TESTING / DEVOPS / OPERABILITY
- test coverage quality, not vanity percentages
- missing integration tests
- missing collaboration tests
- missing auth/permission tests
- migration safety
- local dev quality
- env/config hygiene
- observability
- status checks
- deploy readiness
- rollback safety
- CI/CD quality
- secrets/config drift risks

==================================================
REVIEW METHOD
==================================================

You must inspect the codebase in phases:

PHASE 1 — REPO SURVEY
- Build a mental model of the codebase
- Identify major apps/services/packages
- Identify frontend, backend, workers, shared libs, infra, migrations, tests
- Identify core business domains
- Summarize actual architecture as implemented

PHASE 2 — CLAIMS VS REALITY
For each major platform capability, classify:
- IMPLEMENTED
- PARTIALLY IMPLEMENTED
- STUBBED / MOCKED
- MISSING
- UNCLEAR

Capabilities to classify:
- auth
- organizations/workspaces
- RBAC
- map layers / map interactions
- event ingestion
- event normalization
- real-time updates
- alerts
- notification center
- AI analyst
- AI summaries
- daily brief
- situation reports
- anomaly detection
- geopolitical risk scoring
- Plan Rooms
- shared annotations
- shared timeline
- task board
- watch list
- briefing mode
- exports
- pricing/tier enforcement
- API tokens
- mobile responsiveness
- status/health monitoring

PHASE 3 — DEEP TECHNICAL REVIEW
Walk the most important execution paths end to end:
1. user signs in
2. dashboard loads
3. map loads and renders event layers
4. live event arrives
5. event stored/normalized
6. websocket pushes to clients
7. user clicks event drawer
8. user creates alert
9. alert rule evaluates and fires
10. Plan Room collaboration sync occurs
11. AI query executes with tools/data access
12. report/export is generated
13. permission boundary is tested across roles/workspaces/rooms

PHASE 4 — RISK TRIAGE
Identify:
- critical blockers
- serious architectural debt
- likely launch failures
- security red flags
- scale traps
- fake-completion areas
- fast fixes
- expensive rewrites

==================================================
OUTPUT FORMAT
==================================================

Produce your output in this exact structure.

# 1. Executive Verdict
Give a blunt assessment in 10–20 lines:
- Is this codebase actually launchable?
- Is it solid, shaky, or lipstick on a race condition?
- What is the biggest lie the codebase is telling?
- What is the biggest strength?

# 2. What the Platform Actually Is Today
Describe the real system as implemented, not as pitched.

# 3. Claims vs Reality Matrix
Use a table with columns:
- Capability
- Claimed
- Actual Status
- Evidence
- Risk
- Notes

# 4. Architecture Review
Cover:
- frontend architecture
- backend architecture
- data architecture
- real-time/collab architecture
- AI architecture
- infra/devops architecture

For each area, give:
- what is good
- what is weak
- what is dangerous
- what should be refactored first

# 5. Critical Findings
List the top issues sorted by severity:
- Critical
- High
- Medium
- Low

For each finding include:
- title
- why it matters
- exact evidence in code
- user/business impact
- recommended fix
- rough fix scope: small / medium / large / rewrite

# 6. Security Review
Specifically call out:
- auth flaws
- RBAC flaws
- tenant isolation flaws
- exposed secrets
- dangerous endpoints
- missing validation
- injection/XSS/IDOR risk
- unsafe AI/tooling patterns
- webhook or export risks

# 7. Collaboration / Plan Mode Reality Check
This must be its own section.
Tell me whether Plan Mode is:
- real and structurally sound
- partially real but fragile
- mostly simulated
- mostly missing

Break down each collaborative capability separately.

# 8. Data + Feed Pipeline Review
Review:
- ingestion workers
- normalization
- deduplication
- freshness tracking
- retries/backoff
- source isolation
- scheduling
- schema design
- observability

# 9. AI Layer Review
Review:
- prompt/tool architecture
- grounding/citations
- failure handling
- privacy/permission boundaries
- streaming behavior
- cost/performance implications
- maintainability

# 10. Performance and Scale Assessment
Give:
- likely first bottlenecks
- worst hotspots
- easy wins
- non-obvious scale traps
- whether 2–50 live Plan Mode users looks realistic

# 11. Code Quality Review
Comment on:
- readability
- cohesion
- naming
- duplication
- dead code
- “magic” behavior
- config sprawl
- testability
- whether the repo looks like it was built deliberately or improvised under deadline pressure

# 12. Launch Readiness Scorecard
Score 1–10 with short justification for:
- product completeness
- code quality
- security
- scale readiness
- collaboration readiness
- AI readiness
- observability
- maintainability
- production readiness

# 13. Top 10 Fixes Before Launch
Ordered, practical, no fluff.

# 14. Top 10 Technical Debt Items to Schedule After Launch
Ordered, practical.

# 15. Suggested Refactor Plan
Give a phased plan:
- Phase 0: immediate blockers
- Phase 1: stabilize core
- Phase 2: harden collaboration + data pipeline
- Phase 3: scale + polish

# 16. Appendix: Evidence Log
For every major conclusion, cite concrete evidence:
- file path
- function/class/module name
- short explanation

Do not make claims without evidence.

==================================================
REVIEW RULES
==================================================

- Be skeptical of comments, TODOs, screenshots, and UI polish.
- Prefer evidence from execution paths, schemas, guards, tests, worker flows, and real integrations.
- If something looks mocked, say so.
- If something looks overengineered, say so.
- If something looks underengineered for the product claim, say so.
- Distinguish “present in code” from “production ready.”
- Distinguish “can demo” from “can operate.”
- Call out where the implementation mismatches the product promise.
- Do not hide behind uncertainty. If unsure, state the uncertainty and why.
- Do not give generic best practices unless tied to a specific code finding.
- Assume I want the hard truth, not morale support.

At the end, provide a final one-paragraph conclusion answering:
“If you inherited this repo today, would you double down, stabilize, or partially rebuild?”