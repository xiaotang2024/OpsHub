import { renderHook } from '@testing-library/react';
import { usePermission } from './usePermission';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('usePermission hook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('identifies admin role and grants all permissions', () => {
    const { result } = renderHook(() => usePermission({ role: 'admin', permissions: [] }));
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.hasPermission('service:control')).toBe(true);
    expect(result.current.hasPermission('system:anything')).toBe(true);
    expect(result.current.hasAnyPermission(['service:deploy', 'service:config'])).toBe(true);
    expect(result.current.can('service:rollback')).toBe(true);
  });

  it('correctly filters permissions for operator role', () => {
    const { result } = renderHook(() =>
      usePermission({ role: 'operator', permissions: ['service:view', 'service:control'] })
    );
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.hasPermission('service:control')).toBe(true);
    expect(result.current.hasPermission('service:view')).toBe(true);
    expect(result.current.hasPermission('service:deploy')).toBe(false);
    expect(result.current.hasAnyPermission(['service:deploy', 'service:control'])).toBe(true);
    expect(result.current.hasAnyPermission(['service:deploy', 'template:manage'])).toBe(false);
    expect(result.current.can('service:control')).toBe(true);
    expect(result.current.can('service:deploy')).toBe(false);
  });

  it('falls back to localStorage when no options are provided', () => {
    localStorage.setItem(
      'opshub_user',
      JSON.stringify({
        username: 'operator_test',
        role: 'operator',
        permissions: ['service:view', 'audit:view'],
      })
    );

    const { result } = renderHook(() => usePermission());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.hasPermission('service:view')).toBe(true);
    expect(result.current.hasPermission('audit:view')).toBe(true);
    expect(result.current.hasPermission('service:control')).toBe(false);
  });

  it('defaults to safe unprivileged operator when no auth state is present', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.permissions).toEqual([]);
    expect(result.current.hasPermission('service:view')).toBe(false);
    expect(result.current.hasAnyPermission(['service:view', 'service:control'])).toBe(false);
  });
});
