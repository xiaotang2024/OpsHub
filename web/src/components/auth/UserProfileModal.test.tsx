import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserProfileModal } from './UserProfileModal';
import { api } from '../../api';

vi.mock('../../api', () => ({
  api: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));

describe('UserProfileModal Component', () => {
  const mockProfile = {
    id: 1,
    username: 'devops_tom',
    role: 'operator',
    nickname: '汤姆主管',
    email: 'tom@opshub.dev',
    security_question: '您最喜欢的编程语言是什么？',
    created_at: '2026-01-15T12:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getProfile as any).mockResolvedValue(mockProfile);
  });

  it('renders user profile details when open', async () => {
    render(<UserProfileModal isOpen={true} onClose={vi.fn()} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('汤姆主管')).toBeInTheDocument();
      expect(screen.getByText('@devops_tom')).toBeInTheDocument();
      expect(screen.getByText('运维操作员')).toBeInTheDocument();
      expect(screen.getByDisplayValue('tom@opshub.dev')).toBeInTheDocument();
      expect(screen.getByText('您最喜欢的编程语言是什么？')).toBeInTheDocument();
    });
  });

  it('updates nickname and email successfully', async () => {
    (api.updateProfile as any).mockResolvedValueOnce({
      ...mockProfile,
      nickname: '汤姆总监',
      email: 'director_tom@opshub.dev',
    });

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('汤姆主管')).toBeInTheDocument();
    });

    const nicknameInput = screen.getByDisplayValue('汤姆主管');
    const emailInput = screen.getByDisplayValue('tom@opshub.dev');

    fireEvent.change(nicknameInput, { target: { value: '汤姆总监' } });
    fireEvent.change(emailInput, { target: { value: 'director_tom@opshub.dev' } });

    const saveBtn = screen.getByRole('button', { name: /保存资料设置/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith({
        nickname: '汤姆总监',
        email: 'director_tom@opshub.dev',
      });
      expect(screen.getByText('个人资料更新成功！')).toBeInTheDocument();
    });
  });

  it('switches to change password tab and submits new password', async () => {
    (api.changePassword as any).mockResolvedValueOnce({ message: 'ok' });

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('汤姆主管')).toBeInTheDocument();
    });

    // Switch tab
    const passTab = screen.getByRole('button', { name: /修改登录密码/ });
    fireEvent.click(passTab);

    expect(screen.getByPlaceholderText(/当前正在使用的旧密码/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/当前正在使用的旧密码/), {
      target: { value: 'oldPass123' },
    });
    fireEvent.change(screen.getByPlaceholderText(/至少 6 位字符/), {
      target: { value: 'brandNewPass456' },
    });
    fireEvent.change(screen.getByPlaceholderText(/重复新密码/), {
      target: { value: 'brandNewPass456' },
    });

    const submitBtn = screen.getByRole('button', { name: /确认修改密码/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.changePassword).toHaveBeenCalledWith('oldPass123', 'brandNewPass456');
      expect(screen.getByText('登录密码修改成功，请妥善保存！')).toBeInTheDocument();
    });
  });

  it('calls onLogout when clicking logout button', async () => {
    const onLogout = vi.fn();
    const onClose = vi.fn();

    render(<UserProfileModal isOpen={true} onClose={onClose} onLogout={onLogout} />);

    await waitFor(() => {
      expect(screen.getByText('汤姆主管')).toBeInTheDocument();
    });

    const logoutBtn = screen.getByRole('button', { name: /退出登录会话/ });
    fireEvent.click(logoutBtn);

    expect(onLogout).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('allows picking a preset avatar and saves with avatar field', async () => {
    (api.updateProfile as any).mockResolvedValueOnce({
      ...mockProfile,
      avatar: 'preset:ops-chan',
    });

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('汤姆主管')).toBeInTheDocument();
    });

    // Click to open avatar modal
    const editAvatarBtn = screen.getByLabelText('点击修改头像');
    fireEvent.click(editAvatarBtn);

    // Pick 喵小智 inside modal
    await waitFor(() => {
      expect(screen.getByText('喵小智')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('喵小智'));

    // Confirm selection in avatar modal
    const confirmBtn = screen.getByRole('button', { name: /确认选择/ });
    fireEvent.click(confirmBtn);

    // Click save in profile form
    const saveBtn = screen.getByRole('button', { name: /保存资料设置/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith({
        nickname: '汤姆主管',
        email: 'tom@opshub.dev',
        avatar: 'preset:ops-chan',
      });
      expect(screen.getByText('个人资料更新成功！')).toBeInTheDocument();
    });
  });

  it('rejects avatar file larger than 2MB', async () => {
    render(<UserProfileModal isOpen={true} onClose={vi.fn()} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('汤姆主管')).toBeInTheDocument();
    });

    // Open avatar modal
    fireEvent.click(screen.getByLabelText('点击修改头像'));

    await waitFor(() => {
      expect(screen.getByLabelText('上传头像文件')).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText('上传头像文件') as HTMLInputElement;
    const oversizedFile = new File(['a'.repeat(3 * 1024 * 1024)], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversizedFile, 'size', { value: 3 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    await waitFor(() => {
      expect(screen.getByText('上传的头像图片不能超过 2MB')).toBeInTheDocument();
    });
  });

  it('supports uploading local image file as DataURL and saving', async () => {
    (api.updateProfile as any).mockResolvedValueOnce({
      ...mockProfile,
      avatar: 'data:image/png;base64,fake-data',
    });

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('汤姆主管')).toBeInTheDocument();
    });

    // Mock FileReader
    const fakeDataUrl = 'data:image/png;base64,dGVzdC1hd2Vzb21l';
    class MockFileReader {
      onload: any = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: fakeDataUrl } });
          }
        }, 10);
      }
    }
    const originalFileReader = window.FileReader;
    (window as any).FileReader = MockFileReader;

    // Open avatar modal
    fireEvent.click(screen.getByLabelText('点击修改头像'));

    await waitFor(() => {
      expect(screen.getByLabelText('上传头像文件')).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText('上传头像文件') as HTMLInputElement;
    const validFile = new File(['valid'], 'avatar.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByText('自定义上传图片 (Data URL)')).toBeInTheDocument();
    });

    // Confirm avatar selection
    fireEvent.click(screen.getByRole('button', { name: /确认选择/ }));

    const saveBtn = screen.getByRole('button', { name: /保存资料设置/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith({
        nickname: '汤姆主管',
        email: 'tom@opshub.dev',
        avatar: fakeDataUrl,
      });
    });

    (window as any).FileReader = originalFileReader;
  });

  it('allows resetting avatar back to default', async () => {
    (api.getProfile as any).mockResolvedValueOnce({
      ...mockProfile,
      avatar: 'preset:ops-chan',
    });

    (api.updateProfile as any).mockResolvedValueOnce({
      ...mockProfile,
      avatar: '',
    });

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} onLogout={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('汤姆主管')).toBeInTheDocument();
    });

    // Open avatar modal
    fireEvent.click(screen.getByLabelText('点击修改头像'));

    await waitFor(() => {
      expect(screen.getByText('重置默认')).toBeInTheDocument();
    });

    const resetBtn = screen.getByText('重置默认');
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByText('系统默认首字母头像')).toBeInTheDocument();
    });

    // Confirm avatar reset
    fireEvent.click(screen.getByRole('button', { name: /确认选择/ }));

    const saveBtn = screen.getByRole('button', { name: /保存资料设置/ });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith({
        nickname: '汤姆主管',
        email: 'tom@opshub.dev',
        avatar: '',
      });
    });
  });
});
