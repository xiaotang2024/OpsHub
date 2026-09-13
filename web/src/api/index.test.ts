import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './index';

describe('User Management API Client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('getUsers sends GET to /api/users with auth header', async () => {
    localStorage.setItem('opshub_token', 'test-token-123');
    const mockUsers = [{ id: 1, username: 'admin', role: 'admin', permissions: [], status: 'active' }];

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockUsers,
    } as Response);

    const res = await api.getUsers();
    expect(res).toEqual(mockUsers);
    expect(fetchSpy).toHaveBeenCalledWith('/api/users', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer test-token-123',
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('createUser sends POST to /api/users with payload', async () => {
    const newUser = {
      username: 'jack',
      password: 'password123',
      nickname: 'Jack',
      role: 'operator',
      permissions: ['service:view', 'service:control'],
    };
    const createdUser = { id: 2, ...newUser, status: 'active' };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => createdUser,
    } as Response);

    const res = await api.createUser(newUser);
    expect(res).toEqual(createdUser);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(newUser),
      })
    );
  });

  it('updateUserPermissions sends PUT to /api/users/:id/permissions with array or payload', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'permissions updated successfully' }),
    } as Response);

    // Call with array
    const res1 = await api.updateUserPermissions(2, ['service:view', 'audit:view']);
    expect(res1.message).toBe('permissions updated successfully');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      '/api/users/2/permissions',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ permissions: ['service:view', 'audit:view'] }),
      })
    );

    // Call with payload object
    const res2 = await api.updateUserPermissions(2, { permissions: ['service:control'] });
    expect(res2.message).toBe('permissions updated successfully');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      '/api/users/2/permissions',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ permissions: ['service:control'] }),
      })
    );
  });

  it('updateUserStatus sends PUT to /api/users/:id/status with string or payload', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'status updated successfully' }),
    } as Response);

    // Call with string
    const res1 = await api.updateUserStatus(2, 'disabled');
    expect(res1.message).toBe('status updated successfully');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      '/api/users/2/status',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'disabled' }),
      })
    );

    // Call with payload object
    const res2 = await api.updateUserStatus(2, { status: 'active' });
    expect(res2.message).toBe('status updated successfully');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      '/api/users/2/status',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'active' }),
      })
    );
  });

  it('resetUserPassword sends POST to /api/users/:id/reset-password', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'password reset successfully' }),
    } as Response);

    const res = await api.resetUserPassword(2, 'newSecretPassword123');
    expect(res.message).toBe('password reset successfully');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/users/2/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ new_password: 'newSecretPassword123' }),
      })
    );
  });

  it('deleteUser sends DELETE to /api/users/:id', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'user deleted successfully' }),
    } as Response);

    const res = await api.deleteUser(2);
    expect(res.message).toBe('user deleted successfully');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/users/2',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});
