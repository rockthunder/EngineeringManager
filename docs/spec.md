# Engineering Excellence Dashboard — v1 Spec

As of 2026-10-21 · Owner: Paul

## Purpose, principles and scope

The dashboard shows how far each engineering team is from the bar the Director sets, so that a gap starts a conversation about help, not a challenge about performance. v1 covers engineering excellence for about 10 teams, using dummy data first and then Jira, GitHub and JSM.

**Principles**

- **Team level only.** No metric is ever shown or stored per individual. This is stated on the login page and at the top of the glossary.
- **The bar, not a league table.** Colour shows distance from the bar. Teams are never ranked or sorted by score by default.
- **Pairs, not singles.** Every speed metric is shown beside its stability counterpart.
- **Show the why.** Every grade links to the glossary and to the team's breakdown of where time goes.
- **Honest about small samples.** A cell with too little data shows "not enough data", not a grade.
- **History you can recompute.** Raw events are stored, so changing a definition or raising the bar recalculates history without re-pulling data.

**In scope for v1**

- Login (basic auth), behind an auth port so Auth0 and others can plug in later
- Five audience views: Eng MBR, Director to Execs, EM to Director, EM to TL, TL to Team
- Team benchmark grid (teams × metrics) and org-level benchmark
- Team drill-down
- Developer experience surveys: define, share a link, collect anonymously
- Glossary, linked from every metric label
- Settings: benchmarks and the bar, team profiles, team mapping, time windows, data sources and polling
- Dummy data generator, then Jira, GitHub and JSM adapters

**Out of scope for v1**

- Product and business metrics (adoption, retention, revenue)
- Operational SLAs and SLOs (covered by the operational excellence dashboard)
- Slite
- Annotations (placeholder in the UI only)
- Roles and permissions beyond a single admin (the user model allows them later)

## Benchmarking model: raising the bar

Each metric has four levels (Elite, High, Medium, Low) and a bar: the level the Director expects teams to reach. Colour shows how many levels a team is from the bar. Raising the bar from High to Elite turns some green cells amber, which is the intended signal: the target moved, the team didn't get worse.

**Levels.** Each metric has thresholds for Elite, High and Medium, and anything worse is Low. Thresholds are pre-populated (see the metric catalogue) and editable in Settings.

**The bar.** Set per metric, default High. It can be set org-wide or per team profile.

**Colour by distance from the bar (default)**

| Distance from bar | Colour | Label in cell |
| --- | --- | --- |
| Above the bar | Blue | Above bar |
| At the bar | Green | At bar |
| One level below | Amber | Near bar |
| Two or more levels below | Red | Below bar |
| Too few data points | Grey | Not enough data |

With the default bar of High, this is identical to the original scheme (Elite blue, High green, Medium amber, Low red). Settings also offers "colour by level", which fixes Elite as blue regardless of the bar. Every colour is editable, and each cell shows a text label as well so it works for colour-blind readers.

**What a cell shows.** The value with units, the level name, and a trend arrow against the previous period of the same length. The arrow knows the direction of good: a falling lead time is an improving arrow. Hovering shows the gap, for example "Lead time 3.2 days; bar is under 1 day".

**Not a league table.**

- Rows are sorted by team name or a configured order, never by grade. There is no total score column and no rank.
- Clicking a cell opens the team drill-down at that metric's breakdown (for lead time: coding, pickup, review, deploy). The conversation starts from "where does the time go", not "why are you red".
- The org row at the bottom shows the whole engineering organisation against the same bar.

**Team profiles.** Thresholds can differ by team type. v1 ships two profiles, Product and Platform, and each team is assigned one in team mapping. Only a few metrics differ by default (for example deploy frequency); the rest inherit from Product.

**Versioning.** Each change to thresholds or bars creates a new benchmark version with an effective date ("Bar v2 from 1 Jan 2027"). The grid says which version it uses. Trend views can grade history either against the bar in force at the time or against today's bar, so raising the bar never rewrites how last quarter looked.

## Metric catalogue v1

v1 grades 16 team metrics across four groups and shows one, throughput, as context only. Thresholds for the DORA metrics follow the last published DORA tiers. The others are starting points to tune once there are 4 to 6 weeks of real data. Anything worse than Medium is Low.

**Speed and flow**

