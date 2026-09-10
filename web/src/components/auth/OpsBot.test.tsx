import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OpsBot } from './OpsBot';

describe('OpsBot Component', () => {
  it('renders normal bot with eyes and antenna', () => {
    const { container } = render(<OpsBot />);
    expect(container.querySelector('.bg-ops-cyan')).toBeInTheDocument();
  });

  it('renders joyful hearts when isSuccess is true', () => {
    render(<OpsBot isSuccess={true} />);
    expect(screen.getAllByText('♥')).toHaveLength(2);
    expect(screen.getByText('💖')).toBeInTheDocument();
  });

  it('renders sweat drop and shocked eyes when hasError is true', () => {
    render(<OpsBot hasError={true} />);
    expect(screen.getByText('>')).toBeInTheDocument();
    expect(screen.getByText('<')).toBeInTheDocument();
    expect(screen.getByText('💧')).toBeInTheDocument();
  });

  it('renders blush when isPasswordFocused is true', () => {
    const { container } = render(<OpsBot isPasswordFocused={true} />);
    const blushes = container.querySelectorAll('.bg-rose-500\\/70');
    expect(blushes.length).toBeGreaterThanOrEqual(2);
  });
});
