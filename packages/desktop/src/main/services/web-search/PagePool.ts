/**
 * WebContentsView 页面池
 * 使用一个隐藏的 BrowserWindow 作为宿主，挂载多个 WebContentsView 实现并发
 */

import { BrowserWindow, WebContentsView } from 'electron';
import { loggerServiceMain } from '@shared';
import { getRandomUserAgent } from './utils';
import {
  getDefaultResponseLocale,
  getLocaleAcceptLanguage,
  getLocaleNavigatorLanguages,
} from '../language/responseLocale';

const logger = loggerServiceMain.withContext('PagePool');
const PAGE_READY_MAX_WAIT_MS = 2500;
const PAGE_READY_POLL_INTERVAL_MS = 200;
const PAGE_READY_MUTATION_QUIET_MS = 500;
const PAGE_READY_STABLE_ROUNDS = 2;

/**
 * Stealth 脚本 - 隐藏自动化特征
 */
function buildStealthScript(): string {
  const languages = JSON.stringify(getLocaleNavigatorLanguages(getDefaultResponseLocale()));
  return `
  (() => {
    if (window.__stealthApplied) return;
    window.__stealthApplied = true;
    
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
    
    if (!window.chrome) window.chrome = {};
    window.chrome.runtime = window.chrome.runtime || {};
    window.chrome.loadTimes = window.chrome.loadTimes || function() { return {}; };
    window.chrome.csi = window.chrome.csi || function() { return {}; };
    window.chrome.app = window.chrome.app || {};
    
    Object.defineProperty(navigator, 'languages', {
      get: () => ${languages},
      configurable: true
    });
    
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        plugins.length = 3;
        return plugins;
      },
      configurable: true
    });
    
    if (navigator.permissions) {
      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = function(parameters) {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery.call(this, parameters);
      };
    }
    
    if (!navigator.connection) {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false
        }),
        configurable: true
      });
    }
    
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true
    });
    
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: true
    });
  })();
`;
}

interface PooledPage {
  view: WebContentsView;
  busy: boolean;
}

interface AcquireWaiter {
  resolve: (page: WebContentsView) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout | null;
  abortSignal?: AbortSignal;
  onAbort?: () => void;
}

