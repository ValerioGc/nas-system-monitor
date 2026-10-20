import { expect, it } from 'vitest';
import {
  chosen,
  fill,
  filterProcesses,
  formatValue,
  inGroup,
  isQuiet,
  tone,
} from '@/utils/sensors';
import { PROCESSES, SENSORS, process, sensor } from '@/tests/fixtures/telemetry';

it('writes each reading with its unit', () => {
  expect(formatValue(sensor({ value: 42.4 }))).toBe('42%');
  expect(formatValue(sensor({ metric: 'temperature', value: 51.6 }))).toBe('52 °C');
  expect(formatValue(sensor({ metric: 'power', value: 12.34 }))).toBe('12.3 W');
  expect(formatValue(sensor({ metric: 'tdp', value: 65 }))).toBe('65.0 W');
});

it('fills a bar for shares and degrees only, and says how hot or busy a reading is', () => {
  expect(fill(sensor({ value: 150 }))).toBe(1);
  expect(fill(sensor({ value: -5 }))).toBe(0);
  expect(fill(sensor({ metric: 'power' }))).toBeNull();
  expect(tone(sensor({ value: 10 }))).toBe('normal');
  expect(tone(sensor({ value: 75 }))).toBe('warning');
  expect(tone(sensor({ value: 95 }))).toBe('danger');
  expect(tone(sensor({ metric: 'temperature', value: 86 }))).toBe('danger');
  expect(tone(sensor({ metric: 'tdp', value: 300 }))).toBe('normal');
});

it('groups the sensors, keeps the order of the chosen ones and filters the processes', () => {
  expect(inGroup(SENSORS, 'cpu')).toHaveLength(3);
  expect(chosen(SENSORS, ['ram-usage', 'gone', 'cpu-usage']).map((item) => item.id)).toEqual([
    'ram-usage',
    'cpu-usage',
  ]);
  expect(filterProcesses(PROCESSES, 'all')).toHaveLength(3);
  expect(filterProcesses(PROCESSES, 'nas').map((item) => item.name)).toEqual(['nas-os']);
});

it('calls quiet a process that waits and uses nothing at all', () => {
  const kworker = process({ state: 'idle', cpu: 0, gpu: null, ram: 0 });
  expect(isQuiet(kworker)).toBe(true);
  expect(isQuiet({ ...kworker, state: 'sleeping', gpu: 0 })).toBe(true);
  expect(isQuiet({ ...kworker, state: 'running' })).toBe(false);
  expect(isQuiet({ ...kworker, cpu: 0.1 })).toBe(false);
  expect(isQuiet({ ...kworker, gpu: 2 })).toBe(false);
  expect(isQuiet({ ...kworker, ram: 4 })).toBe(false);
});
