import type { ProcessEntry, ProcessFilter, Sensor, SensorGroup, SensorMetric } from '@/types';

export const GROUPS: SensorGroup[] = ['cpu', 'gpu', 'ram', 'disk'];

const UNITS: Record<SensorMetric, string> = {
  temperature: '°C',
  usage: '%',
  power: 'W',
  tdp: 'W',
};

export function formatValue(sensor: Pick<Sensor, 'metric' | 'value'>) {
  const digits = sensor.metric === 'usage' || sensor.metric === 'temperature' ? 0 : 1;
  const value = sensor.value.toFixed(digits);
  return sensor.metric === 'usage' ? `${value}%` : `${value} ${UNITS[sensor.metric]}`;
}

export function fill(sensor: Pick<Sensor, 'metric' | 'value'>) {
  if (sensor.metric === 'power' || sensor.metric === 'tdp') {
    return null;
  }

  return Math.min(Math.max(sensor.value / 100, 0), 1);
}

export function tone(sensor: Pick<Sensor, 'metric' | 'value'>) {
  const [warm, hot] = sensor.metric === 'temperature' ? [70, 85] : [70, 90];
  if (sensor.metric !== 'temperature' && sensor.metric !== 'usage') {
    return 'normal';
  }

  if (sensor.value >= hot) {
    return 'danger';
  }

  return sensor.value >= warm ? 'warning' : 'normal';
}

export function inGroup(sensors: Sensor[], group: SensorGroup) {
  return sensors.filter((sensor) => sensor.group === group);
}

export function chosen(sensors: Sensor[], ids: readonly string[]) {
  return ids.flatMap((id) => sensors.find((sensor) => sensor.id === id) ?? []);
}

export function filterProcesses(processes: ProcessEntry[], filter: ProcessFilter) {
  return filter === 'all' ? processes : processes.filter((process) => process.kind === filter);
}

export function isQuiet(process: ProcessEntry) {
  return (
    process.state !== 'running' && process.cpu <= 0 && (process.gpu ?? 0) <= 0 && process.ram <= 0
  );
}
