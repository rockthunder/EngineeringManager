import type {
  DeliverySource, FetchRequest, IncidentSource, Page, SourceSet, WorkSource,
} from '../../../application/ports/source';
import type { SourceRef } from '../../../domain/events/types';
import { dayToInstant, type Day } from '../../../domain/time/day';
import { addDays } from './dates';
import { generateWorld, type World } from './generator';
import { dummyScenario, type Scenario } from './scenario';
import { snapshotAt, type Snapshot } from './snapshot';

export interface FakeSourceOptions {
  readonly seed: number;
  /** The last day of generated history; "today" for the dummy world. */
  readonly anchorDay: Day;
  /** Extra simulated days that `simulateNextDay` can reveal. */
  readonly futureDays?: number;
}

export const FAKE_SOURCE = 'fake';

const cursorKey = (r: SourceRef) => `${r.updatedAt}|${r.sourceId}`;

function parseCursor(c: string): [number, string] {
  const i = c.indexOf('|');
  return [Number(c.slice(0, i)), c.slice(i + 1)];
}

function after(r: SourceRef, cursor: [number, string]): boolean {
  return r.updatedAt > cursor[0] || (r.updatedAt === cursor[0] && r.sourceId > cursor[1]);
}

/**
 * Deterministic dummy data behind the same source ports the real GitHub/Jira/JSM adapters will
 * implement. Items are served as they stood at the current watermark day; the cursor is the
 * (updatedAt, sourceId) of the last item returned.
 */
export class FakeSource implements DeliverySource, WorkSource, IncidentSource {
  readonly scenario: Scenario;
  private readonly world: World;
  private readonly lastDay: Day;
  private watermarkDay: Day;
  private cached: { day: Day; snap: Snapshot } | null = null;

  constructor(readonly options: FakeSourceOptions) {
    this.scenario = dummyScenario(options.anchorDay);
    this.lastDay = addDays(options.anchorDay, options.futureDays ?? 60);
    this.world = generateWorld({
      seed: options.seed,
      startDay: this.scenario.historyStart,
      endDay: this.lastDay,
      plan: this.scenario.plan,
    });
    this.watermarkDay = options.anchorDay;
  }

  get watermark(): Day {
    return this.watermarkDay;
  }

  /** "Run now": the source emits one more simulated day of events. */
  simulateNextDay(): Day {
    if (this.watermarkDay >= this.lastDay) throw new Error('No more simulated days');
    this.watermarkDay = addDays(this.watermarkDay, 1);
    return this.watermarkDay;
  }

  asSourceSet(): SourceSet {
    return { name: FAKE_SOURCE, delivery: this, work: this, incident: this };
  }

  private snapshot(): Snapshot {
    if (this.cached?.day !== this.watermarkDay) {
      this.cached = { day: this.watermarkDay, snap: snapshotAt(this.world, this.watermarkDay) };
    }
    return this.cached.snap;
  }

  private page<T extends SourceRef>(all: readonly T[], req: FetchRequest): Promise<Page<T>> {
    const since = dayToInstant(req.sinceDay);
    const cursor = req.cursor === null ? null : parseCursor(req.cursor);
    const eligible = all
      .filter((x) => (cursor ? after(x, cursor) : x.updatedAt >= since))
      .sort((a, b) => a.updatedAt - b.updatedAt || (a.sourceId < b.sourceId ? -1 : 1));
    const items = eligible.slice(0, req.pageSize);
    const last = items[items.length - 1];
    return Promise.resolve({
      items,
      nextCursor: last ? cursorKey(last) : req.cursor,
      hasMore: eligible.length > items.length,
    });
  }

  fetchDeployments(req: FetchRequest) { return this.page(this.snapshot().deployments, req); }
  fetchPullRequests(req: FetchRequest) { return this.page(this.snapshot().pullRequests, req); }
  fetchWorkItems(req: FetchRequest) { return this.page(this.snapshot().workItems, req); }
  fetchSprints(req: FetchRequest) { return this.page(this.snapshot().sprints, req); }
  fetchIncidents(req: FetchRequest) { return this.page(this.snapshot().incidents, req); }
}
