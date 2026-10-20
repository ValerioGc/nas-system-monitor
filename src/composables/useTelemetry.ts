import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/composables/usePreferences';
import { actOnProcess, readTelemetry } from '@/services/monitor';
import type { ProcessAction, ProcessEntry, Telemetry } from '@/types';
import { failureMessage } from '@/utils/failureMessage';

export function useTelemetry() {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const telemetry = ref<Telemetry | null>(null);
  const loading = ref(false);
  const error = ref('');
  const actionError = ref('');
  const acting = ref<number | null>(null);
  let timer: number | undefined;

  async function load() {
    if (loading.value) {
      return;
    }

    loading.value = true;
    try {
      telemetry.value = await readTelemetry();
      error.value = '';
    } catch (cause) {
      error.value = failureMessage(cause, t.value);
    } finally {
      loading.value = false;
    }
  }

  function schedule() {
    window.clearInterval(timer);
    timer = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, preferences.value.refreshSeconds * 1000);
  }

  async function act(process: ProcessEntry, action: ProcessAction) {
    actionError.value = '';
    acting.value = process.id;
    try {
      await actOnProcess(process, action);
    } catch (cause) {
      actionError.value = failureMessage(cause, t.value);
    } finally {
      acting.value = null;
    }
    await load();
  }

  watch(() => preferences.value.refreshSeconds, schedule);
  onMounted(() => {
    void load();
    schedule();
  });
  onUnmounted(() => window.clearInterval(timer));

  return {
    telemetry,
    sensors: computed(() => telemetry.value?.sensors ?? []),
    processes: computed(() => telemetry.value?.processes ?? []),
    error,
    actionError,
    acting,
    load,
    act,
  };
}
