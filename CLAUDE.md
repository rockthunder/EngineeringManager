# Engineering Excellence Dashboard

Benchmarks ~10 engineering teams against a bar set by the Director of Engineering. Colour shows distance from the bar, not rank. The full product spec is in `docs/spec.md`; read it before starting any feature.

## Non-negotiable rules

1. **Team level only.** No metric is ever computed, stored or displayed per individual. Source adapters drop author/assignee/reviewer identities on ingest; the domain has no concept of a person. Any change that introduces a person identifier needs explicit sign-off.
2. **Not a league table.** Never sort teams by grade or score by default, never add a total score or rank column.
3. **Store raw events, compute on read.** Metrics are derived from stored events (deployments, PRs, work items, transitions, sprints, incidents, survey responses). Never persist a computed metric as the source of truth; caches are disposable and keyed on definitions version + mapping version + last sync.
4. **The metric definition registry is the single source of truth.** Each metric's calculation, unit, direction of good, aggregation rule, minimum sample, default window, thresholds and glossary text live in one registry entry. The glossary page is generated from it. Never hard-code metric text or thresholds in the UI.
5. **Org aggregation pools events.** Org figures are computed from all events pooled together, never by averaging team results. Counts sum; rates are total numerator ÷ total denominator; durations are the median over all events.
6. **Small samples are not graded.** Below a metric's minimum sample, return `insufficient_data` with the count, never a grade.
7. **Benchmark versions are immutable and effective-dated.** Changing thresholds or bars creates a new version; history can be graded against the version in force at the time or today's.
8. **Team mappings are effective-dated.** An event belongs to the team mapped to its repo/board/service at the event's time.
9. **Survey anonymity.** Store no name, email, IP or user agent; round submission time to the day; hide team results below the configured minimum (default 4, floor 3) and roll them into the group view.

## Architecture: hexagonal (ports and adapters)

```
src/
  domain/          # pure TypeScript: no I/O, no framework imports, no Date.now()
    events/        # Deployment, PullRequest, WorkItem, StatusTransition, Sprint, Incident, SurveyResponse
    teams/         # Team, Group, Profile, Mapping (effective-dated), mapping resolution
    metrics/       # registry, calculators, aggregation rules
    benchmarks/    # BenchmarkVersion, levels, bars, grading, distance-from-bar, trend direction
    surveys/       # Survey, Campaign, DevEx score
  application/     # use cases; depend only on domain + ports
    ports/         # DeliverySource, WorkSource, IncidentSource, EventStore, ConfigStore, AuthProvider, Clock
    use-cases/     # syncSource, getBenchmarkGrid, getOrgBenchmark, getTeamDrilldown,
                   # publishBenchmarkVersion, manageTeamMapping, runSurveyCampaign,
                   # submitSurveyResponse, login
  adapters/
    driving/http/  # Fastify routes; thin, call use cases only
    driving/worker/# scheduled polling
    driven/fake-source/   # deterministic dummy data generator (seeded)
    driven/github/ driven/jira/ driven/jsm/   # later
    driven/postgres/
    driven/auth-basic/    # v1; auth0 later as another AuthProvider
web/               # React UI; talks to the HTTP API only (types from views/contract.ts)
```

Dependency direction points inward: `adapters → application → domain`. The domain imports nothing from application or adapters. An ESLint import rule (or dependency-cruiser) enforces this; keep it passing.

Time is injected through the `Clock` port. Randomness in the fake source uses a seeded PRNG.

## Stack

- TypeScript (strict) throughout, Node LTS
- Fastify API + a worker process for polling
- React + Vite for the UI
- Postgres; migrations checked in
- Docker Compose for local running (Postgres, API, worker, web)
- Vitest for tests; Testcontainers for Postgres integration tests

## Tests: three layers, all required

- **Unit** (`*.test.ts` beside domain code): every calculator, aggregation rule, grading boundary, distance-from-bar, trend direction, mapping resolution. Hand-built event fixtures with known answers. No I/O.
- **Integration** (`tests/integration/`): Postgres repositories against a real container; fake source through `syncSource` (cursors, idempotent re-runs, backfill); later the GitHub/Jira/JSM adapters against recorded responses, including asserting author fields are dropped; basic auth.
- **Use case** (`tests/use-cases/`): the major journeys in `docs/spec.md` ("Testing strategy") against the seeded dummy data, e.g. raising the lead-time bar creates Bar v2 and recolours cells without re-fetching; a reorg keeps the old team's history.

A feature is done when its tests in all relevant layers pass. Write the failing test first for domain logic.

## Dummy data

`adapters/driven/fake-source` generates 12 months of events for 10 fictional teams (Aurora … Juniper) from a fixed seed, with the behaviours listed in `docs/spec.md` ("Dummy data plan"). It implements the same source ports as the real adapters. "Run now" emits the next simulated day. Use-case tests rely on its determinism, so changing the generator means updating expected values deliberately.

## Commands

- `npm run dev` — Postgres (host port 5433), API (:3000) and web (:5173) via Docker Compose; sign in `admin` / `admin`
- `npm test` — all tests (integration and use-case projects need Docker running for Testcontainers)
- `npm run test:unit` / `test:integration` / `test:use-cases` (the `web` project runs with `npm test`)
- `npm run lint` — ESLint, including the dependency-direction rules (self-tested in `tests/lint/`)
- `npm run typecheck` — `tsc --noEmit` for the backend and for `web/`
- `npm run dev:api` / `npm run dev:web` — run the API or web outside Docker (needs `docker compose up -d postgres`)
- `npm run migrate` / `npm run seed` / `npm run grid` — apply migrations / load the dummy world / print the team benchmark grid (`-- --days 30|default`, `-- --as-of YYYY-MM-DD`)

## The web app and the API contract

`web/` is React + Vite and talks to the HTTP API only. The one thing it shares with the backend is
`src/application/views/contract.ts` (types only, imported as `@contract`); a lint rule forbids any other import from `src/`.
Use cases return **display-ready view models** (formatted values, labels, colour keys, tooltips) so no metric text or
threshold is ever hard-coded in the UI. The dummy world runs on a simulated clock (`SimWorld`): "Run now" advances the fake
source one day and "today" moves with it.

## Working conventions

- Small, reviewable commits; one use case or adapter per change where possible.
- Update `docs/spec.md` when a decision changes; update the registry (not the UI) when a metric changes.
- Out of scope for v1: product/business metrics, SLAs/SLOs, Slite, annotations (UI placeholder only), roles beyond a single admin
- Not built yet: the scheduled worker (polling happens via "Run now"), the real GitHub/Jira/JSM adapters, Auth0.
