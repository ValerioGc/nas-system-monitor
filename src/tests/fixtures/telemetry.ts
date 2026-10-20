import type { ProcessEntry, Sensor, Telemetry } from '@/types';

export function sensor(changes: Partial<Sensor> = {}): Sensor {
  return {
    id: 'cpu-usage',
    group: 'cpu',
    device: 'CPU',
    label: 'usage',
    metric: 'usage',
    value: 42,
    ...changes,
  };
}

export function process(changes: Partial<ProcessEntry> = {}): ProcessEntry {
  return {
    id: 100,
    name: 'worker',
    process: '/usr/bin/worker --serve',
    ram: 64,
    cpu: 3.5,
    gpu: null,
    state: 'sleeping',
    kind: 'user',
    started: 900,
    unit: 'user@1000.service',
    canTerminate: true,
    canRestart: false,
    ...changes,
  };
}

export const SENSORS: Sensor[] = [
  sensor(),
  sensor({ id: 'cpu-coretemp-temp-0', metric: 'temperature', label: 'Package id 0', value: 88 }),
  sensor({ id: 'cpu-intel-rapl:0-tdp', metric: 'tdp', label: 'power limit', value: 65 }),
  sensor({ id: 'ram-usage', group: 'ram', device: 'RAM', value: 75 }),
  sensor({ id: 'disk-sda-usage', group: 'disk', device: 'sda (WDC)', label: 'activity', value: 3 }),
];

export const PROCESSES: ProcessEntry[] = [
  process(),
  process({
    id: 1,
    name: 'nas-os',
    kind: 'nas',
    cpu: 9,
    gpu: 12,
    state: 'running',
    unit: 'nas-os.service',
    canTerminate: false,
    canRestart: true,
  }),
  process({ id: 50, name: 'cron', kind: 'system', cpu: 0.1, ram: 4, unit: 'cron.service' }),
];

export function telemetry(changes: Partial<Telemetry> = {}): Telemetry {
  return {
    metrics: {
      cpu: 42,
      cores: 8,
      physicalCores: 4,
      temperature: 50,
      ram: 6,
      ramTotal: 8,
      swap: 0.5,
      swapTotal: 2,
      load: 1.25,
      uptime: 90000,
    },
    processes: PROCESSES,
    sensors: SENSORS,
    ...changes,
  };
}
