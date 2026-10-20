import { readonly } from 'vue';
import { storedDocument } from '@valeriogc/nas-base-app';
import type { Preferences, ProcessFilter, ProcessMemoryUnit } from '@/types';

export const WIDGET_SENSOR_LIMIT = 6;
export const REFRESH_SECONDS = { min: 2, max: 60 };

const FILTERS: ProcessFilter[] = ['user', 'nas', 'system', 'all'];
const DEFAULTS: Preferences = {
  processMemoryUnit: 'mb',
  widgetList: 'all',
  widgetHideQuiet: true,
  widgetSensors: ['cpu-usage', 'ram-usage'],
  monitorCollapsed: false,
  refreshSeconds: 5,
};

export function parsePreferences(saved: unknown): Preferences {
  const stored: Partial<Record<keyof Preferences, unknown>> =
    saved && typeof saved === 'object' ? saved : {};
  const seconds = stored.refreshSeconds;
  return {
    processMemoryUnit:
      stored.processMemoryUnit === 'percent' ? 'percent' : DEFAULTS.processMemoryUnit,
    widgetList: FILTERS.find((filter) => filter === stored.widgetList) ?? DEFAULTS.widgetList,
    widgetHideQuiet:
      typeof stored.widgetHideQuiet === 'boolean'
        ? stored.widgetHideQuiet
        : DEFAULTS.widgetHideQuiet,
    widgetSensors: Array.isArray(stored.widgetSensors)
      ? stored.widgetSensors
          .filter((id): id is string => typeof id === 'string')
          .slice(0, WIDGET_SENSOR_LIMIT)
      : [...DEFAULTS.widgetSensors],
    monitorCollapsed:
      typeof stored.monitorCollapsed === 'boolean'
        ? stored.monitorCollapsed
        : DEFAULTS.monitorCollapsed,
    refreshSeconds:
      typeof seconds === 'number' &&
      Number.isInteger(seconds) &&
      seconds >= REFRESH_SECONDS.min &&
      seconds <= REFRESH_SECONDS.max
        ? seconds
        : DEFAULTS.refreshSeconds,
  };
}

const stored = storedDocument('preferences', {
  parse: parsePreferences,
  legacyKey: 'nas-system-monitor-preferences',
});
const preferences = stored.value;

export const loadPreferences = stored.load;

function change(update: Partial<Preferences>) {
  preferences.value = { ...preferences.value, ...update };
}

export function usePreferences() {
  function toggleSensor(id: string) {
    const chosen = preferences.value.widgetSensors;
    if (chosen.includes(id)) {
      change({ widgetSensors: chosen.filter((item) => item !== id) });
      return true;
    }
    if (chosen.length >= WIDGET_SENSOR_LIMIT) {
      return false;
    }
    change({ widgetSensors: [...chosen, id] });
    return true;
  }

  function moveSensor(id: string, step: -1 | 1) {
    const chosen = [...preferences.value.widgetSensors];
    const from = chosen.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= chosen.length) {
      return;
    }
    [chosen[from], chosen[to]] = [chosen[to]!, chosen[from]!];
    change({ widgetSensors: chosen });
  }

  return {
    preferences: readonly(preferences),
    toggleSensor,
    moveSensor,
    setWidgetList: (widgetList: ProcessFilter) => change({ widgetList }),
    setWidgetHideQuiet: (widgetHideQuiet: boolean) => change({ widgetHideQuiet }),
    setProcessMemoryUnit: (processMemoryUnit: ProcessMemoryUnit) => change({ processMemoryUnit }),
    setCollapsed: (monitorCollapsed: boolean) => change({ monitorCollapsed }),
    setRefresh: (refreshSeconds: number) => change({ refreshSeconds }),
  };
}
