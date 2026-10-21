-- Team-only rule: no table below has an author, assignee, reviewer, email or any person column.
-- Raw events carry no team: a team is derived at read time from effective-dated mappings.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Teams and mappings ─────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE groups (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE teams (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  profile_id text NOT NULL REFERENCES profiles (id),
  group_id   text NOT NULL REFERENCES groups (id),
  headcount  integer NOT NULL CHECK (headcount >= 0),
  archived   boolean NOT NULL DEFAULT false
);

CREATE TABLE team_mappings (
  id             bigserial PRIMARY KEY,
  team_id        text NOT NULL REFERENCES teams (id),
  kind           text NOT NULL CHECK (kind IN ('repo', 'board', 'service')),
  ref            text NOT NULL,
  effective_from date NOT NULL,
  effective_to   date,
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- A repo/board/service belongs to at most one team at any time: a reorg hands over, never duplicates.
  CONSTRAINT mapping_no_overlap EXCLUDE USING gist (
    kind WITH =, ref WITH =, daterange(effective_from, effective_to, '[)') WITH &&
  )
);

-- ── Configuration ──────────────────────────────────────────────────────────────
CREATE TABLE source_definitions (
  version    serial PRIMARY KEY,
  created_at timestamptz NOT NULL,
  payload    jsonb NOT NULL
);

-- Benchmark versions are immutable and effective-dated.
CREATE TABLE benchmark_versions (
  number         integer PRIMARY KEY,
  effective_from date NOT NULL UNIQUE,
  payload        jsonb NOT NULL
);

CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER benchmark_versions_immutable
  BEFORE UPDATE OR DELETE ON benchmark_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ── Raw events (upserted by source id; never regress source_updated_at) ────────
CREATE TABLE deployments (
  source            text NOT NULL,
  source_id         text NOT NULL,
  repo              text NOT NULL,
  environment       text NOT NULL,
  at                timestamptz NOT NULL,
  commit_shas       text[] NOT NULL DEFAULT '{}',
  is_rework         boolean NOT NULL,
  is_rollback       boolean NOT NULL,
  source_updated_at timestamptz NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX deployments_at_idx ON deployments (at);

CREATE TABLE pull_requests (
  source               text NOT NULL,
  source_id            text NOT NULL,
  repo                 text NOT NULL,
  first_commit_at      timestamptz NOT NULL,
  opened_at            timestamptz NOT NULL,
  first_review_at      timestamptz,
  merged_at            timestamptz,
  lines_changed        integer NOT NULL,
  deployment_source_id text,
  source_updated_at    timestamptz NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX pull_requests_opened_idx ON pull_requests (opened_at);

CREATE TABLE work_items (
  source             text NOT NULL,
  source_id          text NOT NULL,
  key                text NOT NULL,
  type               text NOT NULL,
  labels             text[] NOT NULL DEFAULT '{}',
  board              text NOT NULL,
  created_at         timestamptz NOT NULL,
  found_in_production boolean NOT NULL,
  last_transition_at timestamptz,
  final_status       text,
  source_updated_at  timestamptz NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX work_items_created_idx ON work_items (created_at);

CREATE TABLE status_transitions (
  source      text NOT NULL,
  item_id     text NOT NULL,
  seq         integer NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  at          timestamptz NOT NULL,
  PRIMARY KEY (source, item_id, seq),
  FOREIGN KEY (source, item_id) REFERENCES work_items (source, source_id) ON DELETE CASCADE
);

CREATE TABLE sprint_memberships (
  source    text NOT NULL,
  item_id   text NOT NULL,
  sprint_id text NOT NULL,
  added_at  timestamptz NOT NULL,
  PRIMARY KEY (source, item_id, sprint_id),
  FOREIGN KEY (source, item_id) REFERENCES work_items (source, source_id) ON DELETE CASCADE
);

CREATE TABLE sprints (
  source              text NOT NULL,
  source_id           text NOT NULL,
  board               text NOT NULL,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  committed_item_ids  text[] NOT NULL DEFAULT '{}',
  completed_item_ids  text[] NOT NULL DEFAULT '{}',
  source_updated_at   timestamptz NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX sprints_end_idx ON sprints (end_at);

CREATE TABLE incidents (
  source               text NOT NULL,
  source_id            text NOT NULL,
  service              text NOT NULL,
  started_at           timestamptz NOT NULL,
  restored_at          timestamptz,
  deployment_source_id text,
  source_updated_at    timestamptz NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX incidents_started_idx ON incidents (started_at);

-- ── Surveys: anonymous by construction ─────────────────────────────────────────
-- No name, email, IP or user agent; submission time is a day, not an instant.
CREATE TABLE survey_responses (
  id            text PRIMARY KEY,
  campaign_id   text NOT NULL,
  team_id       text NOT NULL REFERENCES teams (id),
  submitted_day date NOT NULL,
  score_answers smallint[] NOT NULL,
  other_answers jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX survey_responses_team_idx ON survey_responses (team_id, campaign_id);

-- ── Sync bookkeeping ───────────────────────────────────────────────────────────
CREATE TABLE sync_runs (
  id            bigserial PRIMARY KEY,
  source        text NOT NULL,
  stream        text NOT NULL,
  started_at    timestamptz NOT NULL,
  finished_at   timestamptz,
  cursor_before text,
  cursor_after  text,
  status        text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  error         text,
  upserted      integer NOT NULL DEFAULT 0
);
CREATE INDEX sync_runs_stream_idx ON sync_runs (source, stream, id DESC);
