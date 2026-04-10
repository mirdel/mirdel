/**
 * 知识库 Composable
 * 
 * 提供知识库相关的状态管理和操作方法
 */

import { ref, computed, shallowRef } from 'vue';
import { i18n } from '@/i18n';

// ==================== 类型定义 ====================

export type KbItemType = 'text' | 'file' | 'directory' | 'url';
export type KbItemStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
  createdAt: number;
  updatedAt: number;
}

export interface KbItem {
  id: string;
  kbId: string;
  type: KbItemType;
  name: string;
  source?: string;
  content?: string;
  status: KbItemStatus;
  error?: string;
  fileType?: string;
  fileSize?: number;
  fileMtime?: number;
  maxDepth?: number;
  chunkCount: number;
  lastSyncAt?: number;
  createdAt: number;
  updatedAt: number;
  /** 前端临时状态：文件是否已变更 */
  hasChanged?: boolean;
}

export interface FileInfo {
  path: string;
  name: string;
  fileType: string;
  fileSize: number;
  fileMtime: number;
}

export interface ScanDirectoryResult {
  files: FileInfo[];
  skipped: string[];
}

// ==================== 全局状态 ====================

const knowledgeBases = shallowRef<KnowledgeBase[]>([]);
const currentKbId = ref<string | null>(null);
const currentKbItems = shallowRef<KbItem[]>([]);
const isLoading = ref(false);

// ==================== Composable ====================

