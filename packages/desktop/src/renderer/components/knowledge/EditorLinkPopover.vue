<template>
  <UPopover v-model:open="open" :ui="{ content: 'p-0.5' }">
    <UTooltip :text="tooltipText">
      <UButton
        icon="i-lucide-link"
        color="neutral"
        variant="ghost"
        active-variant="soft"
        size="sm"
        :active="active"
        :disabled="disabled"
      />
    </UTooltip>

    <template #content>
      <UInput
        v-model="url"
        autofocus
        name="url"
        type="url"
        variant="none"
        :placeholder="placeholder"
        @keydown="handleKeyDown"
      >
        <div class="flex items-center mr-0.5">
          <UTooltip :text="applyTitle">
            <UButton
              icon="i-lucide-corner-down-left"
              variant="ghost"
              color="neutral"
              size="sm"
              :disabled="!url && !active"
              @click="setLink"
            />
          </UTooltip>

          <USeparator orientation="vertical" class="h-6 mx-1" />

          <UTooltip :text="openTitle">
            <UButton
              icon="i-lucide-external-link"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!url && !active"
              @click="openLink"
            />
          </UTooltip>

          <UTooltip :text="removeTitle">
            <UButton
              icon="i-lucide-trash"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!url && !active"
              @click="removeLink"
            />
          </UTooltip>
        </div>
      </UInput>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Editor } from '@tiptap/vue-3'

const props = defineProps<{
  editor: Editor
  autoOpen?: boolean
  tooltipText?: string
  placeholder?: string
  applyTitle?: string
  openTitle?: string
  removeTitle?: string
}>()
const { t } = useI18n()

const open = ref(false)
const url = ref('')
const tooltipText = computed(() => props.tooltipText || t('editor.link.tooltip'))
const placeholder = computed(() => props.placeholder || t('editor.link.placeholder'))
const applyTitle = computed(() => props.applyTitle || t('editor.link.apply'))
const openTitle = computed(() => props.openTitle || t('editor.link.preview'))
const removeTitle = computed(() => props.removeTitle || t('editor.link.remove'))

const active = computed(() => props.editor.isActive('link'))
const disabled = computed(() => {
  if (!props.editor.isEditable) return true
  const { selection } = props.editor.state
  return selection.empty && !props.editor.isActive('link')
})

watch(
  () => props.editor,
  (editor, _, onCleanup) => {
    if (!editor) return

    const updateUrl = () => {
      const { href } = editor.getAttributes('link')
      url.value = href || ''
    }

    updateUrl()
    editor.on('selectionUpdate', updateUrl)

    onCleanup(() => {
      editor.off('selectionUpdate', updateUrl)
    })
  },
  { immediate: true }
)

watch(active, (isActive) => {
  if (isActive && props.autoOpen) {
    open.value = true
  }
})

function setLink() {
  if (!url.value) return

  const { selection } = props.editor.state
  const isEmpty = selection.empty
  const hasCode = props.editor.isActive('code')

  let chain = props.editor.chain().focus()

  if (hasCode && !isEmpty) {
    chain = chain.extendMarkRange('code').setLink({ href: url.value })
  } else {
    chain = chain.extendMarkRange('link').setLink({ href: url.value })

    if (isEmpty) {
      chain = chain.insertContent({ type: 'text', text: url.value })
    }
  }

  chain.run()
  open.value = false
}

function removeLink() {
  props.editor
    .chain()
    .focus()
    .extendMarkRange('link')
    .unsetLink()
    .setMeta('preventAutolink', true)
    .run()

  url.value = ''
  open.value = false
}

function openLink() {
  const target = url.value.trim()
  if (!target) return

  if (window.webPreview?.open) {
    window.webPreview.open(target)
    return
  }

  window.open(target, '_blank', 'noopener,noreferrer')
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    setLink()
  }
}
</script>
