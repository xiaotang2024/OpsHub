import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PipelineAnimeProgressBar } from './PipelineAnimeProgressBar';

describe('PipelineAnimeProgressBar Component', () => {
  it('renders anime progress bar for step 1 with dialogue and percentage', () => {
    render(
      <PipelineAnimeProgressBar
        activeStep={1}
        totalSteps={7}
        running={true}
        finished={false}
        elapsedSeconds={2}
      />
    );

    expect(screen.getByTestId('pipeline-anime-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('anime-mascot-runner')).toBeInTheDocument();
    expect(screen.getByTestId('anime-speech-bubble')).toHaveTextContent(/全维预检/);
    expect(screen.getByTestId('anime-percent-badge')).toHaveTextContent(/14%/);
    expect(screen.getByText(/2s/)).toBeInTheDocument();
  });

  it('updates dialogue and percentage when activeStep changes to step 4', () => {
    render(
      <PipelineAnimeProgressBar
        activeStep={4}
        totalSteps={7}
        running={true}
        finished={false}
        elapsedSeconds={5}
      />
    );

    expect(screen.getByTestId('anime-speech-bubble')).toHaveTextContent(/制品分发/);
    expect(screen.getByTestId('anime-percent-badge')).toHaveTextContent(/57%/);
  });

  it('renders celebratory 100% state when finished is true', () => {
    render(
      <PipelineAnimeProgressBar
        activeStep={7}
        totalSteps={7}
        running={false}
        finished={true}
        elapsedSeconds={8}
      />
    );

    expect(screen.getByTestId('anime-speech-bubble')).toHaveTextContent(/大功告成/);
    expect(screen.getByTestId('anime-percent-badge')).toHaveTextContent(/100%/);
  });

  it('renders error dialogue when error prop is provided', () => {
    render(
      <PipelineAnimeProgressBar
        activeStep={6}
        totalSteps={7}
        running={false}
        finished={false}
        error="健康探针探测超时"
        elapsedSeconds={12}
      />
    );

    expect(screen.getByTestId('anime-speech-bubble')).toHaveTextContent(/异常中断/);
    expect(screen.getByText(/健康探针探测超时/)).toBeInTheDocument();
  });
});
