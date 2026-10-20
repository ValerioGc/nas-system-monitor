export type Section = 'monitor' | 'processes';

export type SensorGroup = 'cpu' | 'gpu' | 'ram' | 'disk';

export type SensorMetric = 'temperature' | 'usage' | 'power' | 'tdp';

export interface Sensor {
  id: string;
  group: SensorGroup;
  device: string;
  label: string;
  metric: SensorMetric;
  value: number;
}

export type ProcessKind = 'user' | 'nas' | 'system';

export type ProcessState = 'running' | 'sleeping' | 'waiting' | 'stopped' | 'zombie' | 'idle';

export interface ProcessEntry {
  id: number;
  name: string;
  process: string;
  ram: number;
  cpu: number;
  gpu: number | null;
  state: ProcessState;
  kind: ProcessKind;
  started: number;
  unit: string | null;
  canTerminate: boolean;
  canRestart: boolean;
}

export type ProcessAction = 'terminate' | 'restart';

export type ProcessFilter = ProcessKind | 'all';

export type ProcessMemoryUnit = 'mb' | 'percent';

export interface SystemMetrics {
  cpu: number;
  cores: number;
  physicalCores?: number | null;
  temperature: number | null;
  ram: number;
  ramTotal: number;
  swap: number;
  swapTotal: number;
  load: number;
  uptime: number;
}

export interface Telemetry {
  metrics: SystemMetrics;
  processes: ProcessEntry[];
  sensors: Sensor[];
}

export interface Preferences {
  processMemoryUnit: ProcessMemoryUnit;
  widgetList: ProcessFilter;
  widgetHideQuiet: boolean;
  widgetSensors: string[];
  monitorCollapsed: boolean;
  refreshSeconds: number;
}