| Metric | Source | Unit (better) | Elite | High | Medium | Org aggregation | Min sample · default window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Deployment frequency | GitHub deployments | deploys per week (higher) | ≥ 7 | ≥ 1 | ≥ 0.25 | Sum of team deploys; also shown per team on average | 14 days · 30 days |
| Lead time for changes | GitHub | median hours, first commit to production (lower) | < 24 h | < 1 week | < 1 month | Median over all changes pooled | 10 changes · 30 days |
| PR cycle time | GitHub | median hours, PR opened to merged (lower) | < 24 h | < 3 days | < 7 days | Median over all PRs pooled | 10 PRs · 30 days |
| PR pickup time | GitHub | median hours, opened to first review (lower) | < 2 h | < 8 h | < 24 h | Median over all PRs pooled | 10 PRs · 30 days |
| PR size | GitHub | median lines changed (lower) | < 100 | < 250 | < 500 | Median over all PRs pooled | 10 PRs · 30 days |
| Work item cycle time | Jira | median days, In Progress to Done (lower) | < 3 days | < 7 days | < 14 days | Median over all items pooled | 10 items · 30 days |
| Flow efficiency | Jira | % of cycle time in active statuses (higher) | ≥ 40% | ≥ 25% | ≥ 15% | Total active time ÷ total cycle time, pooled | 10 items · 30 days |
| Ageing work in progress | Jira | % of in-progress items older than 14 days (lower) | < 10% | < 20% | < 35% | Pooled across all in-progress items | 5 items · end of window |
| Plan predictability | Jira sprints | % of committed items completed (higher) | ≥ 85% | ≥ 70% | ≥ 50% | Total completed ÷ total committed | 2 sprints · 60 days |
| Throughput | Jira | items done per week | not graded | not graded | not graded | Sum | none · 30 days |

**Stability and quality**

| Metric | Source | Unit (better) | Elite | High | Medium | Org aggregation | Min sample · default window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Change failure rate | JSM incidents + GitHub deployments | % of deploys causing an incident, rollback or hotfix (lower) | ≤ 5% | ≤ 10% | ≤ 15% | Failed deploys ÷ all deploys, pooled | 10 deploys · 90 days |
| Failed deployment recovery time | JSM | median hours to restore (lower) | < 1 h | < 24 h | < 1 week | Median over all incidents pooled | 3 incidents · 90 days |
| Deployment rework rate | GitHub | % of deploys that are unplanned fixes to production (lower) | ≤ 5% | ≤ 10% | ≤ 20% | Rework deploys ÷ all deploys, pooled | 10 deploys · 90 days |
| Escaped defects | Jira (bugs marked found in production) | production bugs per 100 changes (lower) | < 2 | < 5 | < 10 | Total bugs ÷ total changes × 100 | 20 changes · 90 days |

**Investment**

| Metric | Source | Unit (better) | Elite | High | Medium | Org aggregation | Min sample · default window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| New capability share | Jira issue type and labels | % of done work on new capability, vs maintenance, defects and tech debt (higher) | ≥ 60% | ≥ 50% | ≥ 35% | Pooled by items done | 10 items · 90 days |
| Unplanned work | Jira | % of done items added after sprint or cycle start (lower) | < 10% | < 20% | < 30% | Pooled | 10 items · 30 days |

**Developer experience**

| Metric | Source | Unit (better) | Elite | High | Medium | Org aggregation | Min sample · default window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Developer experience score | Surveys | 0–100 index from the core survey questions (higher) | ≥ 75 | ≥ 65 | ≥ 50 | Mean over all responses | 4 responses · latest survey |

**Throughput is not graded.** It depends on how work is sliced, so a grade would reward splitting tickets. It is shown as a trend only.

**Aggregation rules (also written into the glossary).** Org figures are computed from all events pooled together, not by averaging team results. An average of team medians gives a two-person team the same weight as a twelve-person team and hides the shape of the distribution. Counts are summed, rates are total numerator over total denominator, and durations are the median of every event in the org. Each metric's glossary entry states its rule and gives a worked example.

**Time windows.** Settings holds a global default window (30 days) and a default per screen. Each metric also has a minimum window and a minimum sample (the last column above). When a team falls below the minimum, its cell shows grey with "not enough data" and the count, rather than a grade.

**Definitions that need setting up per source** (all in Settings, pre-filled for the dummy data): which GitHub environment counts as production, which Jira statuses are active vs waiting, which labels mark found-in-production bugs and hotfixes, and which issue types map to each investment category.

## Screens and navigation

The app has 12 screens behind a login, reached from a left-hand nav grouped into Benchmarks, Audience views, Surveys, Glossary and Settings.

**On every screen**

