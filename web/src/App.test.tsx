import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';

vi.mock('sonner', async () => {
  const actual = await vi.importActual<any>('sonner');
  return {
    ...actual,
    toast: {
      ...actual.toast,
      warning: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe('App Component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders application with shell and default services view', async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(screen.getByText('OpsHub')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /服务列表 \/ Services/i })).toBeInTheDocument();
    });
  });

  it('allows access to /users for admin user', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'admin', role: 'admin' }));
    render(
      <MemoryRouter initialEntries={['/users']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-management-page')).toBeInTheDocument();
    });
  });

  it('redirects non-admin user from /users to /services and displays toast warning', async () => {
    localStorage.setItem('opshub_user', JSON.stringify({ username: 'operator1', role: 'operator' }));
    render(
      <MemoryRouter initialEntries={['/users']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /服务列表 \/ Services/i })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('user-management-page')).not.toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalled();
  });
});

