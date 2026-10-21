import type { Clock } from '../../../application/ports/clock';
import type { ConfigStore } from '../../../application/ports/config-store';
import type { EventStore } from '../../../application/ports/event-store';
import type { SettingsStore } from '../../../application/ports/settings-store';
import type { SurveyStore } from '../../../application/ports/survey-store';
import { cryptoIds } from '../crypto-ids/crypto-ids';
import type { SyncStore } from '../../../application/ports/sync-store';
import { dayToInstant, instantToDay, MS_PER_HOUR, type Day } from '../../../domain/time/day';
import { FakeSource } from './fake-source';
import { DEFAULT_SEED, seedDummyData } from './seed';

interface SimState {
  readonly anchorDay: Day;
  readonly watermarkDay: Day;
}

const KEY = 'sim';

export interface SimStores {
  readonly config: ConfigStore;
  readonly events: EventStore;
  readonly sync: SyncStore;
  readonly settings: SettingsStore;
  readonly surveys: SurveyStore;
}

/**
 * The dummy world: a seeded fake source plus a simulated clock that always reads noon on the
 * source's watermark day. "Run now" advances both, so windows, trends and "data as of" stay
 * coherent. State persists in settings, so restarting the API never rewinds the world.
 */
export class SimWorld {
  private constructor(
    readonly source: FakeSource,
    private state: SimState,
    private readonly stores: SimStores,
  ) {}

  readonly clock: Clock = { now: () => dayToInstant(this.state.watermarkDay) + 12 * MS_PER_HOUR };

  get watermarkDay(): Day {
    return this.state.watermarkDay;
  }

  /** Load the world, seeding an empty database first. `realNow` only picks the anchor day on first boot. */
  static async boot(stores: SimStores, realNow: number): Promise<SimWorld> {
    let state = await stores.settings.get<SimState>(KEY);
    const seeded = (await stores.config.loadOrganisation()).teams.length > 0;

    if (!state && seeded) {
      // Seeded before sim state existed: the last sync ran at the anchor.
      const runs = await stores.sync.listRuns();
      const last = runs[runs.length - 1];
      const day = instantToDay(last?.finishedAt ?? realNow);
      state = { anchorDay: day, watermarkDay: day };
    }
    const anchorDay = state?.anchorDay ?? instantToDay(realNow);
    const source = new FakeSource({ seed: DEFAULT_SEED, anchorDay });
    const world = new SimWorld(source, { anchorDay, watermarkDay: anchorDay }, stores);

    if (!seeded) await seedDummyData(stores, source, world.clock, cryptoIds);
    while (world.state.watermarkDay < (state?.watermarkDay ?? anchorDay)) {
      source.simulateNextDay();
      world.state = { ...world.state, watermarkDay: source.watermark };
    }
    await stores.settings.set(KEY, world.state);
    return world;
  }

  /** Reveal one more simulated day; the clock moves with it. */
  async advance(): Promise<void> {
    const day = this.source.simulateNextDay();
    this.state = { ...this.state, watermarkDay: day };
    await this.stores.settings.set(KEY, this.state);
  }
}
