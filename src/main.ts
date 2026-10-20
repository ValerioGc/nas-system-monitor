import { guardFrame } from '@valeriogc/nas-base-app';
import { createApp } from 'vue';
import App from '@/App.vue';
import WidgetApp from '@/WidgetApp.vue';
import { loadPreferences } from '@/composables/usePreferences';
import '@/styles/main.scss';

guardFrame();

const widget = new URLSearchParams(window.location.search).get('view') === 'widget';
if (widget) {
  document.documentElement.classList.add('widget_view');
}

void loadPreferences();

createApp(widget ? WidgetApp : App).mount('#app');
