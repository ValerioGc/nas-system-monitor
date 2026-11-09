import { toRaw } from 'vue';
import { createNasShell } from '@valeriogc/nas-base-app';

type ShellRequest = 'process-action';

const TIMEOUT_MS = 10000;

export const shell = createNasShell({ timeoutMs: TIMEOUT_MS });

export async function askNasShell<T>(
  type: ShellRequest,
  payload?: unknown,
  timeoutMs = TIMEOUT_MS,
): Promise<T> {
  const plain: unknown = payload === undefined ? undefined : structuredClone(toRaw(payload));
  const answer = await shell.request(type, { payload: plain }, { timeoutMs }).catch(() => {
    throw new Error('Launcher unavailable');
  });

  if (!answer.success) {
    throw new Error(answer.error ?? 'Launcher unavailable');
  }

  return answer.data as T;
}

const SMART_TIMEOUT_MS = 45000;

/**
 * Reads the S.M.A.R.T. data of a disk through the launcher, which runs smartctl as root and leaves
 * a spun down disk alone.
 */
export async function readSmart(device: string): Promise<unknown> {
  const answer = await shell
    .request('smart-disk', { device }, { timeoutMs: SMART_TIMEOUT_MS })
    .catch(() => {
      throw new Error('Launcher unavailable');
    });

  if (!answer.success) {
    throw new Error(answer.error ?? 'S.M.A.R.T. unavailable');
  }

  return answer.data;
}
