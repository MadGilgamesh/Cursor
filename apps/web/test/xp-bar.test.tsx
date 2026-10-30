import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { XpBar } from '../src/ui/XpBar';

const character = (level: number, experience: number) => ({
  id: '01a188a0-a755-76ad-aeec-cbf3830cb2f6',
  name: 'Latarnik',
  level,
  experience,
  createdAt: '2026-10-29T17:00:00.000Z',
});

describe('XpBar', () => {
  it('pokazuje próg z krzywej GDD dla bieżącego poziomu', () => {
    render(<XpBar character={character(3, 40)} />);
    expect(screen.getByRole('progressbar', { name: 'Doświadczenie' })).toHaveAttribute(
      'aria-valuemax',
      '242',
    );
    expect(screen.getByText('40 / 242 PD')).toBeInTheDocument();
  });

  it('na poziomie maksymalnym nie pokazuje progu', () => {
    render(<XpBar character={character(80, 0)} />);
    expect(screen.getByText('Poziom maksymalny')).toBeInTheDocument();
  });
});
