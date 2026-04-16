<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="p-4 flex flex-col gap-3">
      <ListCell
        :title="t('storage.export.title')"
        :description="t('storage.export.description')"
      >
        <template #trailing>
          <UButton
            size="md"
            variant="outline"
            :disabled="exporting || importing || pathsLoading"
            :loading="exporting"
            @click="exportUserData"
          >
            {{ t('storage.export.action') }}
          </UButton>
        </template>
      </ListCell>

      <ListCell
        :title="t('storage.import.title')"
        :description="t('storage.import.description')"
      >
        <template #trailing>
          <UButton
            size="md"
            variant="outline"
            :disabled="exporting || importing || pathsLoading"
            :loading="importing"
            @click="importConfirmOpen = true"
          >
            {{ t('storage.import.action') }}
          </UButton>
        </template>
      </ListCell>

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

    <UModal
      v-model:open="importConfirmOpen"
      :title="t('storage.import.confirmTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="flex flex-col gap-3 text-sm text-toned">
          <p>{{ t('storage.import.confirmIntro') }}</p>
          <p class="text-sm text-default font-mono break-all rounded-lg border border-default bg-elevated px-3 py-2">
            {{ autoImportBackupDir || '—' }}
          </p>
          <p>{{ t('storage.import.confirmOutro') }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" color="neutral" @click="importConfirmOpen = false">
            {{ t('common.cancel') }}
          </UButton>
          <UButton color="error" :disabled="importing" :loading="importing" @click="confirmImport">
            {{ t('storage.import.continue') }}
          </UButton>
        </div>
      </template>
    </UModal>
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
const autoImportBackupDir = ref('')
const pathsLoading = ref(true)
const openingUserData = ref(false)
const openingLogs = ref(false)
const exporting = ref(false)
const importing = ref(false)
const importConfirmOpen = ref(false)

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
    autoImportBackupDir.value = result.autoImportBackupDir
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

async function exportUserData() {
  exporting.value = true
  try {
    const result = await window.ipc('app:exportUserDataArchive')
    if (!result.ok) {
      if ('canceled' in result && result.canceled) return
      const err = 'error' in result ? result.error : ''
      if (err === 'export_in_progress') {
        toast.error(t('storage.export.busy'))
        return
      }
      toast.error(err ? `${t('storage.export.failed')}: ${err}` : t('storage.export.failed'))
      return
    }
    toast.success(t('storage.export.success', { path: result.filePath }))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    exporting.value = false
  }
}

function formatImportError(err: string): string {
  if (err === 'import_bad_format_version') return t('storage.import.badFormat')
  if (err === 'import_missing_db') return t('storage.import.missingDb')
  if (err.startsWith('auto_backup_failed:')) return t('storage.import.autoBackupFailed')
  return err
}

async function confirmImport() {
  importing.value = true
  try {
    const result = await window.ipc('app:importUserDataArchive')
    if (!result.ok) {
      if ('canceled' in result && result.canceled) {
        importConfirmOpen.value = false
        return
      }
      const err = 'error' in result ? result.error : ''
      const backupPath = 'backupPath' in result ? result.backupPath : undefined
      const msg = err ? formatImportError(err) : t('storage.import.failed')
      toast.error(backupPath ? `${msg} · ${backupPath}` : msg)
      importConfirmOpen.value = false
      return
    }
    importConfirmOpen.value = false
    toast.success(t('storage.import.success', { path: result.backupPath }))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
    importConfirmOpen.value = false
  } finally {
    importing.value = false
  }
}

onMounted(() => {
  void loadPaths()
})
</script>
