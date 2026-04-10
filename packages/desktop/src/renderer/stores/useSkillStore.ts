import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { loggerServiceRenderer } from "@shared";
import type { SkillItem, SkillDetail } from "@shared";

const logger = loggerServiceRenderer.withContext("useSkillStore");

export type { SkillItem, SkillDetail };

export const useSkillStore = defineStore("skill", () => {
  const skills = ref<SkillItem[]>([]);
  const isInitialized = ref(false);
  const isLoading = ref(false);

  const skillCount = computed(() => skills.value.length);

  async function loadSkills() {
    logger.info("loading skills");
    isLoading.value = true;
    try {
      skills.value = await window.ipc("skill:list");
      logger.info("skills loaded", { count: skills.value.length });
    } finally {
      isLoading.value = false;
    }
  }

  async function initialize() {
    if (isInitialized.value) return;
    await loadSkills();
    isInitialized.value = true;
  }

  async function getDetail(id: string): Promise<SkillDetail | null> {
    return await window.ipc("skill:getDetail", { id });
  }

  async function readFile(id: string, relativePath: string): Promise<{ content: string; filename: string } | null> {
    return await window.ipc("skill:readFile", { id, relativePath });
  }

  async function uninstall(id: string): Promise<void> {
    await window.ipc("skill:uninstall", { id });
    await loadSkills();
  }

  return {
    skills,
    isInitialized,
    isLoading,
    skillCount,
    loadSkills,
    initialize,
    getDetail,
    readFile,
    uninstall,
  };
});
