import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getPersistentValue, setPersistentValueSoon } from '@/utils/persistentState'

export type Project = {
  id: string
  name: string
  description?: string
  scenarioId: string
  color?: string
  icon?: string
  createdAt: number
  updatedAt: number
}

const LAST_SELECTED_PROJECT_KEY = 'last-selected-project'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProjectId = ref<string | '__all__' | '__uncategorized__' | '__starred__' | null>(null)
  const loading = ref(false)

  // 初始化
  async function init() {
    loading.value = true
    try {
      // 加载所有项目
      projects.value = await window.ipc('projects:list')

      // 读取上次选择的项目
      const lastSelected = getPersistentValue<string | null>(LAST_SELECTED_PROJECT_KEY, null)
      if (lastSelected) {
        currentProjectId.value = lastSelected
      } else {
        currentProjectId.value = '__all__'
      }
    } finally {
      loading.value = false
    }
  }

  // 选择项目
  function selectProject(id: string | '__all__' | '__uncategorized__') {
    currentProjectId.value = id
    setPersistentValueSoon(LAST_SELECTED_PROJECT_KEY, id)
  }

  // 创建项目
  async function createProject(input: {
    name: string
    description?: string
    scenarioId: string
    color?: string
    icon?: string
  }) {
    const project = await window.ipc('projects:create', input)
    projects.value.unshift(project)
    // 创建后自动切换到该项目
    selectProject(project.id)
    return project
  }

  // 更新项目
  async function updateProject(id: string, data: Partial<{
    name: string
    description: string
    scenarioId: string
    color: string
    icon: string
  }>) {
    const updated = await window.ipc('projects:update', { id, data })
    const index = projects.value.findIndex(p => p.id === id)
    if (index !== -1) {
      projects.value[index] = updated
    }
    return updated
  }

  // 删除项目
  async function deleteProject(id: string) {
    await window.ipc('projects:delete', { id })
    projects.value = projects.value.filter(p => p.id !== id)
    
    // 如果删除的是当前选中的项目，切换到全部会话
    if (currentProjectId.value === id) {
      selectProject('__all__')
    }
  }

  // 获取当前选中项目信息
  const currentProject = computed(() => {
    if (!currentProjectId.value || 
        currentProjectId.value === '__all__' || 
        currentProjectId.value === '__uncategorized__' ||
        currentProjectId.value === '__starred__') {
      return null
    }
    return projects.value.find(p => p.id === currentProjectId.value)
  })

  return {
    projects,
    currentProjectId,
    currentProject,
    loading,
    init,
    selectProject,
    createProject,
    updateProject,
    deleteProject
  }
})
