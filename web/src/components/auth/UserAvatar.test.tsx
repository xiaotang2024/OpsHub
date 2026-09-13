import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UserAvatar, PRESET_AVATARS } from './UserAvatar';

describe('UserAvatar', () => {
  it('renders default user icon when avatar is not provided', () => {
    render(<UserAvatar size="md" />);
    expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
  });

  it('renders preset avatar correctly', () => {
    render(<UserAvatar avatar="preset:ops-chan" size="lg" />);
    const avatar = screen.getByTestId('user-avatar');
    expect(avatar).toBeInTheDocument();
    expect(avatar.className).toContain('border-cyan-400');
  });

  it('renders image when avatar is a data URL or image link', () => {
    render(
      <UserAvatar
        avatar="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        size="md"
        nickname="DevOps"
      />
    );
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'DevOps');
  });

  it('renders role badge when showBadge is true', () => {
    const { container } = render(<UserAvatar avatar="preset:shield-guard" showBadge={true} role="admin" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('exposes all preset avatar definitions', () => {
    expect(PRESET_AVATARS.length).toBeGreaterThanOrEqual(6);
    expect(PRESET_AVATARS.some((p) => p.id === 'preset:ops-chan')).toBe(true);
  });
});
