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
