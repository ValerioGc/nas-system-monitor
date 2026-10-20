import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

function backend(saved: unknown = null) {
  let stored = JSON.stringify(saved);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        stored = String(init.body);
        return new Response(null, { status: 204 });
      }
      return new Response(stored);
    }),
  );
  return (): Record<string, unknown> => JSON.parse(stored);
}

async function loaded(saved: unknown = null) {
  const preferences = backend(saved);
  const module = await import('@/composables/usePreferences');
  await module.loadPreferences();
  return { ...module, saved: preferences };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the preferences', () => {
  it('keep only what is valid of what was saved', async () => {
    const { parsePreferences } = await import('@/composables/usePreferences');
    expect(parsePreferences('not an object')).toEqual(parsePreferences(null));
    expect(
      parsePreferences({
        widgetList: 'nas',
        widgetHideQuiet: false,
        widgetSensors: ['a', 2, 'b', 'c', 'd', 'e', 'f', 'g'],
        monitorCollapsed: true,
        refreshSeconds: 999,
      }),
    ).toEqual({
      processMemoryUnit: 'mb',
      widgetList: 'nas',
      widgetHideQuiet: false,
      widgetSensors: ['a', 'b', 'c', 'd', 'e', 'f'],
      monitorCollapsed: true,
      refreshSeconds: 5,
    });
    expect(parsePreferences({ widgetList: 'other', refreshSeconds: 10 })).toEqual(
      expect.objectContaining({ widgetList: 'all', widgetHideQuiet: true, refreshSeconds: 10 }),
    );
  });

  it('take at most six sensors for the widget and save every change on the backend', async () => {
    const { usePreferences, saved } = await loaded({ widgetList: 'user' });
    const { preferences, toggleSensor, setWidgetList, setCollapsed, setRefresh } = usePreferences();
    expect(preferences.value.widgetList).toBe('user');
    for (const id of ['a', 'b', 'c', 'd']) {
      toggleSensor(id);
    }
    expect(preferences.value.widgetSensors).toHaveLength(6);
    expect(toggleSensor('e')).toBe(false);
    expect(toggleSensor('a')).toBe(true);
    expect(preferences.value.widgetSensors).not.toContain('a');

    setWidgetList('system');
    setCollapsed(true);
    setRefresh(10);
    await vi.advanceTimersByTimeAsync(400);
    expect(saved()).toEqual(
      expect.objectContaining({ widgetList: 'system', monitorCollapsed: true, refreshSeconds: 10 }),
    );
  });

  it('moves a sensor of the widget up or down, and keeps it at either end', async () => {
    const { usePreferences, saved } = await loaded({ widgetSensors: ['a', 'b', 'c'] });
    const { preferences, moveSensor } = usePreferences();
    moveSensor('c', -1);
    expect(preferences.value.widgetSensors).toEqual(['a', 'c', 'b']);
    moveSensor('a', 1);
    expect(preferences.value.widgetSensors).toEqual(['c', 'a', 'b']);
    moveSensor('c', -1);
    moveSensor('b', 1);
    moveSensor('gone', 1);
    expect(preferences.value.widgetSensors).toEqual(['c', 'a', 'b']);
    await vi.advanceTimersByTimeAsync(400);
    expect(saved().widgetSensors).toEqual(['c', 'a', 'b']);
  });

  it('validates the memory unit and saves it with the other settings', async () => {
    const { parsePreferences, usePreferences, saved } = await loaded();
    expect(parsePreferences({ processMemoryUnit: 'percent' }).processMemoryUnit).toBe('percent');
    expect(parsePreferences({ processMemoryUnit: 'gb' }).processMemoryUnit).toBe('mb');
    usePreferences().setProcessMemoryUnit('percent');
    await vi.advanceTimersByTimeAsync(400);
    expect(saved().processMemoryUnit).toBe('percent');
  });

  it('carry over what this browser kept before', async () => {
    localStorage.setItem('nas-system-monitor-preferences', JSON.stringify({ widgetList: 'nas' }));
    const { usePreferences, saved } = await loaded();
    expect(usePreferences().preferences.value.widgetList).toBe('nas');
    await nextTick();
    await vi.advanceTimersByTimeAsync(400);
    expect(saved().widgetList).toBe('nas');
  });
});
