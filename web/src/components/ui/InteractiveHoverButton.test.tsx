import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InteractiveHoverButton } from './InteractiveHoverButton';

describe('InteractiveHoverButton Component', () => {
  it('renders button text properly', () => {
    render(<InteractiveHoverButton text="登录控制台" />);
    expect(screen.getAllByText('登录控制台').length).toBeGreaterThanOrEqual(1);
  });

  it('triggers onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<InteractiveHoverButton onClick={handleClick} text="提交" />);
    const btn = screen.getAllByRole('button')[0];
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner when loading is true and is disabled', () => {
    render(<InteractiveHoverButton loading={true} text="加载中" />);
    const btn = screen.getAllByRole('button')[0];
    expect(btn).toBeDisabled();
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });
});
