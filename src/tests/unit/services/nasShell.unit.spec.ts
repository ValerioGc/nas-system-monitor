import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isReactive, reactive } from 'vue';
import { askNasShell, readSmart } from '@/services/nasShell';

let parent: { postMessage: ReturnType<typeof vi.fn> };
let originalParent: PropertyDescriptor | undefined;

function arrive(data: unknown, origin = window.location.origin, source: unknown = parent) {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { value: source });
  window.dispatchEvent(event);
}

function lastRequest() {
  return (parent.postMessage.mock.calls.at(-1)?.[0] as { requestId: string }).requestId;
}

beforeEach(() => {
  originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  parent = { postMessage: vi.fn() };
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalParent) {
    Object.defineProperty(window, 'parent', originalParent);
  }
});

describe('the conversation with the shell', () => {
  it('asks with a request id and resolves with what the shell answers', async () => {
    const asked = askNasShell<{ notifyFailures: boolean }>('process-action', {
      notifyFailures: true,
    });
    const sent = parent.postMessage.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      nas: 1,
      type: 'process-action',
      payload: { notifyFailures: true },
    });

    arrive({
      nas: 1,
      type: 'process-action-result',
      requestId: lastRequest(),
      success: true,
      data: { notifyFailures: true },
    });

    await expect(asked).resolves.toEqual({ notifyFailures: true });
  });

  it('sends a reactive object of the page as plain data, which postMessage can copy', () => {
    const settings = reactive({ notifyFailures: true });
    void askNasShell('process-action', settings).catch(() => undefined);

    const sent = parent.postMessage.mock.calls.at(-1)?.[0] as { payload: unknown };
    expect(isReactive(sent.payload)).toBe(false);
    expect(sent.payload).toEqual({ notifyFailures: true });
    expect(() => structuredClone(sent.payload)).not.toThrow();
  });

  it('rejects with the reason of a refusal, or a generic one', async () => {
    const refused = askNasShell('process-action', { kind: 'ip', value: 'x', label: '' });
    arrive({
      nas: 1,
      type: 'process-action-result',
      requestId: lastRequest(),
      success: false,
      error: 'invalid IP address',
    });
    await expect(refused).rejects.toThrow('invalid IP address');

    const silent = askNasShell('process-action');
    arrive({ nas: 1, type: 'process-action-result', requestId: lastRequest(), success: false });
    await expect(silent).rejects.toThrow('Launcher unavailable');
  });

  it('takes no answer from another window, another origin or another protocol', async () => {
    vi.useFakeTimers();
    const asked = askNasShell('process-action');
    const requestId = lastRequest();
    const answer = { type: 'process-action-result', requestId, success: true, data: ['forged'] };

    arrive({ nas: 1, ...answer }, 'https://evil.example');
    arrive({ nas: 1, ...answer }, location.origin, { postMessage: vi.fn() });
    arrive({ nas: 2, ...answer });
    arrive(null);
    vi.advanceTimersByTime(10_000);

    await expect(asked).rejects.toThrow('Launcher unavailable');
  });

  it('cannot ask outside the launcher', async () => {
    Object.defineProperty(window, 'parent', { configurable: true, value: window });

    await expect(askNasShell('process-action')).rejects.toThrow('Launcher unavailable');
  });
});

describe('the S.M.A.R.T. reading of a disk', () => {
  it('names the disk at the top of the request and returns what the launcher read', async () => {
    const read = readSmart('sdb');
    expect(parent.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      nas: 1,
      type: 'smart-disk',
      device: 'sdb',
    });
    arrive({
      nas: 1,
      type: 'smart-disk-result',
      requestId: lastRequest(),
      success: true,
      data: { standby: true },
    });
    await expect(read).resolves.toEqual({ standby: true });
  });

  it('passes on why the launcher could not read it', async () => {
    const refused = readSmart('sdb');
    arrive({
      nas: 1,
      type: 'smart-disk-result',
      requestId: lastRequest(),
      success: false,
      error: 'device not found',
    });
    await expect(refused).rejects.toThrow('device not found');

    const silent = readSmart('sdc');
    arrive({ nas: 1, type: 'smart-disk-result', requestId: lastRequest(), success: false });
    await expect(silent).rejects.toThrow('S.M.A.R.T. unavailable');
  });

  it('gives up when the launcher does not answer, as smartctl may take a while', async () => {
    vi.useFakeTimers();
    const unanswered = readSmart('sdb');
    const failed = expect(unanswered).rejects.toThrow('Launcher unavailable');
    await vi.advanceTimersByTimeAsync(45000);
    await failed;
  });
});
