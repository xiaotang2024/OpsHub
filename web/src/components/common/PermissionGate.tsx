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
  disableOnDenied?: boolean;
  deniedTooltip?: string;
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
  disableOnDenied = false,
  deniedTooltip,
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

  if ((disableOnDenied || disabled) && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    const title = deniedTooltip || child.props?.title || '无操作权限';
    const originalClassName = child.props?.className || '';
    const disabledClassName = originalClassName.includes('disabled:')
      ? originalClassName
      : `${originalClassName} disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`;

    const cloned = React.cloneElement(child, {
      disabled: true,
      'aria-disabled': true,
      className: disabledClassName,
      style: { ...child.props?.style, pointerEvents: 'none' },
    });

    return (
      <span title={title} className="inline-flex cursor-not-allowed">
        {cloned}
      </span>
    );
  }

  return null;
};

export default PermissionGate;