export function useKnowledge() {
  const t = i18n.global.t;

  // 当前选中的知识库
  const currentKb = computed(() => {
    if (!currentKbId.value) return null;
    return knowledgeBases.value.find(kb => kb.id === currentKbId.value) || null;
  });

  // 按类型分组的 items
  const itemsByType = computed(() => {
    const result: Record<KbItemType, KbItem[]> = {
      text: [],
      file: [],
      directory: [],
      url: []
    };
    
    for (const item of currentKbItems.value) {
      result[item.type].push(item);
    }
    
    return result;
  });

  // ==================== 知识库操作 ====================

  async function loadKnowledgeBases() {
    isLoading.value = true;
    try {
      const list = await window.ipc('kb:list');
      knowledgeBases.value = list;
    } finally {
      isLoading.value = false;
    }
  }

  async function createKb(input: { name: string; description?: string; embeddingModel?: string; embeddingDimension: number }) {
    const kb = await window.ipc('kb:create', input);
    knowledgeBases.value = [kb, ...knowledgeBases.value];
    return kb;
  }

  async function updateKb(id: string, updates: Partial<Pick<KnowledgeBase, 'name' | 'description'>>) {
    await window.ipc('kb:update', { id, updates });
    knowledgeBases.value = knowledgeBases.value.map(kb =>
      kb.id === id ? { ...kb, ...updates, updatedAt: Date.now() } : kb
    );
  }

  async function migrateKb(id: string, updates: Pick<KnowledgeBase, 'embeddingModel' | 'embeddingDimension'>) {
    await window.ipc('kb:migrate', { id, updates });
    const kb = knowledgeBases.value.find(k => k.id === id);
    if (kb) {
      knowledgeBases.value = knowledgeBases.value.map(k =>
        k.id === id ? { ...k, ...updates, updatedAt: Date.now() } : k
      );
    }
  }

  async function deleteKb(id: string) {
    await window.ipc('kb:delete', { id });
    knowledgeBases.value = knowledgeBases.value.filter(kb => kb.id !== id);
    if (currentKbId.value === id) {
      currentKbId.value = null;
      currentKbItems.value = [];
    }
  }

  async function selectKb(id: string | null) {
    currentKbId.value = id;
    if (id) {
      await loadKbItems(id);
    } else {
      currentKbItems.value = [];
    }
  }

  // ==================== 内容项操作 ====================

  async function loadKbItems(kbId: string) {
    isLoading.value = true;
    try {
      const items = await window.ipc('kb:listItems', { kbId });
      
      // 检查文件变更状态
      const itemsWithChangeStatus = await Promise.all(
        items.map(async (item: KbItem) => {
          if ((item.type === 'file' || item.type === 'directory') && item.source && item.fileMtime) {
            const hasChanged = await window.ipc('kb:checkFileChanged', {
              filePath: item.source,
              recordedMtime: item.fileMtime
            });
            return { ...item, hasChanged };
          }
          return item;
        })
      );
      
      currentKbItems.value = itemsWithChangeStatus;
    } finally {
      isLoading.value = false;
    }
  }

  async function addTextItem(kbId: string, input: { name: string; content: string }) {
    const item = await window.ipc('kb:createItem', {
      kbId,
      type: 'text',
      name: input.name,
      content: input.content
    });
    currentKbItems.value = [item, ...currentKbItems.value];
    return item;
  }

  async function addFileItem(kbId: string, filePath: string) {
    const fileInfo = await window.ipc('kb:getFileInfo', { filePath });
    if (!fileInfo) {
      throw new Error(t('knowledge.common.fileInfoLoadFailed'));
    }
    
    const item = await window.ipc('kb:createItem', {
      kbId,
      type: 'file',
      name: fileInfo.name,
      source: filePath,
      fileType: fileInfo.fileType,
      fileSize: fileInfo.fileSize,
      fileMtime: fileInfo.fileMtime
    });
    currentKbItems.value = [item, ...currentKbItems.value];
    return item;
  }

  async function addDirectoryItem(kbId: string, dirPath: string, maxDepth?: number) {
    // 获取目录名（兼容 Windows 和 Unix 路径）
    const name = dirPath.replace(/^.*[/\\]/, '') || dirPath;
    
    const item = await window.ipc('kb:createItem', {
      kbId,
      type: 'directory',
      name,
      source: dirPath,
      maxDepth: maxDepth || undefined
    });
    currentKbItems.value = [item, ...currentKbItems.value];
    return item;
  }

  async function addUrlItem(kbId: string, url: string, name?: string) {
    const item = await window.ipc('kb:createItem', {
      kbId,
      type: 'url',
      name: name || url,
      source: url
    });
    currentKbItems.value = [item, ...currentKbItems.value];
    return item;
  }

  async function getItem(id: string): Promise<KbItem | undefined> {
    return window.ipc('kb:getItem', { id });
  }

  /** 更新文本内容并重新分块、嵌入（一步到位） */
  async function updateTextItemAndProcess(itemId: string, input: { name: string; content: string }) {
    const result = await window.ipc('kb:updateTextItemAndProcess', {
      itemId,
      name: input.name,
      content: input.content
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    if (result.item) {
      currentKbItems.value = currentKbItems.value.map(item =>
        item.id === itemId ? { ...result.item, hasChanged: item.hasChanged } : item
      );
    }
  }

  async function deleteItem(id: string) {
    await window.ipc('kb:deleteItem', { id });
    currentKbItems.value = currentKbItems.value.filter(item => item.id !== id);
  }

  async function processItem(itemId: string, kbId: string) {
    // 更新本地状态为处理中
    currentKbItems.value = currentKbItems.value.map(item =>
      item.id === itemId ? { ...item, status: 'processing' as const, error: undefined } : item
    );

    try {
      const result = await window.ipc('kb:processItem', { itemId, kbId });
      
      if (!result.ok) {
        throw new Error(result.error);
      }

      // 重新加载该 item 获取最新状态
      const updatedItem = await window.ipc('kb:getItem', { id: itemId });
      if (updatedItem) {
        currentKbItems.value = currentKbItems.value.map(item =>
          item.id === itemId ? { ...updatedItem, hasChanged: false } : item
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      currentKbItems.value = currentKbItems.value.map(item =>
        item.id === itemId ? { ...item, status: 'error' as const, error: message } : item
      );
      throw error;
    }
  }

  // ==================== 文件操作 ====================

  async function selectFile(options?: {
    title?: string;
    multiSelections?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) {
    const result = await window.ipc('dialog:selectFile', {
      title: options?.title || t('knowledge.common.selectFile'),
      multiSelections: options?.multiSelections,
      filters: options?.filters
    });
    
    if (result.canceled) {
      return null;
    }
    
    return result.filePaths;
  }

  async function selectDirectory(title?: string) {
    const result = await window.ipc('dialog:selectDirectory', {
      title: title || t('knowledge.common.selectDirectory')
    });
    
    if (result.canceled) {
      return null;
    }
    
    return result.filePath;
  }

  async function scanDirectory(dirPath: string, maxDepth?: number): Promise<ScanDirectoryResult> {
    return window.ipc('kb:scanDirectory', { dirPath, maxDepth });
  }

  // ==================== 搜索 ====================

  async function search(query: string, kbIds: string[], topK?: number) {
    const result = await window.ipc('kb:search', { query, kbIds, topK });
    if (!result.ok) {
      throw new Error(t('knowledge.common.searchFailed'));
    }
    return result.results;
  }

  return {
    // 状态
    knowledgeBases,
    currentKbId,
    currentKb,
    currentKbItems,
    itemsByType,
    isLoading,

    // 知识库操作
    loadKnowledgeBases,
    createKb,
    updateKb,
    migrateKb,
    deleteKb,
    selectKb,

    // 内容项操作
    loadKbItems,
    getItem,
    addTextItem,
    updateTextItemAndProcess,
    addFileItem,
    addDirectoryItem,
    addUrlItem,
    deleteItem,
    processItem,

    // 文件操作
    selectFile,
    selectDirectory,
    scanDirectory,

    // 搜索
    search
  };
}
