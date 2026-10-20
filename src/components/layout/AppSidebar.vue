<script setup lang="ts">

import { useI18n } from '@/i18n';
import type { Section } from '@/types';
import { NasIcon } from '@valeriogc/nas-base-app';

import monitor from '@/assets/icons/monitor.svg?url';
import optionsIcon from '@/assets/icons/options.svg?url';
import processes from '@/assets/icons/processes.svg?url';

const SECTIONS: Section[] = ['monitor', 'processes'];
const ICONS: Record<Section, string> = { monitor, processes };

const section = defineModel<Section>({ required: true });

const emit = defineEmits<{ options: [] }>();

const { t } = useI18n();

</script>

<template>
  <aside data-testid="app_sidebar" class="sidebar" :aria-label="t.sectionsLabel">
    <nav>
      <button
        v-for="item in SECTIONS"
        :key="item"
        type="button"
        :class="['nav_item', { active: section === item }]"
        :aria-current="section === item ? 'page' : undefined"
        :data-testid="`section_${item}`"
        @click="section = item"
      >
        <NasIcon class="nav_symbol" :svg="ICONS[item]" />
        {{ t.sections[item] }}
      </button>
    </nav>

    <div class="sidebar_footer">
      <button type="button" class="nav_item" data-testid="options_open" @click="emit('options')">
        <NasIcon class="nav_symbol" :svg="optionsIcon" />
        {{ t.options }}
      </button>
    </div>
  </aside>
</template>

<style scoped lang="scss">

.sidebar {
  position: sticky;
  top: 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 28px 16px;
  background: $nas_sidebar_background;
  color: $nas_sidebar_foreground;
}

nav {
  display: grid;
  gap: 4px;
}

.nav_item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: $nas_sidebar_muted;
  text-align: left;

  &:hover,
  &.active {
    background: var(--nas-hover);
    color: $nas_sidebar_foreground;
  }

  &.active {
    box-shadow: inset 3px 0 var(--accent);
  }
}

.nav_symbol {
  --app-icon-size: 20px;
}

.sidebar_footer {
  display: grid;
  gap: 12px;
  margin-top: auto;
  color: $nas_sidebar_muted;
  font-size: 12px;
  line-height: 1.5;

  .nav_item {
    font-size: 14px;
  }
}

@media (max-width: $nas_mobile_breakpoint) {
  .sidebar {
    padding: 12px 16px;
  }

  .sidebar_footer {
    display: none;
  }

  nav {
    display: flex;
    overflow-x: auto;
  }

  .nav_item {
    white-space: nowrap;
  }
}

</style>