- Time range picker: last 7, 14, 30 or 90 days, quarter to date, or a custom range. Each screen opens on its default from Settings, and every view can compare against the previous period of the same length.
- Benchmark version label ("Graded against Bar v1").
- An info link beside every metric name that opens its glossary entry.
- An annotations slot on every trend chart, marked "coming soon" in v1.
- A "data as of" timestamp from the last successful poll.

**Benchmarks**

| Screen | What it answers | Main content |
| --- | --- | --- |
| Team benchmark | Where is each team against the bar? | Grid of teams × metrics, coloured by distance from bar, with value, level and trend arrow. Org row at the foot. Filter by group or profile. Clicking a cell opens the team drill-down. |
| Org benchmark | Is engineering as a whole moving towards the bar? | The org row on its own, plus a grid of metrics × months coloured the same way, and "teams at or above bar" per metric (a count, no names). |
| Team drill-down | Where does this team's time go? | Every metric for one team with trend and bar line. Breakdowns: lead time by stage (coding, pickup, review, deploy), PR size distribution, cycle time scatter, investment mix. |

**Audience views** (top down through the org)

| Screen | Persona's question | Main content |
| --- | --- | --- |
| Eng MBR | How has engineering trended this month and quarter? | Org benchmark summary, 12-month trends for the five DORA metrics, new capability share and DevEx score, month on month and quarter on quarter. |
| Director to Execs | Are we delivering faster and more safely, on the right work? | Six headline metrics (deploy frequency, lead time, change failure rate, recovery time, new capability share, DevEx score) with trend vs last quarter and teams at bar. |
| EM to Director | How are my teams doing against the bar? | Benchmark grid filtered to the EM's group, with each team's trend against its own baseline. |
| EM to TL | Where can this team improve? | The team drill-down, framed as "furthest from bar" and "most improved". |
| TL to Team | What is stuck right now? | Ageing work items, PRs waiting for review, PR sizes this week, sprint progress. Bar lines shown, no red or green grid. |

**Surveys, glossary and admin**

| Screen | Main content |
| --- | --- |
| Login | Username and password (basic auth in v1), the team-level-only statement. |
| Surveys | Survey builder, campaigns, share links, response counts, results by team (see Developer experience surveys). |
| Glossary | One entry per metric: definition, formula, source and fields, what high and low mean, aggregation rule with a worked example, watch-outs, and its counterpart metric. Opens with the principles. |
| Settings | Tabs for: Benchmarks and bars (levels, thresholds, bar per metric, colours, versions); Team profiles; Team mapping; Time windows and screen defaults; Data sources, field mappings and poll schedule; Users. |

