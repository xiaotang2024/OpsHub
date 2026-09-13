import React from 'react';
import { usePermission } from '../../hooks/usePermission';

export interface PermissionGateProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  role?: string;
  userPermissions?: string[];
  fallback?: React.ReactNode;
  disabled?: boolean;
  children: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  permissions,
  requireAll = false,
  role,
  userPermissions,
  fallback = null,
  disabled,
  children,
}) => {
  const permHook = usePermission(
    role !== undefined || userPermissions !== undefined
      ? { role, permissions: userPermissions }
      : undefined
  );

  let hasAccess = true;

  if (permission) {
    hasAccess = permHook.hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll
      ? permHook.hasAllPermissions(permissions)
      : permHook.hasAnyPermission(permissions);
  }

  const isAllowed = hasAccess && !disabled;

  if (isAllowed) {
    return <>{children}</>;
  }

  if (fallback !== null && fallback !== undefined) {
    return <>{fallback}</>;
  }

  if (disabled && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      disabled: true,
      'aria-disabled': true,
    });
  }

  return null;
};

export default PermissionGate;
