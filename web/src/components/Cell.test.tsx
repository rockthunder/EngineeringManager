import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { CellView } from '@contract';
import { Cell } from './Cell';

const base: CellView = {
  metricId: 'lead_time', valueText: '3.2 days', value: 77, levelName: 'High', colour: 'amber', detail: 'High · Near bar',
  label: 'Near bar', distance: -1, status: 'graded', sampleSize: 30, minSample: null,
  trend: { arrow: 'down', judgement: 'improving', text: 'Improving: down 18% on the previous period' },
  tooltip: 'Lead time for changes 3.2 days, High (1 level below the bar); bar is under 1 day (Elite)',
};

const renderCell = (cell: CellView, to?: string) =>
  render(<MemoryRouter><table><tbody><tr><Cell cell={cell} {...(to ? { to } : {})} /></tr></tbody></table></MemoryRouter>);

describe('Cell', () => {
  it('shows value, level and a text label, so colour is never the only signal', () => {
    renderCell(base);
    expect(screen.getByText('3.2 days')).toBeInTheDocument();
    expect(screen.getByText('High · Near bar')).toBeInTheDocument();
  });

  it('carries the colour key and the hover explanation', () => {
    const { container } = renderCell(base);
    const td = container.querySelector('td')!;
    expect(td).toHaveClass('c-amber');
    expect(td).toHaveAttribute('title', base.tooltip);
  });

  it('shows a falling lead time as an improving arrow, described in words', () => {
    renderCell(base);
    const arrow = screen.getByRole('img', { name: /Improving: down 18%/ });
    expect(arrow).toHaveTextContent('▲');
    expect(arrow).toHaveClass('t-improving');
  });

  it('greys out a small sample and shows the count instead of a grade', () => {
    renderCell({
      ...base, valueText: 'Not enough data', colour: 'grey', detail: '7 of 10 PRs', label: 'Not enough data', levelName: null,
      distance: null, status: 'insufficient_data', minSample: 10, trend: null,
    });
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByText('7 of 10 PRs')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows neutral metrics’ movement without judging it', () => {
    renderCell({
      ...base, colour: 'none', status: 'not_graded', levelName: null, detail: 'Context only',
      trend: { arrow: 'up', judgement: 'not_judged', text: 'Up 40% on the previous period (context only)' },
    });
    expect(screen.getByRole('img', { name: /context only/ })).toHaveTextContent('↑');
  });

  it('links to the drill-down when given a target', () => {
    renderCell(base, '/teams/birch?metric=lead_time');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/teams/birch?metric=lead_time');
  });
});
