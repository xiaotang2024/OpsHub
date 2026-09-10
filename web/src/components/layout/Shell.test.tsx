import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Shell } from './Shell';
import { describe, it, expect } from 'vitest';

describe('Shell Component', () => {
  it('renders brand logo and primary navigation tabs', () => {
    render(
      <BrowserRouter>
        <Shell>
          <div>Content Slot</div>
        </Shell>
      </BrowserRouter>
    );

    expect(screen.getAllByText(/OpsHub/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/服务列表/i)).toBeInTheDocument();
    expect(screen.getByText(/部署模板/i)).toBeInTheDocument();
    expect(screen.getByText(/JDK 资产/i)).toBeInTheDocument();
    expect(screen.getByText(/审计日志/i)).toBeInTheDocument();
    expect(screen.getByText('Content Slot')).toBeInTheDocument();
  });

  it('renders live system status indicator and user profile badge', () => {
    render(
      <BrowserRouter>
        <Shell>
          <div>Dashboard View</div>
        </Shell>
      </BrowserRouter>
    );

    expect(screen.getByText(/系统正常/i)).toBeInTheDocument();
    expect(screen.getByText('运维管理员')).toBeInTheDocument();
    expect(screen.getByText('Ops Admin')).toBeInTheDocument();
  });
});
