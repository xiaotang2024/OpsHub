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

  it('renders peaceful resting text and mascot when stopping a service', () => {
    render(
      <ServiceStartAnimeOverlay
        serviceName="order-center"
        action="stop"
        status="stopping"
      />
    );

    expect(screen.getByText('order-center')).toBeInTheDocument();
    expect(screen.getByText(/优雅停机中/i)).toBeInTheDocument();
    expect(screen.getByTestId('anime-mascot')).toBeInTheDocument();
  });

  it('renders safe landing text when stopping succeeds', () => {
    render(
      <ServiceStartAnimeOverlay
        serviceName="order-center"
        action="stop"
        status="success"
      />
    );

    expect(screen.getByText(/服务已安全停机/i)).toBeInTheDocument();
    expect(screen.getByText(/进程已优雅休眠/i)).toBeInTheDocument();
  });

  it('renders energetic reloading text when restarting a service', () => {
    render(
      <ServiceStartAnimeOverlay
        serviceName="order-center"
        action="restart"
        status="restarting"
      />
    );

    expect(screen.getByText('order-center')).toBeInTheDocument();
    expect(screen.getByText(/热启动重装中/i)).toBeInTheDocument();
    expect(screen.getByTestId('anime-mascot')).toBeInTheDocument();
  });

  it('renders triumphant launch text when restarting succeeds', () => {
    render(
      <ServiceStartAnimeOverlay
        serviceName="order-center"
        action="restart"
        status="success"
      />
    );

    expect(screen.getByText(/服务重启大圆满/i)).toBeInTheDocument();
    expect(screen.getByText(/崭新进程已顺利起飞/i)).toBeInTheDocument();
  });
});
