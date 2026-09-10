import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginModal } from './LoginModal';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
    getSecurityQuestion: vi.fn(),
    resetPassword: vi.fn(),
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
    expect(screen.getByText(/初始管理员提示/)).toBeInTheDocument();
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

  it('switches to user registration and registers successfully', async () => {
    (api.register as any).mockResolvedValueOnce({
      token: 'registered-token-456',
      user: { username: 'devops_tom', role: 'operator' },
    });

    render(<LoginModal isOpen={true} />);

    // Click tab "用户注册"
    const registerTab = screen.getByRole('button', { name: /用户注册/ });
    fireEvent.click(registerTab);

    expect(screen.getByText('注册 OpsHub 账号')).toBeInTheDocument();

    // Fill registration form
    fireEvent.change(screen.getByPlaceholderText(/例如: devops_john/), {
      target: { value: 'devops_tom' },
    });
    fireEvent.change(screen.getByPlaceholderText(/例如: 张三/), {
      target: { value: '汤姆' },
    });
    fireEvent.change(screen.getByPlaceholderText(/至少 6 位字符/), {
      target: { value: 'mypassword123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/重复输入密码/), {
      target: { value: 'mypassword123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/请准确牢记/), {
      target: { value: 'Beijing' },
    });

    // Submit registration
    const submitBtn = screen.getByRole('button', { name: /立即注册并登录/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.register).toHaveBeenCalledWith({
        username: 'devops_tom',
        password: 'mypassword123',
        nickname: '汤姆',
        email: undefined,
        security_question: '您就读的第一所小学名称？',
        security_answer: 'Beijing',
      });
      expect(screen.getByText(/注册成功/)).toBeInTheDocument();
    });
  });

  it('switches to forgot password and resets password via security question', async () => {
    (api.getSecurityQuestion as any).mockResolvedValueOnce({
      username: 'devops_tom',
      security_question: '您最喜欢的编程语言是什么？',
    });
    (api.resetPassword as any).mockResolvedValueOnce({ message: 'password reset successfully' });

    render(<LoginModal isOpen={true} />);

    // Click tab "忘记密码"
    const forgotTab = screen.getByRole('button', { name: /^忘记密码$/ });
    fireEvent.click(forgotTab);

    expect(screen.getByText('重置与找回密码')).toBeInTheDocument();

    // Step 1: Input username
    fireEvent.change(screen.getByPlaceholderText(/例如: devops_john/), {
      target: { value: 'devops_tom' },
    });

    const step1Btn = screen.getByRole('button', { name: /检索密保问题/ });
    fireEvent.click(step1Btn);

    await waitFor(() => {
      expect(api.getSecurityQuestion).toHaveBeenCalledWith('devops_tom');
      expect(screen.getByText('您最喜欢的编程语言是什么？')).toBeInTheDocument();
    });

    // Step 2: Answer question and enter new password
    fireEvent.change(screen.getByPlaceholderText(/请输入注册时填写的密保答案/), {
      target: { value: 'Golang' },
    });
    fireEvent.change(screen.getByPlaceholderText(/至少 6 位字符/), {
      target: { value: 'brandNewPass888' },
    });
    fireEvent.change(screen.getByPlaceholderText(/重复新密码/), {
      target: { value: 'brandNewPass888' },
    });

    const resetBtn = screen.getByRole('button', { name: /确认重置并更新密码/ });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(api.resetPassword).toHaveBeenCalledWith({
        username: 'devops_tom',
        security_answer: 'Golang',
        new_password: 'brandNewPass888',
      });
      expect(screen.getByText(/密码重置成功/)).toBeInTheDocument();
    });
  });
});