export class PagePool {
  private hostWindow: BrowserWindow | null = null;
  private pages: PooledPage[] = [];
  private poolSize: number;
  private readonly timeout: number;
  private waitQueue: AcquireWaiter[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private sessionHeadersHooked = false;

  constructor(poolSize: number = 5, timeout: number = 10000) {
    this.poolSize = Math.max(1, Math.min(10, poolSize));
    this.timeout = timeout;
    logger.info('PagePool created', { poolSize: this.poolSize, timeout });
  }

  /**
   * 初始化页面池
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    logger.info('Initializing PagePool', { poolSize: this.poolSize });

    // 创建隐藏的宿主窗口
    this.hostWindow = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    // 创建页面池
    for (let i = 0; i < this.poolSize; i++) {
      const view = this.createPage(i);
      this.pages.push({ view, busy: false });
    }

    this.initialized = true;
    logger.info('PagePool initialized', { pageCount: this.pages.length });
  }

  /**
   * 创建单个页面
   */
  private createPage(index: number): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:web-search',
        webgl: true,
        spellcheck: false,
      }
    });

    // 设置 User-Agent
    const userAgent = getRandomUserAgent();
    view.webContents.setUserAgent(userAgent);

    if (!this.sessionHeadersHooked) {
      this.sessionHeadersHooked = true;
      view.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['*://*/*'] },
        (details, callback) => {
          const acceptLanguage = getLocaleAcceptLanguage(getDefaultResponseLocale());
          const headers = {
            ...details.requestHeaders,
            'Accept-Language': acceptLanguage,
            'DNT': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
          };
          callback({ requestHeaders: headers });
        }
      );
    }

    // 注入 stealth 脚本
    view.webContents.on('did-start-loading', () => {
      view.webContents.executeJavaScript(buildStealthScript()).catch(() => {});
    });

    view.webContents.on('dom-ready', () => {
      view.webContents.executeJavaScript(buildStealthScript()).catch(() => {});
    });

    // 添加到宿主窗口
    if (this.hostWindow) {
      this.hostWindow.contentView.addChildView(view);
      // 设置位置（虽然不可见，但需要设置大小才能正常渲染）
      view.setBounds({ x: 0, y: 0, width: 1366, height: 768 });
    }

    logger.info('Page created', { index, userAgent: userAgent.substring(0, 50) });
    return view;
  }

  /**
   * 获取一个空闲页面
   */
  async acquire(options: { timeout?: number; abortSignal?: AbortSignal } = {}): Promise<WebContentsView> {
    await this.initialize();

    if (options.abortSignal?.aborted) {
      throw new Error('Page acquire aborted');
    }
    if (options.timeout !== undefined && options.timeout <= 0) {
      throw new Error('Page acquire timeout');
    }

    // 查找空闲页面
    const freePage = this.pages.find(p => !p.busy);
    if (freePage) {
      freePage.busy = true;
      return freePage.view;
    }

    // 没有空闲页面，等待
    return new Promise((resolve, reject) => {
      let waiter: AcquireWaiter;
      let settled = false;

      const cleanup = () => {
        if (waiter.timeoutId) {
          clearTimeout(waiter.timeoutId);
          waiter.timeoutId = null;
        }
        if (waiter.abortSignal && waiter.onAbort) {
          waiter.abortSignal.removeEventListener('abort', waiter.onAbort);
        }
        const index = this.waitQueue.indexOf(waiter);
        if (index >= 0) {
          this.waitQueue.splice(index, 1);
        }
      };

      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      waiter = {
        resolve: (page) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(page);
        },
        reject: settleReject,
        timeoutId: null,
        abortSignal: options.abortSignal,
      };

      waiter.onAbort = () => settleReject(new Error('Page acquire aborted'));
      waiter.abortSignal?.addEventListener('abort', waiter.onAbort, { once: true });
      if (options.timeout !== undefined) {
        waiter.timeoutId = setTimeout(() => settleReject(new Error('Page acquire timeout')), options.timeout);
      }

      this.waitQueue.push(waiter);
    });
  }

  /**
   * 归还页面
   */
  release(view: WebContentsView): void {
    const page = this.pages.find(p => p.view === view);
    if (page) {
      page.busy = false;

      // 如果有等待的请求，分配给它
      const waiting = this.waitQueue.shift();
      if (waiting) {
        page.busy = true;
        waiting.resolve(page.view);
      }
    }
  }

  /**
   * 加载页面并等待完成
   */
  async loadPage(view: WebContentsView, url: string, timeout?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const effectiveTimeout = Math.max(1, timeout ?? this.timeout);
      const timer = setTimeout(() => {
        try {
          view.webContents.stop();
        } catch {
          // ignore stop failure
        }
        cleanup();
        reject(new Error('Page load timeout'));
      }, effectiveTimeout);

      const cleanup = () => {
        clearTimeout(timer);
        view.webContents.removeListener('did-finish-load', onLoad);
        view.webContents.removeListener('did-fail-load', onFail);
      };

      const onLoad = () => {
        void this.waitForPageReady(view).then(() => {
          cleanup();
          resolve();
        }).catch((error) => {
          cleanup();
          reject(error);
        });
      };

      const onFail = (_e: any, code: number, desc: string) => {
        if (code === -3) return; // ERR_ABORTED
        cleanup();
        reject(new Error(`Load failed: ${code} - ${desc}`));
      };

      view.webContents.once('did-finish-load', onLoad);
      view.webContents.once('did-fail-load', onFail);

      view.webContents.loadURL(url).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  /**
   * 获取页面 HTML
   */
  async getPageHtml(view: WebContentsView): Promise<string> {
    return view.webContents.executeJavaScript(`(() => {
      const root = document.documentElement;
      if (!root) return '';

      const selectorsToRemove = [
        'script',
        'style',
        'nav',
        'footer',
        'aside',
        'dialog',
        'noscript',
        'iframe[src*="consent"]',
        'iframe[src*="cookie"]',
        '[role="dialog"]',
        '[aria-modal="true"]',
        '[data-nosnippet="true"]',
        '.cookie-banner',
        '.cookie-consent',
        '.consent-banner',
        '.newsletter-popup',
        '.modal-backdrop'
      ];

      for (const selector of selectorsToRemove) {
        document.querySelectorAll(selector).forEach((node) => node.remove());
      }

      const attributeKeywords = ['cookie', 'consent', 'gdpr', 'privacy', 'overlay', 'modal', 'popup', 'subscribe'];
      const textKeywords = ['accept', 'agree', 'consent', 'cookie', 'privacy'];
      const allElements = Array.from(document.querySelectorAll('*'));

      for (const element of allElements) {
        const htmlElement = element;
        const attrs = [
          htmlElement.id || '',
          htmlElement.className || '',
          htmlElement.getAttribute('role') || '',
          htmlElement.getAttribute('aria-label') || '',
          htmlElement.getAttribute('data-testid') || '',
          htmlElement.getAttribute('data-test') || ''
        ].join(' ').toLowerCase();

        const text = (htmlElement.textContent || '').trim().toLowerCase();
        const style = window.getComputedStyle(htmlElement);
        const rect = htmlElement.getBoundingClientRect();

        const hasAttributeKeyword = attributeKeywords.some((keyword) => attrs.includes(keyword));
        const hasConsentText = text.length > 0 && text.length < 500 && textKeywords.some((keyword) => text.includes(keyword));
        const isOverlayLike =
          (style.position === 'fixed' || style.position === 'sticky') &&
          rect.width >= window.innerWidth * 0.3 &&
          rect.height >= 48;

        if ((hasAttributeKeyword && isOverlayLike) || (hasAttributeKeyword && hasConsentText) || (isOverlayLike && hasConsentText)) {
          htmlElement.remove();
        }
      }

      return root.outerHTML;
    })()`) as Promise<string>;
  }

  private async waitForPageReady(view: WebContentsView): Promise<void> {
    const result = await view.webContents.executeJavaScript(`(() => new Promise((resolve) => {
      const maxWait = ${PAGE_READY_MAX_WAIT_MS};
      const pollInterval = ${PAGE_READY_POLL_INTERVAL_MS};
      const mutationQuietMs = ${PAGE_READY_MUTATION_QUIET_MS};
      const stableRoundsTarget = ${PAGE_READY_STABLE_ROUNDS};
      const start = Date.now();

      const getContentLength = () => {
        const candidates = Array.from(document.querySelectorAll('article, main, [role="main"], .content, #content'));
        const text = candidates
          .map((node) => (node.textContent || '').trim())
          .filter(Boolean)
          .sort((left, right) => right.length - left.length)[0]
          || (document.body?.innerText || '');
        return text.replace(/\\s+/g, ' ').trim().length;
      };

      let lastContentLength = getContentLength();
      let stableRounds = 0;
      let lastMutationAt = Date.now();
      let lastResourceCount = performance.getEntriesByType('resource').length;
      let stableResourceRounds = 0;

      const observer = new MutationObserver(() => {
        lastMutationAt = Date.now();
      });

      if (document.documentElement) {
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
      }

      const finish = (reason) => {
        observer.disconnect();
        resolve({
          reason,
          elapsed: Date.now() - start,
          contentLength: lastContentLength,
          readyState: document.readyState,
        });
      };

      const tick = async () => {
        if (document.fonts?.status === 'loading') {
          try {
            await Promise.race([
              document.fonts.ready,
              new Promise((r) => setTimeout(r, pollInterval)),
            ]);
          } catch {
            // ignore font readiness errors
          }
        }

        const currentLength = getContentLength();
        const resourceCount = performance.getEntriesByType('resource').length;
        const isReadyStateSettled = document.readyState === 'complete' || document.readyState === 'interactive';
        const isContentStable = Math.abs(currentLength - lastContentLength) <= 20;

        stableRounds = isContentStable ? stableRounds + 1 : 0;
        stableResourceRounds = resourceCount === lastResourceCount ? stableResourceRounds + 1 : 0;
        lastContentLength = currentLength;
        lastResourceCount = resourceCount;

        const quietFor = Date.now() - lastMutationAt;
        const isDomQuiet = quietFor >= mutationQuietMs;
        const isResourceQuiet = stableResourceRounds >= stableRoundsTarget;

        if (isReadyStateSettled && isDomQuiet && isResourceQuiet && stableRounds >= stableRoundsTarget) {
          finish('signals_ready');
          return;
        }

        if (Date.now() - start >= maxWait) {
          finish('max_wait_reached');
          return;
        }

        setTimeout(() => {
          void tick();
        }, pollInterval);
      };

      void tick();
    }))()`) as {
      reason: string;
      elapsed: number;
      contentLength: number;
      readyState: string;
    };

    logger.debug('Page ready signals settled', {
      reason: result.reason,
      elapsed: result.elapsed,
      contentLength: result.contentLength,
      readyState: result.readyState,
    });
  }

  /**
   * 获取页面标题
   */
  getPageTitle(view: WebContentsView): string {
    return view.webContents.getTitle();
  }

  /**
   * 获取页面 URL
   */
  getPageUrl(view: WebContentsView): string {
    return view.webContents.getURL();
  }

  /**
   * 更新池大小
   */
  async resize(newSize: number): Promise<void> {
    newSize = Math.max(1, Math.min(10, newSize));
    if (newSize === this.poolSize) return;

    logger.info('Resizing PagePool', { oldSize: this.poolSize, newSize });

    if (newSize > this.poolSize) {
      // 增加页面
      for (let i = this.poolSize; i < newSize; i++) {
        const view = this.createPage(i);
        this.pages.push({ view, busy: false });
      }
    } else {
      // 减少页面（只移除空闲的）
      const toRemove = this.poolSize - newSize;
      let removed = 0;
      
      for (let i = this.pages.length - 1; i >= 0 && removed < toRemove; i--) {
        if (!this.pages[i].busy) {
          const page = this.pages.splice(i, 1)[0];
          if (this.hostWindow) {
            this.hostWindow.contentView.removeChildView(page.view);
          }
          removed++;
        }
      }
    }

    this.poolSize = this.pages.length;
    logger.info('PagePool resized', { newSize: this.poolSize });
  }

  /**
   * 销毁页面池
   */
  destroy(): void {
    logger.info('Destroying PagePool');

    // 清空等待队列
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Page pool destroyed'));
    }
    this.waitQueue = [];

    // 销毁所有页面
    for (const page of this.pages) {
      if (this.hostWindow) {
        this.hostWindow.contentView.removeChildView(page.view);
      }
    }
    this.pages = [];
    this.sessionHeadersHooked = false;

    // 销毁宿主窗口
    if (this.hostWindow && !this.hostWindow.isDestroyed()) {
      this.hostWindow.close();
      this.hostWindow = null;
    }

    this.initialized = false;
    this.initPromise = null;
    logger.info('PagePool destroyed');
  }

  /**
   * 获取池状态
   */
  getStatus(): { total: number; busy: number; free: number; waiting: number } {
    const busy = this.pages.filter(p => p.busy).length;
    return {
      total: this.pages.length,
      busy,
      free: this.pages.length - busy,
      waiting: this.waitQueue.length
    };
  }
}

