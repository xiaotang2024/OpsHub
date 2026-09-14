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
    expect(screen.getByText('木紫茶岩')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('purple-tea');
  });

  it('opens dropdown menu and lists all 3 theme options', () => {
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /选择界面主题/ });
    fireEvent.click(trigger);

    expect(screen.getAllByText('木紫茶岩').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('战术暗夜')).toBeInTheDocument();
    expect(screen.getByText('战术光棱')).toBeInTheDocument();
    expect(screen.queryByText('极客暗夜')).not.toBeInTheDocument();
    expect(screen.queryByText('天水雾蓝')).not.toBeInTheDocument();
    expect(screen.getByText(/3 种配色/)).toBeInTheDocument();
  });

  it('switches to tactical-dark theme on click and updates localStorage & documentElement', () => {
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /选择界面主题/ });
    fireEvent.click(trigger);

    const darkBtn = screen.getByText('战术暗夜').closest('button')!;
    fireEvent.click(darkBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('tactical-dark');
    expect(localStorage.getItem('opshub_theme')).toBe('tactical-dark');
  });

  it('switches to tactical-light theme on click and updates localStorage & documentElement', () => {
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /选择界面主题/ });
    fireEvent.click(trigger);

    const lightBtn = screen.getByText('战术光棱').closest('button')!;
    fireEvent.click(lightBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('tactical-light');
    expect(localStorage.getItem('opshub_theme')).toBe('tactical-light');
  });

  it('switches to purple-tea theme on click', () => {
    localStorage.setItem('opshub_theme', 'tactical-dark');
    render(<ThemePicker />);
    const trigger = screen.getByRole('button', { name: /选择界面主题/ });
    fireEvent.click(trigger);

    const purpleBtn = screen.getByText('木紫茶岩').closest('button')!;
    fireEvent.click(purpleBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('purple-tea');
    expect(localStorage.getItem('opshub_theme')).toBe('purple-tea');
  });

  it('falls back to purple-tea when saved theme in localStorage is deprecated', () => {
    localStorage.setItem('opshub_theme', 'default');
    render(<ThemePicker />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('purple-tea');
    expect(screen.getByText('木紫茶岩')).toBeInTheDocument();
  });
});
