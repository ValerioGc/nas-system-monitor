<script setup lang="ts">

import { useNasLauncherContext } from '@/composables/useNasLauncherContext';
import MonitorWidget from '@/components/widget/MonitorWidget.vue';

useNasLauncherContext();

</script>

<template>
  <div class="app_surface">
    <MonitorWidget />
  </div>
</template>
