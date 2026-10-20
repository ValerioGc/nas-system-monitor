<script setup lang="ts">

import { ref } from 'vue';
import { useNasLauncherContext } from '@/composables/useNasLauncherContext';
import { useTelemetry } from '@/composables/useTelemetry';
import type { Section } from '@/types';

import AppSidebar from '@/components/layout/AppSidebar.vue';
import OptionsModal from '@/components/modals/OptionsModal.vue';
import MonitorPage from '@/components/sections/MonitorPage.vue';
import ProcessesPage from '@/components/sections/ProcessesPage.vue';

const { t } = useNasLauncherContext();

const section = ref<Section>('monitor');
const optionsOpen = ref(false);
const { telemetry, sensors, processes, error, actionError, acting, load, act } = useTelemetry();

</script>

<template>
  <div class="app_shell app_surface">
    <AppSidebar v-model="section" @options="optionsOpen = true" />

    <main
      class="content"
      :class="{ content_processes: section === 'processes' }"
      data-testid="app_content"
    >
      <p v-if="error" class="alert" role="alert" data-testid="telemetry_error">
        {{ error }}
        <button type="button" class="action_button" @click="load">{{ t.retry }}</button>
      </p>
      <MonitorPage
        v-if="section === 'monitor'"
        :sensors="sensors"
        :metrics="telemetry?.metrics ?? null"
      />
      <ProcessesPage
        v-else
        :processes="processes"
        :ram-total="telemetry?.metrics.ramTotal ?? null"
        :acting="acting"
        :action-error="actionError"
        @act="act"
      />
    </main>

    <OptionsModal v-if="optionsOpen" v-model="optionsOpen" :sensors="sensors" />
  </div>
</template>

<style scoped lang="scss">

.app_shell {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
}

.content {
  min-height: 0;
  overflow: auto;
  width: 100%;
  max-width: 1500px;
  padding: 42px clamp(20px, 4vw, 64px);
  background: var(--nas-app-content, var(--app-bg));

  &.content_processes {
    @extend %fx_column;
    overflow: hidden;
  }
}

.alert {
  flex-shrink: 0;
  margin-bottom: 16px;
}

@media (max-width: $nas_mobile_breakpoint) {
  .app_shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .content {
    min-height: 0;
    overflow: auto;
    padding: 26px 16px;
  }
}

</style>
