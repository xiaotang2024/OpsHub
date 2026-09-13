import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserManagement } from './UserManagement';
import { api } from '../../api';
import { toast } from 'sonner';

vi.mock('../../api', () => ({
  api: {
    getUsers: vi.fn(),
    createUser: vi.fn(),
    updateUserPermissions: vi.fn(),
    updateUserStatus: vi.fn(),
    resetUserPassword: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('UserManagement Component', () => {
  const mockUsers = [
    {
      id: 1,
      username: 'admin',
      nickname: '系统超级管理员',
      role: 'admin',
      status: 'active',
      created_at: '2026-09-01T00:00:00Z',
    },
    {
      id: 2,
      username: 'dev_ops',
      nickname: '运维专家',
      role: 'operator',
      status: 'active',
      permissions: [
        'service:view',
        'service:control',
        'service:deploy',
        'service:rollback',
        'service:config',
        'audit:view',
      ],
      created_at: '2026-09-02T10:00:00Z',
    },
    {
      id: 3,
      username: 'auditor',
      nickname: '巡检专员',
      role: 'operator',
      status: 'disabled',
      permissions: ['service:view', 'audit:view'],
      created_at: '2026-09-03T12:00:00Z',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('opshub_username', 'admin');
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'admin', role: 'admin' }));
    vi.clearAllMocks();
    (api.getUsers as any).mockResolvedValue(mockUsers);
    (api.createUser as any).mockResolvedValue({ id: 4, username: 'newuser', role: 'operator' });
    (api.updateUserPermissions as any).mockResolvedValue({ message: 'ok' });
    (api.updateUserStatus as any).mockResolvedValue({ message: 'ok' });
    (api.resetUserPassword as any).mockResolvedValue({ message: 'ok' });
    (api.deleteUser as any).mockResolvedValue({ message: 'ok' });
  });

  it('renders user list with role badges, status, and permission info', async () => {
    render(<UserManagement />);

    expect(screen.getByTestId('user-management-page')).toBeInTheDocument();
    expect(screen.getByText(/用户与权限管理/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
      expect(screen.getByText('dev_ops')).toBeInTheDocument();
      expect(screen.getByText('auditor')).toBeInTheDocument();
    });

    // Check roles
    expect(screen.getAllByText('管理员').length).toBeGreaterThan(0);
    expect(screen.getAllByText('运维人员').length).toBeGreaterThan(0);

    // Check status tags
    expect(screen.getAllByText('正常').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已停用').length).toBeGreaterThan(0);

    // Check permission badges/count
    expect(screen.getByText(/全部权限/i)).toBeInTheDocument();
    expect(screen.getByText(/6 项权限/i)).toBeInTheDocument();
    expect(screen.getByText(/2 项权限/i)).toBeInTheDocument();
  });

  it('filters users by search query and role filter', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // Filter by search query
    const searchInput = screen.getByPlaceholderText(/搜索用户名或昵称/i);
    fireEvent.change(searchInput, { target: { value: '巡检' } });

    expect(screen.queryByText('admin')).not.toBeInTheDocument();
    expect(screen.queryByText('dev_ops')).not.toBeInTheDocument();
    expect(screen.getByText('auditor')).toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('admin')).toBeInTheDocument();

    // Filter by role
    const roleSelect = screen.getByLabelText('role-filter');
    fireEvent.change(roleSelect, { target: { value: 'admin' } });

    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.queryByText('dev_ops')).not.toBeInTheDocument();
    expect(screen.queryByText('auditor')).not.toBeInTheDocument();
  });

  it('opens create user modal and creates a new operator user', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /新建用户/i });
    fireEvent.click(createBtn);

    expect(screen.getByText('新建系统用户')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText('username-input'), { target: { value: 'test_operator' } });
    fireEvent.change(screen.getByLabelText('nickname-input'), { target: { value: '测试运维' } });
    fireEvent.change(screen.getByLabelText('password-input'), { target: { value: 'secret123' } });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /确认创建/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'test_operator',
          nickname: '测试运维',
          password: 'secret123',
          role: 'operator',
        })
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('创建成功'));
  });

  it('opens permission modal for operator and toggles preset templates', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('dev_ops')).toBeInTheDocument();
    });

    // Find permission config button for dev_ops
    const configBtn = screen.getByTestId('edit-perm-dev_ops');
    fireEvent.click(configBtn);

    expect(screen.getByText(/配置权限 - dev_ops/i)).toBeInTheDocument();

    // Click "只读巡检" preset
    const readonlyBtn = screen.getByRole('button', { name: /只读巡检/i });
    fireEvent.click(readonlyBtn);

    // Verify checkbox states: service:view and audit:view should be checked, service:control unchecked
    const serviceViewCheckbox = screen.getByLabelText('perm-service:view') as HTMLInputElement;
    const serviceControlCheckbox = screen.getByLabelText('perm-service:control') as HTMLInputElement;
    const auditViewCheckbox = screen.getByLabelText('perm-audit:view') as HTMLInputElement;

    expect(serviceViewCheckbox.checked).toBe(true);
    expect(auditViewCheckbox.checked).toBe(true);
    expect(serviceControlCheckbox.checked).toBe(false);

    // Click "标准运维" preset
    const standardBtn = screen.getByRole('button', { name: /标准运维/i });
    fireEvent.click(standardBtn);
    expect(serviceControlCheckbox.checked).toBe(true);

    // Manually toggle a checkbox: uncheck service:control
    fireEvent.click(serviceControlCheckbox);
    expect(serviceControlCheckbox.checked).toBe(false);

    // Save permissions
    const saveBtn = screen.getByRole('button', { name: /保存权限/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateUserPermissions).toHaveBeenCalledWith(
        2,
        expect.not.arrayContaining(['service:control'])
      );
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('权限'));
  });

  it('toggles user status and protects admin and current logged-in user', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('dev_ops')).toBeInTheDocument();
    });

    // Click "停用" for dev_ops
    const statusBtnDevOps = screen.getByTestId('toggle-status-dev_ops');
    fireEvent.click(statusBtnDevOps);

    await waitFor(() => {
      expect(api.updateUserStatus).toHaveBeenCalledWith(2, 'disabled');
    });

    // Try to toggle status for admin
    const statusBtnAdmin = screen.getByTestId('toggle-status-admin');
    expect(statusBtnAdmin).toBeDisabled();

    fireEvent.click(statusBtnAdmin);
    expect(api.updateUserStatus).not.toHaveBeenCalledWith(1, expect.anything());
  });

  it('opens reset password modal and updates user password', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('dev_ops')).toBeInTheDocument();
    });

    const resetBtn = screen.getByTestId('reset-pwd-dev_ops');
    fireEvent.click(resetBtn);

    expect(screen.getByText(/重置密码 - dev_ops/i)).toBeInTheDocument();

    const pwdInput = screen.getByLabelText('new-password-input');
    fireEvent.change(pwdInput, { target: { value: 'newsecret456' } });

    const submitBtn = screen.getByRole('button', { name: /确认重置/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.resetUserPassword).toHaveBeenCalledWith(2, 'newsecret456');
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('密码重置成功'));
  });

  it('deletes user with confirmation and prevents deleting admin or current user', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('auditor')).toBeInTheDocument();
    });

    // admin delete button should be disabled
    const deleteBtnAdmin = screen.getByTestId('delete-user-admin');
    expect(deleteBtnAdmin).toBeDisabled();

    // delete auditor
    const deleteBtnAuditor = screen.getByTestId('delete-user-auditor');
    expect(deleteBtnAuditor).not.toBeDisabled();
    fireEvent.click(deleteBtnAuditor);

    // Confirmation dialog appears
    expect(screen.getByText(/确定要注销\/删除用户 \[auditor\] 吗/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /确认删除/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.deleteUser).toHaveBeenCalledWith(3);
    });

    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('已删除'));
  });
});
