import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemePicker } from './ThemePicker';

describe('ThemePicker Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders theme picker trigger button with active theme', () => {
    render(<ThemePicker />);
    expect(screen.getByRole('button', { name: /选择界面主题/ })).toBeInTheDocument();
    expect(screen.getByText('极客暗夜')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('default');
  });

  it('opens dropdown menu and lists all 3 theme options', () => {
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /选择界面主题/ });
    fireEvent.click(trigger);

    expect(screen.getByText('天水雾蓝')).toBeInTheDocument();
    expect(screen.getByText('木紫茶岩')).toBeInTheDocument();
    expect(screen.getByText(/3 种配色/)).toBeInTheDocument();
  });

  it('switches to celadon-blue theme on click and updates localStorage & documentElement', () => {
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /选择界面主题/ });
    fireEvent.click(trigger);

    const celadonBtn = screen.getByText('天水雾蓝').closest('button')!;
    fireEvent.click(celadonBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('celadon-blue');
    expect(localStorage.getItem('opshub_theme')).toBe('celadon-blue');
  });

  it('switches to purple-tea theme on click', () => {
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /选择界面主题/ });
    fireEvent.click(trigger);

    const purpleBtn = screen.getByText('木紫茶岩').closest('button')!;
    fireEvent.click(purpleBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('purple-tea');
    expect(localStorage.getItem('opshub_theme')).toBe('purple-tea');
  });
});
