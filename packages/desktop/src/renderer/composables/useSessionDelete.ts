import { useChatStore } from '@/stores/useChatStore'
import { useConfirm } from '@/composables/useConfirm'
import { i18n } from '@/i18n'

/**
 * 会话删除逻辑的 composable
 * 包含确认弹窗和删除逻辑
 */
export function useSessionDelete() {
  const chatStore = useChatStore()
  const { confirm } = useConfirm()
  
  /**
   * 删除会话（带确认弹窗）
   * @param sessionId 要删除的会话 ID
   */
  async function deleteSession(sessionId: string) {
    const session = chatStore.sessions.find(s => s.id === sessionId)
    if (!session) return

    // 检查是否是主会话（没有 rootSessionId）
    const isMainSession = !session.rootSessionId
    const childBranches = chatStore.sessions.filter(s => s.rootSessionId === sessionId)
    
    let content: string
    if (isMainSession && childBranches.length > 0) {
      // 删除主会话，且有子分支
      content = i18n.global.t('chat.sessionDelete.withBranches', {
        name: session.title,
        count: childBranches.length
      })
    } else {
      // 删除子分支，或删除没有子分支的主会话
      content = i18n.global.t('chat.sessionDelete.simple', {
        name: session.title
      })
    }

    const confirmed = await confirm({
      title: i18n.global.t('chat.sessionDelete.title'),
      content,
      confirmText: i18n.global.t('common.delete'),
      cancelText: i18n.global.t('common.cancel'),
      confirmColor: 'error',
      confirmIcon: 'i-lucide-trash-2'
    })

    if (confirmed) {
      chatStore.deleteSession(sessionId)
    }
  }
  
  return { deleteSession }
}
