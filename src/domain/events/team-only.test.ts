import { describe, expect, it } from 'vitest';
import { deployment, incident, item, pr, response, sprint } from '../testing/fixtures';

const FORBIDDEN = /author|assignee|reviewer|committer|email|username|user_?name|ip_?address|user_?agent|person|reporter|owner/i;

function keysOf(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysOf(v, out);
    }
  }
  return out;
}

describe('team-only rule', () => {
  it('no event shape has a person-identifying field', () => {
    const samples = [
      deployment(),
      pr(),
      item([['In Progress', 1], ['Done', 2]], { sprintMemberships: [{ sprintId: 's', addedAt: 0 }] }),
      sprint(),
      incident(),
      response(),
    ];
    const bad = samples.flatMap((s) => keysOf(s)).filter((k) => FORBIDDEN.test(k));
    expect(bad).toEqual([]);
  });
});
