import "@/patchWindowOpen";
import "./iconify-local";
import { createApp } from "vue";
import { createMemoryHistory, createRouter, type RouteLocationRaw } from "vue-router";
import ui from "@nuxt/ui/vue-plugin";
import "@/assets/main.css";
import { applyRendererLocalePreference, i18n } from "@/i18n";
import AppletRunnerApp from "./AppletRunnerApp.vue";

function normalizeRouteLocation(to: RouteLocationRaw): RouteLocationRaw {
  if (typeof to === "string") {
    return to.trim() === "" ? "/" : to;
  }
  if (to && typeof to === "object" && "path" in to) {
    const pathValue = (to as { path?: unknown }).path;
    if (typeof pathValue === "string" && pathValue.trim() === "") {
      return { ...(to as Record<string, unknown>), path: "/" } as RouteLocationRaw;
    }
  }
  return to;
}

async function bootstrap() {
  await applyRendererLocalePreference();

  const RouterStubView = { render: () => null };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: RouterStubView }],
  });

  const rawResolve = router.resolve.bind(router);
  const rawPush = router.push.bind(router);
  const rawReplace = router.replace.bind(router);
  (router as any).resolve = (to: RouteLocationRaw, current?: unknown) => rawResolve(normalizeRouteLocation(to), current as any);
  (router as any).push = (to: RouteLocationRaw) => rawPush(normalizeRouteLocation(to));
  (router as any).replace = (to: RouteLocationRaw) => rawReplace(normalizeRouteLocation(to));

  await router.push("/");
  await router.isReady();

  createApp(AppletRunnerApp)
    .use(i18n)
    .use(router)
    .use(ui)
    .mount("#app");
}

void bootstrap();
