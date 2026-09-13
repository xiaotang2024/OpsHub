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

  beforeEach(() => {
    localStorage.clear();
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

  it('renders "用户管理" navigation link when admin logs in', () => {
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'admin', role: 'admin' }));
    render(
      <BrowserRouter>
        <Shell>
          <div>Admin View</div>
        </Shell>
      </BrowserRouter>
    );

    expect(screen.getByText('用户管理')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('hides "用户管理" navigation link when operator logs in', () => {
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'operator1', role: 'operator' }));
    render(
      <BrowserRouter>
        <Shell>
          <div>Operator View</div>
        </Shell>
      </BrowserRouter>
    );

    expect(screen.queryByText('用户管理')).not.toBeInTheDocument();
  });
});

