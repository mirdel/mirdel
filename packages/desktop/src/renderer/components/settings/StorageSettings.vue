<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="p-4 flex flex-col gap-3">
      <ListCell
        :title="t('storage.appData.title')"
        :description="userDataDescription"
      >
        <template #trailing>
          <UButton
            size="md"
            variant="outline"
            :disabled="!userDataPath || openingUserData"
            :loading="openingUserData"
            @click="openUserDataDir"
          >
            {{ t('storage.appData.openDir') }}
          </UButton>
        </template>
      </ListCell>

      <ListCell
        :title="t('storage.logs.title')"
        :description="logsDirDescription"
      >
        <template #trailing>
          <UButton
            size="md"
            variant="outline"
            :disabled="!logsDirPath || openingLogs"
            :loading="openingLogs"
            @click="openLogsDir"
          >
            {{ t('storage.logs.openLogs') }}
          </UButton>
        </template>
      </ListCell>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ListCell from '@/components/ListCell.vue'
import { useMyToast } from '@/composables/useMyToast'

const { t } = useI18n()
const toast = useMyToast()

const userDataPath = ref('')
const logsDirPath = ref('')
const pathsLoading = ref(true)
const openingUserData = ref(false)
const openingLogs = ref(false)

const userDataDescription = computed(() => {
  if (userDataPath.value) return userDataPath.value
  if (pathsLoading.value) return t('storage.pathsLoading')
  return t('storage.pathsUnavailable')
})

const logsDirDescription = computed(() => {
  if (logsDirPath.value) return logsDirPath.value
  if (pathsLoading.value) return t('storage.pathsLoading')
  return t('storage.pathsUnavailable')
})

async function loadPaths() {
  pathsLoading.value = true
  try {
    const result = await window.ipc('app:getStoragePaths')
    userDataPath.value = result.userData
    logsDirPath.value = result.logsDir
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    pathsLoading.value = false
  }
}

async function openUserDataDir() {
  if (!userDataPath.value) return
  openingUserData.value = true
  try {
    const result = await window.ipc('shell:openPath', userDataPath.value)
    if (!result?.ok) {
      toast.error(result?.error || t('storage.openFailed'))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    openingUserData.value = false
  }
}

async function openLogsDir() {
  if (!logsDirPath.value) return
  openingLogs.value = true
  try {
    const result = await window.ipc('shell:openPath', logsDirPath.value)
    if (!result?.ok) {
      toast.error(result?.error || t('storage.openFailed'))
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    openingLogs.value = false
  }
}

onMounted(() => {
  void loadPaths()
})
</script>
