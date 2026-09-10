import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AnimatedCharacters } from './AnimatedCharacters';

describe('AnimatedCharacters Component', () => {
  it('renders all 4 characters (Purple, Black, Orange, Yellow)', () => {
    render(<AnimatedCharacters />);
    expect(screen.getByTestId('char-purple')).toBeInTheDocument();
    expect(screen.getByTestId('char-black')).toBeInTheDocument();
    expect(screen.getByTestId('char-orange')).toBeInTheDocument();
    expect(screen.getByTestId('char-yellow')).toBeInTheDocument();
  });

  it('updates mouse positions on mousemove without error', () => {
    render(<AnimatedCharacters />);
    fireEvent.mouseMove(window, { clientX: 200, clientY: 150 });
    expect(screen.getByTestId('animated-characters-container')).toBeInTheDocument();
  });

  it('adjusts character styles when typing or hiding password', () => {
    const { rerender } = render(
      <AnimatedCharacters isTyping={true} passwordLength={0} showPassword={false} />
    );
    const purple = screen.getByTestId('char-purple');
    expect(purple).toHaveStyle({ height: '420px' });

    rerender(
      <AnimatedCharacters isTyping={false} passwordLength={8} showPassword={false} />
    );
    expect(purple).toHaveStyle({ height: '420px' });
  });

  it('resets skew when showPassword is true', () => {
    render(<AnimatedCharacters passwordLength={8} showPassword={true} />);
    const purple = screen.getByTestId('char-purple');
    expect(purple.style.transform).toContain('skewX(0deg)');
  });

  it('calls onCharacterDoubleClick when double clicking any character', () => {
    const onDoubleClick = vi.fn();
    render(<AnimatedCharacters onCharacterDoubleClick={onDoubleClick} />);

    fireEvent.doubleClick(screen.getByTestId('char-purple'));
    expect(onDoubleClick).toHaveBeenCalledWith(0);

    fireEvent.doubleClick(screen.getByTestId('char-black'));
    expect(onDoubleClick).toHaveBeenCalledWith(1);

    fireEvent.doubleClick(screen.getByTestId('char-orange'));
    expect(onDoubleClick).toHaveBeenCalledWith(2);

    fireEvent.doubleClick(screen.getByTestId('char-yellow'));
    expect(onDoubleClick).toHaveBeenCalledWith(3);
  });
});
