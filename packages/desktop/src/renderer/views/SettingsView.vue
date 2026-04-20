<template>
  <div class="flex h-full gap-[6px] min-w-0">
    <!-- 第一栏：设置分类导航 -->
    <section class="w-[180px] bg-default rounded-xl overflow-hidden flex flex-col">
      <div class="px-4 py-3 border-b border-default">
        <div class="text-sm font-medium">{{ t("settings.title") }}</div>
      </div>
      <UList
        :model-value="currentCategory"
        :items="settingsCategories"
        value-key="id"
        label-key="name"
        size="lg"
        gap="none"
        padding="md"
        class="flex-1"
        @update:model-value="handleCategoryChange"
      >
        <template #item="{ item }">
          <div class="flex items-center gap-2">
            <UIcon :name="item.icon" class="w-4 h-4 flex-shrink-0" />
            <UText :text="item.name" />
          </div>
        </template>
      </UList>
    </section>

    <!-- 子路由内容 -->
    <RouterView class="flex-1 min-w-0" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

// ===== 设置分类 =====
const settingsCategories = computed(() => [
  { id: "model-service", name: t("settings.category.modelService"), icon: "i-lucide-cpu" },
  { id: "default-model", name: t("settings.category.defaultModel"), icon: "i-lucide-sparkles" },
  { id: "memory", name: t("settings.category.memory"), icon: "i-lucide-brain-cog" },
  { divider: true },
  { id: "scenario", name: t("settings.category.scenario"), icon: "i-lucide-layout-template" },
  { id: "prompt-library", name: t("settings.category.promptLibrary"), icon: "i-lucide-book-marked" },
  { divider: true },
  { id: "web-search", name: t("settings.category.webSearch"), icon: "i-lucide-globe" },
  { id: "mcp-servers", name: t("settings.category.mcpServers"), icon: "i-gravity-ui:logo-mcp" },
  { id: "skills", name: t("settings.category.skills"), icon: "i-lucide-package" },
  { id: "tool-allowlist", name: t("settings.category.toolAllowlist"), icon: "i-lucide-shield-check" },
  { divider: true },
  { id: "storage", name: t("settings.category.storage"), icon: "i-lucide-hard-drive" },
  { id: "session", name: t("settings.category.session"), icon: "i-lucide-message-square" },
  { id: "general", name: t("settings.category.general"), icon: "i-lucide-settings" },
  { divider: true },
  { id: "about", name: t("settings.category.about"), icon: "i-lucide-info" }
]);

// 从路由获取当前分类
const currentCategory = computed(() => {
  const pathParts = route.path.split('/').filter(Boolean);
  // pathParts: ['settings', 'model-service'] 或 ['settings']
  const categoryId = pathParts[1]; // 获取 settings 后面的部分
  return categoryId || 'model-service';
});

const handleCategoryChange = (categoryId: string) => {
  router.push(`/settings/${categoryId}`);
};
</script>
