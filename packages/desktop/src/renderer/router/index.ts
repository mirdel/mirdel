import { createRouter, createWebHashHistory } from "vue-router";

const MainLayout = () => import("@/layouts/MainLayout.vue");
const ChatView = () => import("@/views/ChatView.vue");
const ImageWorkspaceView = () => import("@/views/ImageWorkspaceView.vue");
const VideoWorkspaceView = () => import("@/views/VideoWorkspaceView.vue");
const NotesView = () => import("@/views/NotesView.vue");
const SettingsView = () => import("@/views/SettingsView.vue");
const KnowledgeView = () => import("@/views/KnowledgeView.vue");
const AppletView = () => import("@/views/AppletView.vue");
const AppWorkspaceView = () => import("@/views/AppWorkspaceView.vue");
const TranslateView = () => import("@/views/TranslateView.vue");
const AiSearchView = () => import("@/views/AiSearchView.vue");
const ModelServiceSettings = () => import("@/components/settings/ModelServiceSettings.vue");
const DefaultModelSettings = () => import("@/components/settings/DefaultModelSettings.vue");
const ScenarioSettings = () => import("@/components/settings/ScenarioSettings.vue");
const PromptLibrarySettings = () => import("@/components/settings/PromptLibrarySettings.vue");
const McpServerSettings = () => import("@/components/settings/McpServerSettings.vue");
const SkillSettings = () => import("@/components/settings/SkillSettings.vue");
const WebSearchSettings = () => import("@/components/settings/WebSearchSettings.vue");
const MemorySettings = () => import("@/components/settings/MemorySettings.vue");
const GeneralSettings = () => import("@/components/settings/GeneralSettings.vue");
const ToolAllowlistSettings = () => import("@/components/settings/ToolAllowlistSettings.vue");
const SessionSettings = () => import("@/components/settings/SessionSettings.vue");
const StorageSettings = () => import("@/components/settings/StorageSettings.vue");
const AboutSettings = () => import("@/components/settings/AboutSettings.vue");

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
        { path: "apps/:id", name: "app-workspace", component: AppWorkspaceView, props: true },  // 应用工作区
        { path: "translate", name: "translate", component: TranslateView },  // 翻译
        { path: "ai-search", name: "ai-search", component: AiSearchView },  // 智搜
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
              path: "prompt-library",
              name: "settings-prompt-library",
              component: PromptLibrarySettings
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
              path: "storage",
              name: "settings-storage",
              component: StorageSettings
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
            {
              path: "about",
              name: "settings-about",
              component: AboutSettings
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
