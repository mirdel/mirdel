import { createRouter, createWebHashHistory } from "vue-router";
import MainLayout from "@/layouts/MainLayout.vue";
import ChatView from "@/views/ChatView.vue";
import ImageWorkspaceView from "@/views/ImageWorkspaceView.vue";
import VideoWorkspaceView from "@/views/VideoWorkspaceView.vue";
import NotesView from "@/views/NotesView.vue";
import SettingsView from "@/views/SettingsView.vue";
import KnowledgeView from "@/views/KnowledgeView.vue";
import AppletView from "@/views/AppletView.vue";
import TranslateView from "@/views/TranslateView.vue";
import ModelServiceSettings from "@/components/settings/ModelServiceSettings.vue";
import DefaultModelSettings from "@/components/settings/DefaultModelSettings.vue";
import ScenarioSettings from "@/components/settings/ScenarioSettings.vue";
import McpServerSettings from "@/components/settings/McpServerSettings.vue";
import SkillSettings from "@/components/settings/SkillSettings.vue";
import WebSearchSettings from "@/components/settings/WebSearchSettings.vue";
import MemorySettings from "@/components/settings/MemorySettings.vue";
import GeneralSettings from "@/components/settings/GeneralSettings.vue";
import ToolAllowlistSettings from "@/components/settings/ToolAllowlistSettings.vue";
import SessionSettings from "@/components/settings/SessionSettings.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      component: MainLayout,
      children: [
        { path: "", redirect: "/chat" },
        { path: "chat", name: "chat-new", component: ChatView },  // 新会话
        { path: "chat/temp", name: "chat-temp", component: ChatView },  // 临时会话
        { path: "chat/:sessionId", name: "chat", component: ChatView },  // 普通会话
        { path: "images/:workspaceId?", name: "images", component: ImageWorkspaceView },  // 图片工作区
        { path: "videos/:workspaceId?", name: "videos", component: VideoWorkspaceView },  // 视频工作区
        { path: "notes", name: "notes", component: NotesView },  // 笔记
        { path: "notes/:noteId", name: "notes-detail", component: NotesView },  // 笔记详情
        { path: "knowledge", name: "knowledge", component: KnowledgeView },  // 知识库
        { path: "knowledge/:kbId", name: "knowledge-detail", component: KnowledgeView },  // 知识库详情
        { path: "applet", name: "applet", component: AppletView },  // 轻应用工作台
        { path: "translate", name: "translate", component: TranslateView },  // 翻译
        {
          path: "settings",
          component: SettingsView,
          children: [
            { path: "", redirect: { name: "settings-model-service" } },
            { 
              path: "model-service", 
              name: "settings-model-service",
              component: ModelServiceSettings,
            },
            { 
              path: "default-model",
              name: "settings-default-model", 
              component: DefaultModelSettings 
            },
            { 
              path: "scenario",
              name: "settings-scenario",
              component: ScenarioSettings 
            },
            { 
              path: "mcp-servers",
              name: "settings-mcp-servers",
              component: McpServerSettings 
            },
            {
              path: "skills",
              name: "settings-skills",
              component: SkillSettings
            },
            {
              path: "tool-allowlist",
              name: "settings-tool-allowlist",
              component: ToolAllowlistSettings
            },
            {
              path: "web-search",
              name: "settings-web-search",
              component: WebSearchSettings
            },
            {
              path: "memory",
              name: "settings-memory",
              component: MemorySettings
            },
            {
              path: "session",
              name: "settings-session",
              component: SessionSettings
            },
            {
              path: "general",
              name: "settings-general",
              component: GeneralSettings
            },
          ]
        }
      ]
    }
  ]
});

router.beforeEach(async (to) => {
  if (to.name !== "chat") return true;

  const sessionId = to.params.sessionId;
  if (typeof sessionId !== "string" || !sessionId) {
    return { name: "chat-new", replace: true };
  }

  try {
    const session = await window.ipc("sessions:get", { id: sessionId });
    if (!session) {
      return { name: "chat-new", replace: true };
    }
  } catch {
    return { name: "chat-new", replace: true };
  }

  return true;
});
