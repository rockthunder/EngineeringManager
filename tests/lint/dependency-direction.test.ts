import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

async function lint(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.severity === 2).map((m) => m.message);
}

describe('dependency-direction lint rules', () => {
  it('rejects domain importing application', async () => {
    const msgs = await lint(
      "import { x } from '../../application/ports/clock';\nexport const y = x;\n",
      'src/domain/teams/bad.ts',
    );
    expect(msgs.join('\n')).toMatch(/domain must not import application/);
  });

  it('rejects domain importing adapters', async () => {
    const msgs = await lint(
      "import { buildApp } from '../../adapters/driving/http/app';\nexport const y = buildApp;\n",
      'src/domain/teams/bad.ts',
    );
    expect(msgs.join('\n')).toMatch(/domain must not import adapters/);
  });

  it('rejects application importing adapters', async () => {
    const msgs = await lint(
      "import { buildApp } from '../../adapters/driving/http/app';\nexport const y = buildApp;\n",
      'src/application/use-cases/bad.ts',
    );
    expect(msgs.join('\n')).toMatch(/application must not import adapters/);
  });

  it('rejects packages and node builtins in domain', async () => {
    const msgs = await lint("import { Pool } from 'pg';\nexport const p = Pool;\n", 'src/domain/events/bad.ts');
    expect(msgs.join('\n')).toMatch(/domain is pure TypeScript/);
  });

  it('rejects ambient time and randomness in domain', async () => {
    const msgs = await lint(
      'export const a = Date.now();\nexport const b = new Date();\nexport const c = Math.random();\n',
      'src/domain/events/bad.ts',
    );
    expect(msgs.filter((m) => /Clock|PRNG/.test(m))).toHaveLength(3);
  });

  it('rejects web importing anything from src except the contract', async () => {
    const bad = await lint(
      "import { REGISTRY } from '../../src/domain/metrics/registry';\nexport const r = REGISTRY;\n",
      'web/src/bad.ts',
    );
    expect(bad.join('\n')).toMatch(/web talks to the API only/);
    const ok = await lint(
      "import type { GridView } from '../../src/application/views/contract';\nexport type G = GridView;\n",
      'web/src/ok.ts',
    );
    expect(ok.filter((m) => /web talks to the API only/.test(m))).toEqual([]);
  });

  it('allows adapters to import application and domain', async () => {
    const msgs = await lint(
      "import type { Day } from '../../../domain/time/day';\nexport type D = Day;\n",
      'src/adapters/driven/postgres/ok.ts',
    );
    expect(msgs.filter((m) => /must not import/.test(m))).toEqual([]);
  });
});
