# Engineering Excellence Dashboard

Benchmarks engineering teams against a bar the Director sets. Colour shows **distance from the bar**, not rank.
It is team-level only: nothing is computed, stored or shown per individual. Full spec: [`docs/spec.md`](docs/spec.md).

This build runs on **dummy data**: ten fictional teams, 12 months of generated events, deterministic from a seed.

## Run it

```bash
npm install
npm run dev          # Postgres + API + web via Docker Compose
```

Open **http://localhost:5173** and sign in as `admin` / `admin` (dummy-data build only).

The API migrates and seeds the dummy world on first boot. To start over: `docker compose down -v && npm run dev`.

## Things to try

| Do this | See this |
| --- | --- |
| **Team benchmark** → hover a cell | The gap in words: "Lead time 3.2 days, High (1 level below the bar); bar is under 1 day (Elite)" |
| Click a cell | The team drill-down: the team's metrics colour coded with deltas, its plain stats, where lead time goes, **time in each Jira status**, **where tickets bounce**, what is in each column now and what hasn't moved, PR sizes, cycle time, investment mix |
| Look at **Iris** | Grey "not enough data" with the count instead of a grade |
| **Settings → Benchmarks and bars**: set a bar to Elite, **Publish** | A new immutable Bar version; cells recolour straight away with nothing re-fetched. Switch "Grade history against" to *today's bar* to see history regraded |
| **Settings → Team mapping**: move `harbour-core` to Juniper from a date | Harbour keeps its earlier history, Juniper gets the later events. Archive a team: it leaves the grid but org totals and history stay |
| **Settings → Data sources → Run now** | The fake source emits the next simulated day, "data as of" and "today" move forward, only that day's events are fetched |
| **Settings → Data sources**: change the production environment name | Every deploy metric recomputes immediately (metrics are computed from raw events on read) |
| **Surveys**: create a campaign, **Open** it, open a team's link in a private window | The public page: no login, no team picker, no identity stored. Submit four answers for one team and its results appear; three and it stays hidden, rolled into its group |
| **Org benchmark** | The pooled org row, 12 months of org cells, and "7 of 9 teams at or above the bar" (counts, never names) |
| **Audience views** | The five views down the org. Director to Execs opens with a written summary and shows speed beside stability, each with a sparkline and the bar. EM to TL and TL to Team start with the team's colour-coded headline metrics |
| **Glossary** | Every metric, generated from the same registry that computes it, opening with the principles |

## Dummy teams

| Team | Behaviour |
| --- | --- |
| Aurora | Steady, above the bar |
| Birch | Steady, at the bar |
| Comet | Deploys many times a day, high change failure rate |
| Delta | Legacy system: big PRs, long lead time, weekly releases |
| Ember (Platform) | Few deploys, fast recovery; graded on Platform thresholds |
| Fjord | Mobile release train: weekly deploys, long wait to deploy |
| Garnet | Improves from red to green over the year |
| Harbour | Slides from green to amber; loses two repos to Juniper |
| Iris | Very low volume, below the survey minimum |
| Juniper | Formed four months ago; takes over two Harbour repos |

Bar v1 applies from the start; Bar v2 (lead-time bar raised to Elite) took effect three months ago.

## Commands

| | |
| --- | --- |
| `npm run dev` | Postgres, API and web via Docker Compose (web :5173, API :3000, Postgres :5433) |
| `npm test` | Everything: unit, integration (Testcontainers, needs Docker), use-case journeys, web components |
| `npm run test:unit` / `test:integration` / `test:use-cases` | One layer |
| `npm run lint` | ESLint, including the dependency-direction rules (self-tested) |
| `npm run typecheck` | `tsc` for the backend and the web app |
| `npm run dev:api` / `npm run dev:web` | Run the API or web locally instead of in Docker (needs `docker compose up -d postgres`) |
| `npm run seed` / `npm run grid` | Load the dummy world from the terminal / print the benchmark grid |

## How it fits together

Hexagonal: `adapters → application → domain`. The domain is pure TypeScript (events, teams and mappings,
the metric registry, benchmark versions, surveys). Use cases depend only on ports. The fake source,
Postgres, basic auth, the HTTP API and the React app are adapters. Raw events are stored and every metric is
**computed on read**, so changing a definition, a threshold or a bar recalculates history without re-fetching.
The metric registry is the single source of truth: the glossary, thresholds and labels all come from it.

The dummy world has its own simulated clock (the fake source's latest day), so "Run now" moves "today" with it.
