type MessageType = 'info' | 'success' | 'warn' | 'error'
type MessageInput = string | Partial<Toast>

export function useMyToast() {
  const toast = useToast()

  const iconMap: Record<MessageType, string> = {
    info: 'i-lucide-info',
    success: 'i-lucide-circle-check',
    warn: 'i-lucide-triangle-alert',
    error: 'i-lucide-circle-x'
  }

  const colorMap: Record<MessageType, string> = {
    info: 'info',
    success: 'success',
    warn: 'warning',
    error: 'error'
  }

  const showMessage = (type: MessageType, input: MessageInput) => {
    // 默认配置
    const defaultOptions = {
      icon: iconMap[type],
      color: colorMap[type],
      close: false,
      duration: 2000,
      progress: false,
    }

    // 如果传入的是字符串，转换为对象
    const userOptions = typeof input === 'string' 
      ? { title: input } 
      : input

    // 合并配置：用户配置会覆盖默认配置
    toast.add({
      ...defaultOptions,
      ...userOptions
    })
  }

  return {
    info: (input: MessageInput) => showMessage('info', input),
    success: (input: MessageInput) => showMessage('success', input),
    warn: (input: MessageInput) => showMessage('warn', input),
    error: (input: MessageInput) => showMessage('error', input)
  }
}
