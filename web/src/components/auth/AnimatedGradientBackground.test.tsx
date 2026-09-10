import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AnimatedGradientBackground } from './AnimatedGradientBackground';

describe('AnimatedGradientBackground Component', () => {
  it('renders background container and tech grid', () => {
    render(<AnimatedGradientBackground />);
    expect(screen.getByTestId('animated-gradient-background')).toBeInTheDocument();
    expect(screen.getByTestId('tech-grid')).toBeInTheDocument();
  });

  it('cleans up animation frame on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = render(<AnimatedGradientBackground />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
