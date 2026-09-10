import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { describe, it, expect } from 'vitest';

describe('App Component', () => {
  it('renders application with shell and default services view', () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    expect(screen.getByText('OpsHub')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /服务列表 \/ Services/i })).toBeInTheDocument();
  });
});
