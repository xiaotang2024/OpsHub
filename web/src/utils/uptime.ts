import { useState, useEffect } from 'react';

export type UptimeFormat = 'etime' | 'human_en' | 'human_zh';

/**
 * Parse ps etime format: [[dd-]hh:]mm:ss or [dd-]mm:ss
 * e.g., "02:15", "01:23:45", "3-04:12:30", "1-02:15"
 */
export function parseEtime(str: string): number | null {
  const trimmed = str.trim();
  let days = 0;
  let timePart = trimmed;

  if (trimmed.includes('-')) {
    const dashIdx = trimmed.indexOf('-');
    const dayStr = trimmed.substring(0, dashIdx);
    if (!/^\d+$/.test(dayStr)) return null;
    days = parseInt(dayStr, 10);
    timePart = trimmed.substring(dashIdx + 1);
  }

  const parts = timePart.split(':');
  if (parts.length === 2) {
    const [mStr, sStr] = parts;
    if (!/^\d+$/.test(mStr) || !/^\d+$/.test(sStr)) return null;
    return days * 86400 + parseInt(mStr, 10) * 60 + parseInt(sStr, 10);
  }
  if (parts.length === 3) {
    const [hStr, mStr, sStr] = parts;
    if (!/^\d+$/.test(hStr) || !/^\d+$/.test(mStr) || !/^\d+$/.test(sStr)) return null;
    return days * 86400 + parseInt(hStr, 10) * 3600 + parseInt(mStr, 10) * 60 + parseInt(sStr, 10);
  }

  return null;
}

/**
 * Format total seconds to ps etime format: mm:ss, hh:mm:ss, or d-hh:mm:ss
 */
export function formatEtime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);
  const rem1 = safeSeconds % 86400;
  const hours = Math.floor(rem1 / 3600);
  const rem2 = rem1 % 3600;
  const minutes = Math.floor(rem2 / 60);
  const seconds = rem2 % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0) {
    return `${days}-${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Parse human English format, e.g. "3d 4h 12m", "2h 15m", "10m", "45s", "3d 12h"
 */
export function parseHumanEn(str: string): number | null {
  const trimmed = str.trim();
  if (!trimmed || !/[dhms]/i.test(trimmed)) return null;

  const regex = /^(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i;
  const match = trimmed.match(regex);
  if (!match) return null;

  const [_, d, h, m, s] = match;
  if (!d && !h && !m && !s) return null;

  const days = d ? parseInt(d, 10) : 0;
  const hours = h ? parseInt(h, 10) : 0;
  const minutes = m ? parseInt(m, 10) : 0;
  const seconds = s ? parseInt(s, 10) : 0;

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format total seconds to human English format, e.g. "3d 4h 12m 00s", "2h 15m 00s", "10m 00s"
 */
export function formatHumanEn(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);
  const rem1 = safeSeconds % 86400;
  const hours = Math.floor(rem1 / 3600);
  const rem2 = rem1 % 3600;
  const minutes = Math.floor(rem2 / 60);
  const seconds = rem2 % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(parts.length > 0 ? `${pad(seconds)}s` : `${seconds}s`);

  return parts.join(' ');
}

/**
 * Parse Chinese human format, e.g. "3天4小时12分", "2小时15分", "10分30秒"
 */
export function parseHumanZh(str: string): number | null {
  const trimmed = str.trim();
  if (!trimmed || !/[天时分秒]/.test(trimmed)) return null;

  const regex = /^(?:(\d+)\s*天)?\s*(?:(\d+)\s*(?:小时|时))?\s*(?:(\d+)\s*分(?:钟)?)?\s*(?:(\d+)\s*秒)?$/;
  const match = trimmed.match(regex);
  if (!match) return null;

  const [_, d, h, m, s] = match;
  if (!d && !h && !m && !s) return null;

  const days = d ? parseInt(d, 10) : 0;
  const hours = h ? parseInt(h, 10) : 0;
  const minutes = m ? parseInt(m, 10) : 0;
  const seconds = s ? parseInt(s, 10) : 0;

  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format total seconds to Chinese human format, e.g. "3天4小时12分00秒", "2小时15分00秒"
 */
export function formatHumanZh(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);
  const rem1 = safeSeconds % 86400;
  const hours = Math.floor(rem1 / 3600);
  const rem2 = rem1 % 3600;
  const minutes = Math.floor(rem2 / 60);
  const seconds = rem2 % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0 || days > 0) parts.push(`${hours}小时`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分`);
  parts.push(parts.length > 0 ? `${pad(seconds)}秒` : `${seconds}秒`);

  return parts.join('');
}

/**
 * Parse any supported uptime string format into total seconds and detected format.
 */
export function parseUptime(str: string | null | undefined): { totalSeconds: number; format: UptimeFormat } | null {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (['stopped', 'unknown', '离线', '未运行', '-', '在线'].includes(lower)) {
    return null;
  }

  const etimeSec = parseEtime(trimmed);
  if (etimeSec !== null) {
    return { totalSeconds: etimeSec, format: 'etime' };
  }

  const zhSec = parseHumanZh(trimmed);
  if (zhSec !== null) {
    return { totalSeconds: zhSec, format: 'human_zh' };
  }

  const enSec = parseHumanEn(trimmed);
  if (enSec !== null) {
    return { totalSeconds: enSec, format: 'human_en' };
  }

  return null;
}

/**
 * Format total seconds according to the specified format.
 */
export function formatUptime(totalSeconds: number, format: UptimeFormat): string {
  switch (format) {
    case 'etime':
      return formatEtime(totalSeconds);
    case 'human_zh':
      return formatHumanZh(totalSeconds);
    case 'human_en':
    default:
      return formatHumanEn(totalSeconds);
  }
}

/**
 * React hook that takes a raw uptime string and increments it second-by-second
 * in real-time without clock drift.
 */
export function useLiveUptime(rawUptime: string | null | undefined, isRunning: boolean = true): string {
  const computeDisplay = () => {
    if (!rawUptime || !isRunning) return rawUptime || '';
    const parsed = parseUptime(rawUptime);
    if (!parsed) return rawUptime;
    return formatUptime(parsed.totalSeconds, parsed.format);
  };

  const [uptimeStr, setUptimeStr] = useState<string>(computeDisplay);

  useEffect(() => {
    if (!rawUptime || !isRunning) {
      setUptimeStr(rawUptime || '');
      return;
    }

    const parsed = parseUptime(rawUptime);
    if (!parsed) {
      setUptimeStr(rawUptime);
      return;
    }

    const { totalSeconds: baseSeconds, format } = parsed;
    const startTimestamp = Date.now();

    setUptimeStr(formatUptime(baseSeconds, format));

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
      setUptimeStr(formatUptime(baseSeconds + elapsed, format));
    }, 1000);

    return () => clearInterval(interval);
  }, [rawUptime, isRunning]);

  return uptimeStr;
}
