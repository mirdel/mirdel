import { watch } from 'vue'
import { useRoute } from 'vue-router'

const memoryMap = new Map<string, string>()

export function useRouteMemory() {
  const route = useRoute()

  watch(
    () => route.path,
    (path) => {
      const section = '/' + path.split('/').filter(Boolean)[0]
      if (section && section !== '/') {
        memoryMap.set(section, path)
      }
    },
    { immediate: true }
  )

  function resolve(basePath: string): string {
    return memoryMap.get(basePath) || basePath
  }

  return { resolve }
}
