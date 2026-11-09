import { temperatureTone, type TemperatureSource } from '@valeriogc/nas-base-app';
import type {
  DiskReading,
  ProcessEntry,
  ProcessFilter,
  Sensor,
  SensorGroup,
  SensorMetric,
} from '@/types';

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

type Judged = Pick<Sensor, 'metric' | 'value' | 'group' | 'device'>;

function temperatureSource(sensor: Judged): TemperatureSource {
  if (sensor.group !== 'disk') {
    return 'chip';
  }
  return sensor.device.startsWith('nvme') ? 'nvme' : 'disk';
}

export function tone(sensor: Judged) {
  if (sensor.metric === 'temperature') {
    return temperatureTone(sensor.value, temperatureSource(sensor));
  }
  if (sensor.metric !== 'usage') {
    return 'normal';
  }

  if (sensor.value >= 90) {
    return 'danger';
  }

  return sensor.value >= 70 ? 'warning' : 'normal';
}

/**
 * The disks whose sensors give no temperature, which only S.M.A.R.T. can tell. Their sensors are
 * named `disk-<kernel name>-<reading>`.
 */
export function disksWithoutTemperature(sensors: Sensor[]) {
  const disks = new Map<string, { name: string; device: string; warm: boolean }>();
  for (const sensor of inGroup(sensors, 'disk')) {
    const name = sensor.id.split('-')[1];
    if (!name) {
      continue;
    }
    const disk = disks.get(name) ?? { name, device: sensor.device, warm: false };
    disk.warm ||= sensor.metric === 'temperature';
    disks.set(name, disk);
  }
  return [...disks.values()]
    .filter((disk) => !disk.warm)
    .map(({ name, device }) => ({ name, device }));
}

/** What the S.M.A.R.T. answer of the launcher says about the temperature of a disk. */
export function readingOf(data: unknown): DiskReading {
  const answer = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (answer.standby === true) {
    return { state: 'standby' };
  }
  const temperature = answer.temperature;
  const current =
    temperature && typeof temperature === 'object'
      ? (temperature as Record<string, unknown>).current
      : undefined;
  return typeof current === 'number' && Number.isFinite(current)
    ? { state: 'temperature', celsius: current }
    : { state: 'missing' };
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
