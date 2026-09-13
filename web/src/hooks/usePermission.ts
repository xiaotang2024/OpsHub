import { useState, useEffect, useMemo, useCallback } from 'react';
import { UserProfile } from '../types';

export interface UsePermissionOptions {
  role?: string;
  permissions?: string[];
}

export interface UsePermissionReturn {
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  permissions: string[];
  role: string;
}

function getStoredAuth(): { role: string; permissions: string[] } {
  if (typeof window === 'undefined') {
    return { role: 'operator', permissions: [] };
  }
  try {
    const userStr = localStorage.getItem('opshub_user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      return {
        role: parsed.role || 'operator',
        permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
      };
    }
    const role = localStorage.getItem('opshub_role');
    const permsStr = localStorage.getItem('opshub_permissions');
    const permissions = permsStr ? JSON.parse(permsStr) : [];
    if (role) {
      return { role, permissions };
    }
    const username = localStorage.getItem('opshub_username');
    if (username === 'admin') {
      return { role: 'admin', permissions: [] };
    }
  } catch {
    // ignore storage parsing error
  }
  return { role: 'operator', permissions: [] };
}

export function usePermission(options?: UsePermissionOptions): UsePermissionReturn {
  const [storedAuth, setStoredAuth] = useState(() => getStoredAuth());

  useEffect(() => {
    if (options?.role !== undefined || options?.permissions !== undefined) {
      return;
    }

    const handleAuthChange = (e: any) => {
      const user = e.detail?.user as UserProfile | undefined;
      if (user) {
        setStoredAuth({
          role: user.role || 'operator',
          permissions: user.permissions || [],
        });
      } else {
        setStoredAuth(getStoredAuth());
      }
    };

    window.addEventListener('opshub:authenticated', handleAuthChange);
    window.addEventListener('opshub:profile_updated', handleAuthChange);
    window.addEventListener('opshub:unauthorized', handleAuthChange);

    return () => {
      window.removeEventListener('opshub:authenticated', handleAuthChange);
      window.removeEventListener('opshub:profile_updated', handleAuthChange);
      window.removeEventListener('opshub:unauthorized', handleAuthChange);
    };
  }, [options?.role, options?.permissions]);

  const effectiveRole = options?.role ?? storedAuth.role;
  const effectivePermissions = options?.permissions ?? storedAuth.permissions;

  const isAdmin = effectiveRole === 'admin';

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (isAdmin) return true;
      return effectivePermissions.includes(permission);
    },
    [isAdmin, effectivePermissions]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => {
      if (isAdmin) return true;
      if (!perms || perms.length === 0) return false;
      return perms.some((p) => effectivePermissions.includes(p));
    },
    [isAdmin, effectivePermissions]
  );

  const hasAllPermissions = useCallback(
    (perms: string[]): boolean => {
      if (isAdmin) return true;
      if (!perms || perms.length === 0) return true;
      return perms.every((p) => effectivePermissions.includes(p));
    },
    [isAdmin, effectivePermissions]
  );

  return useMemo(
    () => ({
      isAdmin,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      can: hasPermission,
      canAny: hasAnyPermission,
      permissions: effectivePermissions,
      role: effectiveRole,
    }),
    [isAdmin, hasPermission, hasAnyPermission, hasAllPermissions, effectivePermissions, effectiveRole]
  );
}

export default usePermission;
