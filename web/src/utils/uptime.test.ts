import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  parseEtime,
  formatEtime,
  parseHumanEn,
  formatHumanEn,
  parseHumanZh,
  formatHumanZh,
  parseUptime,
  formatUptime,
  useLiveUptime,
} from './uptime';

describe('uptime utilities', () => {
  describe('parseEtime & formatEtime', () => {
    it('parses mm:ss format', () => {
      expect(parseEtime('02:15')).toBe(135);
      expect(parseEtime('00:05')).toBe(5);
      expect(parseEtime('59:59')).toBe(3599);
    });

    it('parses hh:mm:ss format', () => {
      expect(parseEtime('01:23:45')).toBe(5025);
      expect(parseEtime('12:00:00')).toBe(43200);
    });

    it('parses d-hh:mm:ss format', () => {
      expect(parseEtime('1-02:03:04')).toBe(86400 + 7200 + 180 + 4);
      expect(parseEtime('3-04:12:30')).toBe(3 * 86400 + 4 * 3600 + 12 * 60 + 30);
    });

    it('returns null for invalid strings', () => {
      expect(parseEtime('invalid')).toBeNull();
      expect(parseEtime('3d 4h')).toBeNull();
      expect(parseEtime('')).toBeNull();
    });

    it('formats total seconds into ps etime format', () => {
      expect(formatEtime(5)).toBe('00:05');
      expect(formatEtime(135)).toBe('02:15');
      expect(formatEtime(5025)).toBe('01:23:45');
      expect(formatEtime(3 * 86400 + 4 * 3600 + 12 * 60 + 30)).toBe('3-04:12:30');
    });
  });

  describe('parseHumanEn & formatHumanEn', () => {
    it('parses human English duration strings', () => {
      expect(parseHumanEn('3d 4h 12m')).toBe(3 * 86400 + 4 * 3600 + 12 * 60);
      expect(parseHumanEn('2h 15m')).toBe(2 * 3600 + 15 * 60);
      expect(parseHumanEn('10m')).toBe(600);
      expect(parseHumanEn('45s')).toBe(45);
      expect(parseHumanEn('3d 12h')).toBe(3 * 86400 + 12 * 3600);
    });

    it('formats total seconds into human English strings', () => {
      expect(formatHumanEn(45)).toBe('45s');
      expect(formatHumanEn(600)).toBe('10m 00s');
      expect(formatHumanEn(8100)).toBe('2h 15m 00s');
      expect(formatHumanEn(3 * 86400 + 4 * 3600 + 12 * 60)).toBe('3d 4h 12m 00s');
    });
  });

  describe('parseHumanZh & formatHumanZh', () => {
    it('parses Chinese duration strings', () => {
      expect(parseHumanZh('3天4小时12分')).toBe(3 * 86400 + 4 * 3600 + 12 * 60);
      expect(parseHumanZh('2小时15分')).toBe(2 * 3600 + 15 * 60);
      expect(parseHumanZh('30秒')).toBe(30);
    });

    it('formats total seconds into Chinese strings', () => {
      expect(formatHumanZh(30)).toBe('30秒');
      expect(formatHumanZh(600)).toBe('10分00秒');
      expect(formatHumanZh(8100)).toBe('2小时15分00秒');
      expect(formatHumanZh(3 * 86400 + 4 * 3600 + 12 * 60)).toBe('3天4小时12分00秒');
    });
  });

  describe('parseUptime & formatUptime', () => {
    it('detects etime format', () => {
      const res = parseUptime('02:15');
      expect(res).toEqual({ totalSeconds: 135, format: 'etime' });
      expect(formatUptime(res!.totalSeconds, res!.format)).toBe('02:15');
    });

    it('returns null for offline / stopped statuses', () => {
      expect(parseUptime('stopped')).toBeNull();
      expect(parseUptime('unknown')).toBeNull();
      expect(parseUptime('离线')).toBeNull();
      expect(parseUptime('未运行')).toBeNull();
      expect(parseUptime('在线')).toBeNull();
      expect(parseUptime('-')).toBeNull();
      expect(parseUptime('')).toBeNull();
      expect(parseUptime(null)).toBeNull();
    });
  });

  describe('useLiveUptime hook', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('ticks forward each second when running', () => {
      const { result } = renderHook(() => useLiveUptime('02:15', true));
      expect(result.current).toBe('02:15');

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toBe('02:16');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current).toBe('02:18');
    });

    it('does not tick when isRunning is false', () => {
      const { result } = renderHook(() => useLiveUptime('02:15', false));
      expect(result.current).toBe('02:15');

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current).toBe('02:15');
    });

    it('handles human English strings gracefully', () => {
      const { result } = renderHook(() => useLiveUptime('2h 15m', true));
      expect(result.current).toBe('2h 15m 00s');

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current).toBe('2h 15m 03s');
    });

    it('resyncs cleanly when rawUptime prop updates', () => {
      let uptime = '02:15';
      const { result, rerender } = renderHook(() => useLiveUptime(uptime, true));
      expect(result.current).toBe('02:15');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current).toBe('02:17');

      // Backend metrics refresh arrives with updated uptime: '02:20'
      uptime = '02:20';
      rerender();
      expect(result.current).toBe('02:20');

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toBe('02:21');
    });
  });
});
