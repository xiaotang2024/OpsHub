import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OpsHubLogo } from './OpsHubLogo';

describe('OpsHubLogo Component', () => {
  it('renders image with default alt text and size', () => {
    render(<OpsHubLogo />);
    const logoContainer = screen.getByTestId('opshub-logo');
    expect(logoContainer).toBeInTheDocument();
    const img = screen.getByAltText('OpsHub Logo');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/logo.png');
  });

  it('renders with custom size and live indicator badge', () => {
    const { container } = render(<OpsHubLogo size="lg" showLiveBadge={true} />);
    expect(container.querySelector('.animate-ping')).toBeInTheDocument();
    expect(screen.getByTestId('opshub-logo').className).toContain('h-11');
  });

  it('renders numeric size properly', () => {
    render(<OpsHubLogo size={48} />);
    const logoContainer = screen.getByTestId('opshub-logo');
    expect(logoContainer).toHaveStyle({ width: '48px', height: '48px' });
  });
});
