import { ref } from 'vue';
import { i18n } from '@/i18n';

type ConfirmColor = 'primary' | 'neutral' | 'error' | 'warning';

export interface ConfirmOptions {
  title?: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: ConfirmColor;
  confirmIcon?: string;
}

interface ConfirmState {
  open: boolean;
  title: string;
  content: string;
  confirmText: string;
  cancelText: string;
  confirmColor: ConfirmColor;
  confirmIcon?: string;
  resolve: ((value: boolean) => void) | null;
}

const state = ref<ConfirmState>({
  open: false,
  title: i18n.global.t('common.confirmTitle'),
  content: '',
  confirmText: i18n.global.t('common.confirm'),
  cancelText: i18n.global.t('common.cancel'),
  confirmColor: 'primary',
  confirmIcon: undefined,
  resolve: null
});

export function useConfirm() {
  function confirm(options: ConfirmOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' 
      ? { content: options } 
      : options;

    return new Promise<boolean>((resolve) => {
      state.value = {
        open: true,
        title: opts.title || i18n.global.t('common.confirmTitle'),
        content: opts.content,
        confirmText: opts.confirmText || i18n.global.t('common.confirm'),
        cancelText: opts.cancelText || i18n.global.t('common.cancel'),
        confirmColor: opts.confirmColor || 'primary',
        confirmIcon: opts.confirmIcon,
        resolve
      };
    });
  }

  function handleConfirm() {
    state.value.resolve?.(true);
    state.value.open = false;
    state.value.resolve = null;
  }

  function handleCancel() {
    state.value.resolve?.(false);
    state.value.open = false;
    state.value.resolve = null;
  }

  return {
    state,
    confirm,
    handleConfirm,
    handleCancel
  };
}
