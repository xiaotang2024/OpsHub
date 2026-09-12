import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ServiceStartAnimeOverlay } from './ServiceStartAnimeOverlay';

describe('ServiceStartAnimeOverlay', () => {
  it('renders anime mascot, service name and cheerful starting text during starting phase', () => {
    render(<ServiceStartAnimeOverlay serviceName="order-center" status="starting" />);

    expect(screen.getByText('order-center')).toBeInTheDocument();
    expect(screen.getByText(/动力注入中/i)).toBeInTheDocument();
    expect(screen.getByTestId('anime-mascot')).toBeInTheDocument();
  });

  it('renders happy celebration text when status is success', () => {
    render(<ServiceStartAnimeOverlay serviceName="order-center" status="success" />);

    expect(screen.getByText(/启动大成功|启动成功/i)).toBeInTheDocument();
    expect(screen.getByTestId('anime-mascot')).toBeInTheDocument();
  });

  it('renders apologetic text and error detail when status is error', () => {
    render(
      <ServiceStartAnimeOverlay
        serviceName="order-center"
        status="error"
        errorMessage="端口被占用"
      />
    );

    expect(screen.getByText(/启动好像跌倒了|启动失败/i)).toBeInTheDocument();
    expect(screen.getByText(/端口被占用/i)).toBeInTheDocument();
  });
});
