import { createApp } from "vue";
import "./iconify-local";
import ui from "@nuxt/ui/vue-plugin";
import { MotionPlugin } from "@vueuse/motion";
import "@/assets/main.css";
import { applyRendererLocalePreference, i18n } from "@/i18n";
import ImagePreviewApp from "./ImagePreviewApp.vue";

async function bootstrap() {
  await applyRendererLocalePreference();

  createApp(ImagePreviewApp)
    .use(i18n)
    .use(ui)
    .use(MotionPlugin)
    .mount("#app");
}

void bootstrap();
