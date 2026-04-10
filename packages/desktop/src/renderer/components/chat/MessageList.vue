<template>
  <UScrollArea 
    ref="scrollContainer"
    class="flex-1 bg-default"
    data-chat-message-scroll
    @scroll.passive="handleScroll"
  >
    <div v-if="!chatStore.currentSessionId" class="text-center text-muted mt-10">
      
    </div>
    <div v-else-if="chatStore.messages.length === 0" class="text-center text-muted mt-10">
      
    </div>
    
    <!-- 消息容器：响应式宽度 -->
    <div v-else class="w-4xl max-w-full mx-auto px-4 md:px-8 pt-5 pb-10">
      <!-- 系统提示词消息：虚拟的，不在 chatStore.messages 中 -->
      <SystemPromptMessage 
        v-if="currentSystemPrompt"
        :content="currentSystemPrompt"
        @edit="handleEditSystemPrompt"
      />
      
      <!-- 消息列表容器：应用自动动画 -->
      <div ref="messagesContainer">
        <template v-for="group in turnGroups" :key="group.id">
          <div
            :data-message-group-id="group.id"
            :data-message-role="group.primaryMessage.role"
          >
            <TurnGroup :group="group" />
          </div>
          
          <!-- 分支分割线：在包含分叉点的消息组后显示 -->
          <BranchDivider 
            v-if="groupContainsForkPoint(group)"
          />
        </template>
      </div>
    </div>
  </UScrollArea>
</template>

<script setup lang="ts">
import { watch, useTemplateRef, onMounted, onUnmounted, nextTick, computed } from "vue";
import { useAutoAnimate } from '@formkit/auto-animate/vue';
import { useChatStore } from "@/stores/useChatStore";
import TurnGroup from "./TurnGroup.vue";
import BranchDivider from "./BranchDivider.vue";
import SystemPromptMessage from "./SystemPromptMessage.vue";
import emitter from "@/utils/emitter";
import { groupMessages, type MessageGroup as TurnGroupData } from "@/utils/messageGrouper";

const chatStore = useChatStore();
const scrollContainer = useTemplateRef('scrollContainer');

// 🆕 将消息列表分组
const turnGroups = computed(() => {
  const turnMap = new Map(chatStore.currentTurns.map((turn) => [turn.id, turn]))
  return groupMessages(chatStore.messages, { turns: turnMap });
});

// 消息列表滚动时通知子项（用于隐藏引用浮层等）
function handleScroll() {
  emitter.emit('chat:message-list-scroll');
}

// 启用自动动画，并获取控制函数
const [messagesContainer, enableAnimate] = useAutoAnimate({
  duration: 400, // 动画持续时间（毫秒），默认 250
  easing: 'ease-in-out' // 缓动函数
});

// 获取当前场景的系统提示词
const currentSystemPrompt = computed(() => {
  const scenario = chatStore.selectedScenario;
  return scenario?.systemPrompt?.trim() || null;
});

// 编辑系统提示词
function handleEditSystemPrompt() {
  // 触发打开场景详情Modal，并切换到提示词tab
  emitter.emit('scenario:edit-prompt');
}

// 判断消息组是否包含分叉点消息
function groupContainsForkPoint(group: TurnGroupData): boolean {
  const currentSession = chatStore.currentSession
  
  // 不是分支会话，不显示分割线
  if (!currentSession?.rootSessionId) return false
  
  // 检查分叉点消息是否在这个组内
  const forkPointId = currentSession.forkPointMessageId
  return forkPointId ? group.messages.some(m => m.id === forkPointId) : false
}

// 判断是否滚动到底部（允许一定误差，比如 50px）
function isScrolledToBottom(): boolean {
  const el = scrollContainer.value?.$el;
  if (!el) return true;
  const { scrollTop, scrollHeight, clientHeight } = el;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  return distanceFromBottom < 50;
}

