import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminStatusPill } from './admin-status-pill';

describe('AdminStatusPill', () => {
  it('shows a stopped ad campaign as 중단 rather than the raw status code', () => {
    render(<AdminStatusPill status="stopped" />);

    expect(screen.getByText('중단')).toBeInTheDocument();
    expect(screen.queryByText('stopped')).not.toBeInTheDocument();
  });
});