// 单例
let pagePoolInstance: PagePool | null = null;

/**
 * 获取页面池实例（单例）
 * 从配置读取 poolSize 和 searchTimeout
 */
export function getPagePool(): PagePool {
  if (!pagePoolInstance) {
    // 首次创建时，从配置读取参数
    let size = 5;
    let timeout = 10000; // 默认 10 秒
    try {
      // 延迟导入避免循环依赖
      const { getWebSearchConfig, DEFAULT_WEB_SEARCH_CONFIG } = require('./webSearchData');
      const config = getWebSearchConfig();
      size = config.pagePoolSize ?? DEFAULT_WEB_SEARCH_CONFIG.pagePoolSize;
      timeout = (config.searchTimeout ?? DEFAULT_WEB_SEARCH_CONFIG.searchTimeout) * 1000; // 转换为毫秒
    } catch {
      // 使用默认值
    }
    pagePoolInstance = new PagePool(size, timeout);
  }
  return pagePoolInstance;
}

/**
 * 销毁页面池
 */
export function destroyPagePool(): void {
  if (pagePoolInstance) {
    pagePoolInstance.destroy();
    pagePoolInstance = null;
  }
}

/**
 * 调整页面池大小
 */
export async function resizePagePool(newSize: number): Promise<void> {
  if (pagePoolInstance) {
    await pagePoolInstance.resize(newSize);
  }
}
