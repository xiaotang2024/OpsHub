import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionGate } from './PermissionGate';

describe('PermissionGate Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders children when user has permission', () => {
    render(
      <PermissionGate
        permission="service:control"
        role="operator"
        userPermissions={['service:control', 'service:view']}
      >
        <button>启动服务</button>
      </PermissionGate>
    );

    expect(screen.getByRole('button', { name: '启动服务' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '启动服务' })).not.toBeDisabled();
  });

  it('renders children for admin regardless of permission list', () => {
    render(
      <PermissionGate
        permission="service:deploy"
        role="admin"
        userPermissions={[]}
      >
        <button>部署发布</button>
      </PermissionGate>
    );

    expect(screen.getByRole('button', { name: '部署发布' })).toBeInTheDocument();
  });

  it('renders fallback when user lacks required permission', () => {
    render(
      <PermissionGate
        permission="service:deploy"
        role="operator"
        userPermissions={['service:view']}
        fallback={<span data-testid="fallback">无权访问</span>}
      >
        <button>部署发布</button>
      </PermissionGate>
    );

    expect(screen.queryByRole('button', { name: '部署发布' })).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.getByText('无权访问')).toBeInTheDocument();
  });

  it('renders null when user lacks permission and no fallback is provided', () => {
    const { container } = render(
      <PermissionGate
        permission="service:deploy"
        role="operator"
        userPermissions={['service:view']}
      >
        <button>部署发布</button>
      </PermissionGate>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: '部署发布' })).not.toBeInTheDocument();
  });

  it('renders disabled child when disabled is true and user lacks permission without fallback', () => {
    render(
      <PermissionGate
        permission="service:control"
        role="operator"
        userPermissions={['service:view']}
        disabled={true}
      >
        <button>启动服务</button>
      </PermissionGate>
    );

    const btn = screen.getByRole('button', { name: '启动服务' });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('renders fallback when disabled is true and fallback is provided', () => {
    render(
      <PermissionGate
        permission="service:control"
        role="admin"
        disabled={true}
        fallback={<button disabled>处理中不可用</button>}
      >
        <button>启动服务</button>
      </PermissionGate>
    );

    expect(screen.getByRole('button', { name: '处理中不可用' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '启动服务' })).not.toBeInTheDocument();
  });

  it('supports multi-permission check with requireAll=false (default: any match)', () => {
    render(
      <PermissionGate
        permissions={['service:control', 'service:deploy']}
        role="operator"
        userPermissions={['service:control']}
      >
        <div data-testid="content">操作面板</div>
      </PermissionGate>
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('supports multi-permission check with requireAll=true', () => {
    const { rerender } = render(
      <PermissionGate
        permissions={['service:control', 'service:deploy']}
        requireAll={true}
        role="operator"
        userPermissions={['service:control']}
        fallback={<div data-testid="fallback">缺少全部权限</div>}
      >
        <div data-testid="content">完整控制台</div>
      </PermissionGate>
    );

    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();

    rerender(
      <PermissionGate
        permissions={['service:control', 'service:deploy']}
        requireAll={true}
        role="operator"
        userPermissions={['service:control', 'service:deploy']}
        fallback={<div data-testid="fallback">缺少全部权限</div>}
      >
        <div data-testid="content">完整控制台</div>
      </PermissionGate>
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('renders disabled child wrapped with title when disableOnDenied is true and permission is denied', () => {
    render(
      <PermissionGate
        permission="service:control"
        role="operator"
        userPermissions={['service:view']}
        disableOnDenied={true}
        deniedTooltip="无服务控制权限，请联系管理员授予"
      >
        <button>启动服务</button>
      </PermissionGate>
    );

    const btn = screen.getByRole('button', { name: '启动服务' });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
    expect(screen.getByTitle('无服务控制权限，请联系管理员授予')).toBeInTheDocument();
  });

  it('renders normal enabled child without disabled attribute when user has permission even if disableOnDenied is true', () => {
    render(
      <PermissionGate
        permission="service:control"
        role="operator"
        userPermissions={['service:control']}
        disableOnDenied={true}
        deniedTooltip="无服务控制权限，请联系管理员授予"
      >
        <button>启动服务</button>
      </PermissionGate>
    );

    const btn = screen.getByRole('button', { name: '启动服务' });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
    expect(screen.queryByTitle('无服务控制权限，请联系管理员授予')).not.toBeInTheDocument();
  });
});
