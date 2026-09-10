import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InteractiveCanvasBackground } from './InteractiveCanvasBackground';

describe('InteractiveCanvasBackground Component', () => {
  it('renders canvas element without throwing errors', () => {
    const { container } = render(<InteractiveCanvasBackground />);
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveClass('fixed');
  });

  it('cleans up event listeners on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<InteractiveCanvasBackground />);
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