// 滚动到底部
function scrollToBottom() {
  // 等待 Vue 完成 DOM 更新和动画完成后再滚动（动画时间 400ms）
  setTimeout(() => {
    const el = scrollContainer.value?.$el;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, 450);
}

function getSearchRootElement(): HTMLElement | null {
  return (messagesContainer.value as HTMLElement | null) ?? null;
}

function findMessageElement(messageId: string): HTMLElement | null {
  return document.querySelector(`[data-message-id="${messageId}"]`)
}

function scrollElementIntoView(messageElement: HTMLElement) {
  messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function tryResolvePendingScrollTarget(): boolean {
  const target = chatStore.pendingScrollTarget
  const sessionId = chatStore.currentSessionId
  if (!target || !sessionId || target.sessionId !== sessionId) {
    return false
  }

  const element = findMessageElement(target.messageId)
  if (!element) {
    return false
  }

  scrollElementIntoView(element)
  chatStore.clearPendingScrollTarget()
  return true
}

// 滚动到指定消息
function scrollToMessage(messageId: string) {
  const currentSessionId = chatStore.currentSessionId
  if (currentSessionId) {
    chatStore.setPendingScrollTarget({ sessionId: currentSessionId, messageId })
  }

  void nextTick(() => {
    tryResolvePendingScrollTarget()
  })
}

// 智能滚动状态
let smartScrollTimeoutId: ReturnType<typeof setTimeout> | null = null;
let scrollTopWhenScheduled = 0;

// 智能滚动：只有在底部时才自动滚动
function scrollToBottomIfNeeded() {
  // 先检查当前是否在底部
  if (!isScrolledToBottom()) {
    return;
  }
  
  const el = scrollContainer.value?.$el;
  if (!el) return;
  
  // 记录当前的 scrollTop
  scrollTopWhenScheduled = el.scrollTop;
  
  // 取消之前的定时器（避免堆积）
  if (smartScrollTimeoutId) {
    clearTimeout(smartScrollTimeoutId);
  }
  
  // 创建新的定时器
  smartScrollTimeoutId = setTimeout(() => {
    smartScrollTimeoutId = null;
    const el = scrollContainer.value?.$el;
    if (!el) return;
    
    // 检查 scrollTop 是否减小了（用户往上滚动）
    // 允许 10px 的容差
    if (el.scrollTop < scrollTopWhenScheduled - 10) {
      // 用户往上滚动了，不执行滚动
      return;
    }
    
    // 执行滚动到底部
    el.scrollTop = el.scrollHeight;
  }, 450);
}

// 监听会话切换，禁用动画避免切换时的动画效果
watch(
  () => chatStore.currentSessionId,
  () => {
    // 会话切换时立即禁用动画
    enableAnimate(false);
    
    // 等待 DOM 更新完成后重新启用
    nextTick(() => {
      setTimeout(() => {
        enableAnimate(true);
      }, 100);
    });
  }
);

watch(
  () => ({
    sessionId: chatStore.currentSessionId,
    messageIds: turnGroups.value.map((group) => group.id).join('|')
  }),
  () => {
    void nextTick(() => {
      tryResolvePendingScrollTarget()
    })
  },
  { flush: 'post' }
)

// 监听全局事件
onMounted(() => {
  // 首次加载时禁用动画，避免初始渲染时的动画效果
  enableAnimate(false);
  
  // 短暂延迟后启用动画，准备接收后续的新消息
  setTimeout(() => {
    enableAnimate(true);
  }, 500);
  
  emitter.on('chat:scroll-to-bottom', scrollToBottom);
  emitter.on('chat:scroll-to-bottom-if-needed', scrollToBottomIfNeeded);
  emitter.on('chat:scroll-to-message', scrollToMessage);

  void nextTick(() => {
    tryResolvePendingScrollTarget()
  })
});

onUnmounted(() => {
  emitter.off('chat:scroll-to-bottom', scrollToBottom);
  emitter.off('chat:scroll-to-bottom-if-needed', scrollToBottomIfNeeded);
  emitter.off('chat:scroll-to-message', scrollToMessage);
  
  // 清理智能滚动定时器
  if (smartScrollTimeoutId) {
    clearTimeout(smartScrollTimeoutId);
    smartScrollTimeoutId = null;
  }
});

// 暴露方法给父组件（保持向后兼容，但推荐使用 emitter）
defineExpose({
  scrollToBottom,
  scrollToBottomIfNeeded,
  getSearchRootElement
});
</script>
