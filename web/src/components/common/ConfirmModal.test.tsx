import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmModal } from './ConfirmModal';

describe('ConfirmModal Component', () => {
  it('does not render when visible is false', () => {
    render(
      <ConfirmModal
        visible={false}
        title="确认删除"
        message="确定要删除该项吗？"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
  });

  it('renders modal with content when visible is true', () => {
    render(
      <ConfirmModal
        visible={true}
        title="删除确认"
        subtitle="不可恢复操作"
        message="此操作将永久删除数据"
        confirmText="确认删除"
        cancelText="取消返回"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
    expect(screen.getByText('删除确认')).toBeInTheDocument();
    expect(screen.getByText('不可恢复操作')).toBeInTheDocument();
    expect(screen.getByText('此操作将永久删除数据')).toBeInTheDocument();
    expect(screen.getByText('确认删除')).toBeInTheDocument();
    expect(screen.getByText('取消返回')).toBeInTheDocument();
  });

  it('triggers onConfirm when confirm button is clicked', () => {
    const handleConfirm = vi.fn();
    render(
      <ConfirmModal
        visible={true}
        title="确认删除"
        message="确认删除吗？"
        onConfirm={handleConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('confirm-modal-btn'));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when cancel button or backdrop is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <ConfirmModal
        visible={true}
        title="确认操作"
        message="确认吗？"
        onConfirm={vi.fn()}
        onCancel={handleCancel}
      />
    );

    fireEvent.click(screen.getByText('取消'));
    expect(handleCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('confirm-modal-backdrop'));
    expect(handleCancel).toHaveBeenCalledTimes(2);
  });

  it('disables buttons and does not trigger onCancel on backdrop click when loading is true', () => {
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();
    render(
      <ConfirmModal
        visible={true}
        title="删除中"
        message="正在执行删除..."
        loading={true}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    const confirmBtn = screen.getByTestId('confirm-modal-btn');
    const cancelBtn = screen.getByText('取消');

    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId('confirm-modal-backdrop'));
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it('supports warning and primary variants', () => {
    const { rerender } = render(
      <ConfirmModal
        visible={true}
        variant="warning"
        title="警告提示"
        message="请注意"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();

    rerender(
      <ConfirmModal
        visible={true}
        variant="primary"
        title="普通操作"
        message="请确认"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
  });
});
