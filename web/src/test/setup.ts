import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Mock @number-flow/react for JSDOM environment
vi.mock('@number-flow/react', () => ({
  default: ({ value, prefix = '', suffix = '', className, ...props }: any) => {
    return React.createElement('span', { className, ...props }, `${prefix}${value ?? ''}${suffix}`);
  },
}));

// JSDOM canvas mock for xterm.js
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => {
    return {
      fillStyle: '',
      fillRect: () => {},
      clearRect: () => {},
      getImageData: (x: number, y: number, w: number, h: number) => ({
        data: new Array(w * h * 4).fill(0),
      }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {},
      rect: () => {},
      clip: () => {},
    } as any;
  }) as any;
}

// JSDOM Web Animations API mock for @formkit/auto-animate
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = () => ({
    finished: Promise.resolve(),
    cancel: () => {},
    play: () => {},
    pause: () => {},
    reverse: () => {},
    finish: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  } as any);
}

