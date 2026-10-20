import { askNasShell } from '@/services/nasShell';
import type { ProcessAction, ProcessEntry, Telemetry } from '@/types';

const RESTART_WAIT_MS = 125000;

export async function readTelemetry(): Promise<Telemetry> {
  const response = await fetch('api/telemetry', {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Processes unavailable';
    throw new Error(error);
  }

  return response.json() as Promise<Telemetry>;
}

export const actOnProcess = (process: ProcessEntry, action: ProcessAction) =>
  askNasShell<null>(
    'process-action',
    { id: process.id, started: process.started, action },
    RESTART_WAIT_MS,
  );
