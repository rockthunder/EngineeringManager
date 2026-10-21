import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PageContext } from '@contract';
import { Toolbar } from './Toolbar';
import type { ViewParams } from '../useViewParams';

const params: ViewParams = {
  range: undefined, from: undefined, to: undefined, compare: true, version: 'in_force', group: undefined, profile: undefined,
};
const context: PageContext = {
  endDay: '2026-10-21', benchmarkVersion: 2, benchmarkEffectiveFrom: '2026-07-21', dataAsOf: '2026-10-21T12:00:00.000Z',
  colourMode: 'distance', colours: {}, range: '30',
};

describe('Toolbar', () => {
  it('highlights the range the screen opened on and labels the benchmark version and data age', () => {
    render(<Toolbar context={context} params={params} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Graded against Bar v2')).toBeInTheDocument();
    expect(screen.getByText(/Data as of 21 Oct 2026/)).toBeInTheDocument();
  });

  it('offers every range from the spec', () => {
    render(<Toolbar context={context} params={params} onChange={() => {}} />);
    for (const name of ['7 days', '14 days', '30 days', '90 days', 'Quarter to date', 'Metric default', 'Custom']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('reports a range change and the compare toggle', async () => {
    const onChange = vi.fn();
    render(<Toolbar context={context} params={params} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(onChange).toHaveBeenLastCalledWith({ range: '90' });
    await userEvent.click(screen.getByRole('checkbox', { name: /Compare with previous period/ }));
    expect(onChange).toHaveBeenLastCalledWith({ compare: false });
  });

  it('shows date inputs for a custom range and applies them', async () => {
    const onChange = vi.fn();
    render(<Toolbar context={{ ...context, range: 'custom' }} params={{ ...params, range: 'custom' }} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/From/), '2026-09-01');
    await userEvent.type(screen.getByLabelText(/To/), '2026-09-30');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenLastCalledWith({ range: 'custom', from: '2026-09-01', to: '2026-09-30' });
  });

  it('lets history be graded against the bar then or today’s bar', async () => {
    const onChange = vi.fn();
    render(<Toolbar context={context} params={params} onChange={onChange} showVersion />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'today');
    expect(onChange).toHaveBeenLastCalledWith({ version: 'today' });
  });
});
