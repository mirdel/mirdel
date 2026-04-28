import "@/patchWindowOpen";
import "./iconify-local";
import { createApp } from "vue";
import { createPinia } from "pinia";
import { loggerServiceRenderer } from "@shared";
import App from "@/App.vue";
import { applyRendererLocalePreference, i18n } from "@/i18n";
import { router } from "@/router";
import { initPersistentState } from "@/utils/persistentState";
import ui from "@nuxt/ui/vue-plugin";
import { MotionPlugin } from '@vueuse/motion';
import "@/assets/main.css";

// renderer 侧日志通过 preload 代理到 main（不直接依赖 electron-log）
loggerServiceRenderer.initWindowSource("main");

const pinia = createPinia();

async function bootstrap() {
  await initPersistentState();
  await applyRendererLocalePreference();

  createApp(App)
    .use(router)
    .use(pinia)
    .use(i18n)
    .use(ui)
    .use(MotionPlugin)
    .mount("#app");
}

void bootstrap();
