import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ValidationBanner } from '../components/ValidationBanner';
import type { ValidationReport } from '../types';

const report = (violations: ValidationReport['violations']): ValidationReport => ({
  trip_id: 1,
  valid: !violations.some((v) => v.severity === 'hard'),
  hard_violation_count: violations.filter((v) => v.severity === 'hard').length,
  soft_violation_count: violations.filter((v) => v.severity === 'soft').length,
  violations,
});

describe('ValidationBanner', () => {
  it('shows success when nothing is violated', async () => {
    await render(<ValidationBanner report={report([])} />);
    expect(screen.getByText('All constraints satisfied')).toBeTruthy();
    expect(screen.queryByText('Details')).toBeNull();
  });

  it('always lists hard problems; preference warnings and data notes are under Details', async () => {
    await render(
      <ValidationBanner
        report={report([
          { severity: 'hard', code: 'MUST_VISIT_MISSING', message: 'Must-visit place ID 5 was not scheduled in any day.' },
          { severity: 'soft', code: 'NO_ACTIVITIES', message: 'Day 3: no activities were scheduled.' },
          { severity: 'info', code: 'ESTIMATED_TRAVEL_TIME', message: 'Travel times are straight-line estimates.' },
        ])}
        extra="Optimizer: no plan satisfies all of your constraints"
      />,
    );
    expect(screen.getByText('Not valid: 1 constraint problem')).toBeTruthy();
    expect(screen.getByText('Optimizer: no plan satisfies all of your constraints')).toBeTruthy();
    expect(screen.getByText(/Must-visit place ID 5/)).toBeTruthy();          // visible without tapping
    expect(screen.queryByText(/no activities were scheduled/)).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    expect(screen.getByText('Preference warnings')).toBeTruthy();
    expect(screen.getByText(/no activities were scheduled/)).toBeTruthy();
    expect(screen.getByText('Data limitations')).toBeTruthy();
    expect(screen.getByText(/straight-line estimates/)).toBeTruthy();
  });
});
