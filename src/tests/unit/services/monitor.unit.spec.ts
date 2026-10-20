import { afterEach, expect, it, vi } from 'vitest';
import { actOnProcess, readTelemetry } from '@/services/monitor';
import { askNasShell } from '@/services/nasShell';
import { process, telemetry } from '@/tests/fixtures/telemetry';

vi.mock('@/services/nasShell', () => ({ askNasShell: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

it('reads its own backend through a relative path and delegates only privileged actions to the shell', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(telemetry())));
  vi.stubGlobal('fetch', fetch);
  expect(await readTelemetry()).toEqual(telemetry());
  await actOnProcess(process(), 'restart');

  expect(vi.mocked(askNasShell).mock.calls).toEqual([
    ['process-action', { id: 100, started: 900, action: 'restart' }, 125000],
  ]);
  expect(fetch).toHaveBeenCalledWith(
    'api/telemetry',
    expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
  );
});

it('reports a typed backend error or a missing response without asking the shell for readings', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Processes unavailable' }), { status: 503 }),
    )
    .mockResolvedValueOnce(new Response('not json', { status: 502 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 5 }), { status: 500 }));
  vi.stubGlobal('fetch', fetch);
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(readTelemetry()).rejects.toThrow('Processes unavailable');
  }
});
