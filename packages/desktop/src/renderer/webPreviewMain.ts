import { createApp } from "vue";
import "./iconify-local";
import ui from "@nuxt/ui/vue-plugin";
import { MotionPlugin } from "@vueuse/motion";
import "@/assets/main.css";
import { applyRendererLocalePreference, i18n } from "@/i18n";
import WebPreviewApp from "./WebPreviewApp.vue";

async function bootstrap() {
  await applyRendererLocalePreference();

  createApp(WebPreviewApp)
    .use(i18n)
    .use(ui)
    .use(MotionPlugin)
    .mount("#app");
}

void bootstrap();
