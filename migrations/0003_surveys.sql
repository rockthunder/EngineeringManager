-- Developer experience surveys. Responses live in survey_responses (see 0001): anonymous by construction.
CREATE TABLE surveys (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  questions jsonb NOT NULL
);

CREATE TABLE campaigns (
  id        text PRIMARY KEY,
  survey_id text NOT NULL REFERENCES surveys (id),
  name      text NOT NULL,
  opens     date NOT NULL,
  closes    date NOT NULL CHECK (closes >= opens),
  status    text NOT NULL CHECK (status IN ('draft', 'open', 'closed'))
);

-- One unguessable link per team: the token resolves to (campaign, team) and nothing else,
-- so respondents never pick a team and need no login. Null until the campaign opens.
CREATE TABLE campaign_teams (
  campaign_id text NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  team_id     text NOT NULL REFERENCES teams (id),
  token       text UNIQUE,
  PRIMARY KEY (campaign_id, team_id)
);
