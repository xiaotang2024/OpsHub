import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginModal } from './LoginModal';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    login: vi.fn(),
  },
}));

describe('LoginModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders login modal with fields and notice when open', () => {
    render(<LoginModal isOpen={true} />);
    expect(screen.getByText('OpsHub 控制台登录')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('admin')).toHaveValue('admin');
    expect(screen.getByPlaceholderText('请输入访问凭据密钥')).toBeInTheDocument();
    expect(screen.getByText(/初始凭据提示/)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<LoginModal isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('handles successful login and triggers onSuccess', async () => {
    const onSuccess = vi.fn();
    (api.login as any).mockResolvedValueOnce({ token: 'mock-jwt-token-123' });

    render(<LoginModal isOpen={true} onSuccess={onSuccess} />);

    const passwordInput = screen.getByPlaceholderText('请输入访问凭据密钥');
    fireEvent.change(passwordInput, { target: { value: 'mypassword' } });

    const submitBtn = screen.getByRole('button', { name: /确认登录/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('admin', 'mypassword');
      expect(localStorage.getItem('opshub_token')).toBe('mock-jwt-token-123');
      expect(onSuccess).toHaveBeenCalledWith('mock-jwt-token-123', 'admin');
    });
  });

  it('displays error message when login fails', async () => {
    (api.login as any).mockRejectedValueOnce(new Error('invalid username or password'));

    render(<LoginModal isOpen={true} />);

    const passwordInput = screen.getByPlaceholderText('请输入访问凭据密钥');
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });

    const submitBtn = screen.getByRole('button', { name: /确认登录/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('invalid username or password')).toBeInTheDocument();
    });
  });
});
