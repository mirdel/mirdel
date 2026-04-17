import mitt from 'mitt';

type Events = {
  // 打开全局搜索（可带默认筛选预设）
  'global-search:open': {
    scope?: 'all' | 'messages' | 'sessions' | 'translations' | 'notes' | 'knowledge';
    onlyCurrentSession?: boolean;
    messageTimeRange?: 'all' | 'today' | '3d' | '7d' | '30d';
  };
  // 聚焦聊天输入框
  'chat:focus-input': void;
  // 滚动消息列表到底部
  'chat:scroll-to-bottom': void;
  // 滚动消息列表到顶部
  'chat:scroll-to-top': void;
  // 智能滚动到底部（仅当已在底部时）
  'chat:scroll-to-bottom-if-needed': void;
  // 滚动到指定消息
  'chat:scroll-to-message': string; // messageId
  // 展开会话列表中的某个主会话（显示其子分支）
  'session:expand-main': string; // mainSessionId
  // 填充输入框文本（用于快捷追问）
  'chat:fill-input': string; // prompt text
  // 替换输入框草稿文本（用于编辑用户消息后重新发送）
  'chat:set-input-draft': string; // draft text
  // 编辑系统提示词
  'scenario:edit-prompt': void;
  /** 打开场景详情/编辑 Modal（如新建会话页卡片上的编辑） */
  'scenario:open-detail': string; // scenarioId
  /** 打开新建场景弹窗（与顶栏新建场景相同流程） */
  'scenario:open-create-modal': void;
  // 触发编辑消息
  'message:start-edit': string; // messageId
  // 消息列表滚动事件（用于隐藏引用浮层等）
  'chat:message-list-scroll': void;
  // 追加内容到会话笔记
  'session:append-to-note': string; // markdown content
  // 导航到指定消息组（by group index in virtualItems）
  'chat:navigate-to-group': { groupIndex: number; headingIndex?: number; smooth?: boolean };
};

const emitter = mitt<Events>();

export default emitter;