**Team mapping screen.** Create teams and groups (an EM's set of teams), assign a profile, and map Jira boards or projects, GitHub repos and JSM services to each team. Every mapping carries an effective-from date, so a repo moved in a reorg counts for its old team before the date and its new team after. A team can be archived without losing its history.

**Data sources screen.** Connection details, the poll schedule (default every 6 hours), last run status per source, a "run now" button, and a backfill window for the first sync (default 12 months).

## Developer experience surveys

The Director defines a survey, opens a campaign, and shares one link per team. Answers are stored with the team and nothing else, and a team's results stay hidden until at least 4 people have answered.

**Builder.** Question types: agreement scale (1–5), 0–10 scale, single choice and free text. Each scale question can be tagged as part of the DevEx score. v1 ships a core template, editable before a campaign starts and locked once it opens, so results stay comparable.

**Core template** (1–5 agreement, all in the DevEx score)

1. I can usually get into focused work without being interrupted.
2. Getting my code reviewed is quick enough that it doesn't block me.
3. Builds and tests give me feedback quickly.
4. Releasing a change to production is easy and low-risk.
5. I understand the systems I work on well enough to change them with confidence.
6. Our tools and environments help me rather than slow me down.
7. I know what the priorities are and why.

Plus one 0–10 question outside the score ("How likely are you to recommend working on this team?") and one optional free-text question ("What one change would most improve your day-to-day work?").

**DevEx score.** The mean of the score questions, scaled from 1–5 to 0–100. Each question's result is also shown on its own, which is where the useful conversation is.

**Campaigns.** A campaign has a survey, open and close dates, and the teams included. Each team gets its own unguessable link that needs no login, so respondents never pick a team. In v1 the Director copies links to send; sending by email or Slack comes later. Response rate uses the team headcount entered in team mapping.

**Anonymity rules**

- No name, email, IP address or browser details are stored. Submission times are rounded to the day.
- Team results appear only at 4 or more responses (configurable, never below 3). Below that, the team is shown only within its group's results, and its responses still count towards group and org results.
- Free-text answers are shown only when the team meets the minimum, in random order.
- A browser cookie discourages repeat submissions. It is not foolproof; the survey page says so honestly rather than promising more.

## Data model, polling and architecture

The app stores raw events from each source and computes metrics from them when a screen asks. At about 10 teams this is a few thousand PRs and work items a year, so on-read computation with a cache is fast enough and needs no data warehouse.

**Hexagonal layout**

- **Domain** (no framework or I/O): event types, teams and effective-dated mappings, the metric definition registry, benchmark versions, and pure functions for calculating, aggregating and grading.
- **Application** (use cases): sync a source; get the benchmark grid; get the org trend; get a team drill-down; publish a benchmark version; manage team mapping; run a survey campaign; submit a survey response; log in.
- **Driven ports:** delivery source (deployments, PRs), work source (issues, transitions, sprints), incident source, event store, configuration store, auth provider, clock.
- **Adapters:** a fake source (dummy data) first, then GitHub, Jira and JSM; Postgres for storage; basic auth first, Auth0 later; an HTTP API and a scheduled worker as driving adapters; a web UI.

Driving adapters (Web UI, HTTP API, scheduled worker) call the application layer; the application layer reaches the fake source, real sources, Postgres and auth only through ports. The fake source and the real sources sit behind the same ports, so switching from dummy to real data changes no core code. Dependencies point inward: the domain imports nothing from any adapter.

The metric definition registry is the single source of truth. Each entry holds the calculation, unit, direction of good, aggregation rule, minimum sample and glossary text, so the glossary page is generated from the same code that computes the numbers.

**Stored data**

| Entity | Holds |
| --- | --- |
| Deployment | Repo, environment, time, commit SHAs, whether it was a rework deploy |
| Pull request | Repo, opened, first review, merged times, lines changed, first commit time, linked deployment |
| Work item | Key, type, labels, board, created, status transitions with times, sprint membership, found-in-production flag |
| Sprint | Board, start and end, committed items, completed items |
| Incident | Service, start, restored time, linked deployment |
| Survey response | Campaign, team, answers, day submitted |
| Team, group, profile | Names, EM group, profile, headcount, archived flag |
| Mapping | Team ↔ repo, board or service, effective from and to |
| Benchmark version | Thresholds per metric and profile, bar per metric, colours, effective date |
| Sync run | Source, started, finished, cursor, status, error |

Events carry no author names. The sources do expose authors, but the adapters drop them on the way in, which enforces the team-only rule in the data, not just the UI.

**Polling.** A worker polls each source on a schedule (default every 6 hours) for items updated since the last cursor, and upserts by source id, so a repeated run is harmless. The first run backfills 12 months. Each run is logged and shown on the data sources screen.

**Computing and caching.** A metric value is computed for a team or the org, over a window, from events whose mapping was in force at the time. Results are cached against the definitions version, mapping version and the latest sync, so a change to any of them refreshes the numbers.

**Auth.** v1 uses username and password with hashed passwords and a session cookie, behind an auth provider port. Auth0 (OIDC) is a second adapter later. Survey links bypass login but can only submit a response.

## Dummy data plan

Dummy data comes from a fake source adapter that implements the same ports as GitHub, Jira and JSM, so the whole pipeline (polling, storage, calculation, grading) runs for real from day one. It generates 12 months of raw events for 10 fictional teams from a fixed seed, so every run gives the same numbers and the tests can rely on them.

**Teams and what each one exercises**

| Team | Profile | Engineers | Behaviour | Tests |
| --- | --- | --- | --- | --- |
| Aurora | Product | 7 | Steady, above the bar on most metrics | Blue cells |
| Birch | Product | 6 | Steady, at the bar | Green cells |
| Comet | Product | 8 | Deploys many times a day but with a high change failure rate | Speed and stability pairing |
| Delta | Product | 6 | Legacy system: large PRs, long lead time, weekly releases | Red cells and lead time breakdown |
| Ember | Platform | 5 | Few deploys of its own, fast recovery | Platform profile thresholds |
| Fjord | Product | 6 | Mobile release train: weekly deploys, long lead time | Long waits in the deploy stage |
| Garnet | Product | 7 | Improves steadily from red to green over 12 months | Improving trend arrows |
| Harbour | Product | 6 | Slides from green to amber after losing two repos | Sliding trend, reorg history |
| Iris | Product | 2 | Very low volume | Grey "not enough data" cells |
| Juniper | Product | 5 | New team formed 4 months ago, takes over two repos from Harbour | Effective-dated mapping, partial history |

**Generated events.** Per team: PRs with opened, first review and merge times drawn from the team's distributions; deployments (some marked rework); work items with status transitions through active and waiting statuses; two-week sprints with committed and completed items; incidents linked to deployments at the team's failure rate; and quarterly survey campaigns, with Iris below the 4-response minimum.

**Benchmark history.** Bar v1 applies from the start. Bar v2, three months ago, raises the lead time bar from High to Elite, so some green lead time cells turn amber, which shows the bar-raising behaviour.

**Simulated polling.** "Run now" on the data sources screen makes the fake source emit the next day of events, so incremental sync, cursors and the "data as of" timestamp can be tested before any real connection.

## Testing strategy

Three layers: unit tests on the pure domain, integration tests on each adapter, and use-case tests that run the major journeys end to end against the seeded dummy data.

**Unit tests (domain, no I/O)**

- Each metric calculation, with hand-built event sets and known answers
- Aggregation rules, including a test showing pooled median differs from the mean of team medians
- Grading: each level boundary, direction of good, distance from bar, minimum sample producing "not enough data"
- Trend direction for metrics where lower is better
- Mapping resolution across an effective date

**Integration tests (adapters)**

- Postgres repositories against a real database in a container
- Fake source through the sync use case: cursors, idempotent re-runs, backfill
- GitHub, Jira and JSM adapters against recorded API responses, including dropping author fields
- Basic auth: login, logout, session expiry, wrong password

**Use-case tests (the journeys that must always work)**

- The Director opens the team benchmark for the last 30 days and sees each team graded against the bar, with Iris shown as not enough data.
- Raising the lead time bar from High to Elite creates Bar v2 and changes the affected cells' colours without fetching any data.
- Moving two repos from Harbour to Juniper with an effective date keeps Harbour's earlier history and gives Juniper the later events.
- The org benchmark matches figures computed by hand from the pooled seed events.
- A survey campaign collects responses through a team link without login, stores no identity, and hides a team below 4 responses.
- Changing a screen's default time range in Settings changes what that screen opens on.
- Every metric shown on any screen has a glossary entry, and every glossary entry matches a registered metric.

## Open decisions and next steps

Both early decisions are made, so the build can start in Claude Code. The dummy data stage needs none of the source questions answered.

**Decided**

- **Stack.** TypeScript throughout, with a Fastify API and worker, a React UI, Postgres, and Docker Compose for local running.
- **Survey minimum.** 4 responses, with teams below that shown only within their group.

**Decided while building steps 1–3** (revisit if they don't suit)

- **Change** = a pull request that reached production. Lead time is first commit to the production deployment; escaped defects are per 100 such changes.
- **Change failure rate** = production deploys with a linked incident or flagged rollback ÷ all production deploys. **Rework rate** (hotfix deploys) is separate, so the two don't double count.
- **Deployment frequency and throughput** divide by the days the team was actually mapped inside the window, so a new team isn't diluted. The org figure is the sum, **graded on the per-team average**.
- **Minimum sample for deployment frequency** (14 days) is days of mapping coverage, not number of deploys, so a very quiet team with a weekly deploy is still graded.
- **Platform profile** differs from Product on deployment frequency only (Elite ≥ 2, High ≥ 0.5, Medium ≥ 0.1 per week).
- **Trend** is "steady" within ±5 % relative change of the previous period; throughput shows movement but is never judged.
- **DevEx score** uses the team's latest campaign as of the end of the window, so the previous period compares against the previous campaign.
- **Survey responses** in the dummy data are written straight to the event store by the seeder; there is no survey source port.
- **Incident to deployment link** is by deployment id; a deployment's failure is looked up across all teams, so a reorg boundary can't hide an incident.

**Decisions needed before real data**

- Do pipelines record production deploys as GitHub deployments or environments? If not, which system does?
- How will JSM incidents link to the deployment that caused them (a field, a label, or a time-window match)?
- Jira conventions: the found-in-production label, the hotfix label, which statuses are active vs waiting, and which issue types map to each investment category.
- Where it will be hosted, and whether security review is needed before storing Jira, GitHub and JSM data.
- Review the default thresholds after 4 to 6 weeks of real data.

**Build order**

1. Repo scaffold and a `CLAUDE.md` built from this spec (hexagonal layout, test layers, team-only rule).
2. Domain: event types, metric registry, aggregation and grading, with unit tests.
3. Fake source, Postgres storage and the sync use case, with integration tests.
4. Login, team benchmark, org benchmark, glossary and Settings, with the first use-case tests.
5. Team drill-down and the five audience views.
6. Surveys.
7. GitHub, Jira and JSM adapters, then switch from dummy to real data team by team.
