<template>
  <UModal v-model:open="isOpen" :title="isEdit ? t('settings.mcpServer.editTitle') : t('settings.mcpServer.createTitle')">
    <template #body>
      <div class="flex flex-col gap-4">
      <!-- 基础信息 -->
      <UFormField :label="t('settings.customProvider.name')" required>
        <UInput
          v-model="form.name"
          :placeholder="t('settings.mcpServer.namePlaceholder')"
          class="w-full"
          autofocus
        />
      </UFormField>

      <UFormField :label="t('settings.mcpCapability.field.description')">
        <UTextarea
          v-model="form.description"
          :placeholder="t('settings.mcpServer.descriptionPlaceholder')"
          :rows="2"
          class="w-full"
        />
      </UFormField>

      <!-- 使用场景 -->
      <UFormField :label="t('settings.mcpServer.useCases')" :description="t('settings.mcpServer.useCasesDescription')">
        <UTextarea
          v-model="useCasesText"
          :placeholder="t('settings.mcpServer.useCasesPlaceholder')"
          :rows="4"
          class="w-full"
        />
      </UFormField>

      <!-- 类型选择 -->
      <UFormField :label="t('settings.customProvider.type')" required>
        <URadioGroup v-model="form.type" :items="typeOptions" />
      </UFormField>

      <!-- Stdio 配置 -->
      <template v-if="form.type === 'stdio'">
        <div>
          <div class="text-sm font-medium mb-3">{{ t('settings.mcpServer.stdioConfig') }}</div>
          
          <UFormField :label="t('settings.mcpServer.command')" required>
            <UInput
              v-model="form.command"
              placeholder="node"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('settings.mcpServer.args')" class="mt-3">
            <div class="flex flex-col gap-2">
              <div
                v-for="(arg, index) in form.args"
                :key="index"
                class="flex gap-2"
              >
                <UInput
                  v-model="form.args[index]"
                  placeholder="arg"
                  class="flex-1"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  color="neutral"
                  @click="removeArg(index)"
                />
              </div>
              <UButton
                :label="t('settings.mcpServer.addArg')"
                icon="i-lucide-plus"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="addArg"
              />
            </div>
          </UFormField>

          <UFormField :label="t('settings.mcpServer.env')" class="mt-3">
            <div class="flex flex-col gap-2">
              <div
                v-for="(envItem, index) in envItems"
                :key="index"
                class="flex gap-2"
              >
                <UInput
                  v-model="envItem.key"
                  placeholder="KEY"
                  class="flex-1"
                />
                <UInput
                  v-model="envItem.value"
                  placeholder="value"
                  class="flex-1"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  color="neutral"
                  @click="removeEnv(index)"
                />
              </div>
              <UButton
                :label="t('settings.mcpServer.addEnv')"
                icon="i-lucide-plus"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="addEnv"
              />
            </div>
          </UFormField>
        </div>
      </template>

      <!-- HTTP 配置 -->
      <template v-else>
        <div>
          <div class="text-sm font-medium mb-3">{{ t('settings.mcpServer.httpConfig') }}</div>
          
          <UFormField label="URL" required>
            <UInput
              v-model="form.url"
              placeholder="http://localhost:3000/mcp"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('settings.mcpServer.headers')" class="mt-3">
            <div class="flex flex-col gap-2">
              <div
                v-for="(headerItem, index) in headerItems"
                :key="index"
                class="flex gap-2"
              >
                <UInput
                  v-model="headerItem.key"
                  placeholder="Header-Name"
                  class="flex-1"
                />
                <UInput
                  v-model="headerItem.value"
                  placeholder="value"
                  class="flex-1"
                />
                <UButton
                  icon="i-lucide-x"
                  variant="ghost"
                  size="xs"
                  color="red"
                  @click="removeHeader(index)"
                />
              </div>
              <UButton
                :label="t('settings.mcpServer.addHeader')"
                icon="i-lucide-plus"
                variant="soft"
                size="xs"
                @click="addHeader"
              />
            </div>
          </UFormField>
        </div>
      </template>

      <!-- 超时设置 -->
      <UFormField :label="t('settings.mcpServer.timeout')" required>
        <UInput
          v-model.number="form.timeout"
          type="number"
          placeholder="30000"
        />
      </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end gap-2">
        <UButton
          :label="t('common.cancel')"
          variant="outline"
          color="neutral"
          @click="handleCancel"
        />
        <UButton
          :label="t('common.save')"
          @click="handleSave"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useMcpStore } from "@/stores/useMcpStore";
import { useMyToast } from "@/composables/useMyToast";
import type { McpServerConfig, McpTransportType } from "@/stores/useMcpStore";

const props = defineProps<{
  open: boolean
  server?: McpServerConfig | null
}>();

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [serverId?: string]
}>();

const mcpStore = useMcpStore();
const toast = useMyToast();
const { t } = useI18n();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
});

const isEdit = computed(() => !!props.server);

// 表单数据
const form = ref({
  name: '',
  description: '',
  type: 'stdio' as McpTransportType,
  timeout: 30000,
  command: '',
  args: [] as string[],
  env: {} as Record<string, string>,
  url: '',
  headers: {} as Record<string, string>
});

// 使用场景文本（用换行分隔）
const useCasesText = ref('');

// 类型选项
const typeOptions = computed(() => [
  { 
    value: 'stdio', 
    label: 'Stdio', 
    description: t('settings.mcpServer.type.stdioDescription')
  },
  { 
    value: 'streamable-http', 
    label: 'Streamable HTTP', 
    description: t('settings.mcpServer.type.streamableDescription')
  },
  { 
    value: 'http-sse', 
    label: 'HTTP + SSE', 
    description: t('settings.mcpServer.type.sseDescription')
  }
]);

// 环境变量列表（用于编辑）
const envItems = ref<Array<{ key: string; value: string }>>([]);

// 请求头列表（用于编辑）
const headerItems = ref<Array<{ key: string; value: string }>>([]);

// 重置表单函数（需要在 watch 之前定义）
const resetForm = () => {
  form.value = {
    name: '',
    description: '',
    type: 'stdio',
    timeout: 30000,
    command: '',
    args: [],
    env: {},
    url: '',
    headers: {}
  };
  useCasesText.value = '';
  envItems.value = [];
  headerItems.value = [];
};

// 监听 props.server 变化，初始化表单
watch(() => props.server, (server) => {
  if (server) {
    form.value = {
      name: server.name,
      description: server.description || '',
      type: server.type,
      timeout: server.timeout,
      command: server.command || '',
      args: [...(server.args || [])],
      env: { ...(server.env || {}) },
      url: server.url || '',
      headers: { ...(server.headers || {}) }
    };
    
    // 使用场景
    useCasesText.value = (server.useCases || []).join('\n');
    
    // 环境变量
    envItems.value = Object.entries(server.env || {}).map(([key, value]) => ({ key, value }));
    
    // 请求头
    headerItems.value = Object.entries(server.headers || {}).map(([key, value]) => ({ key, value }));
  } else {
    resetForm();
  }
}, { immediate: true });

// 参数管理
const addArg = () => {
  form.value.args.push('');
};

const removeArg = (index: number) => {
  form.value.args.splice(index, 1);
};

// 环境变量管理
const addEnv = () => {
  envItems.value.push({ key: '', value: '' });
};

const removeEnv = (index: number) => {
  envItems.value.splice(index, 1);
};

// 请求头管理
const addHeader = () => {
  headerItems.value.push({ key: '', value: '' });
};

const removeHeader = (index: number) => {
  headerItems.value.splice(index, 1);
};

// 表单验证
const validateForm = () => {
  if (!form.value.name.trim()) {
    toast.error({ title: t('settings.mcpServer.enterName') });
    return false;
  }
  
  if (!form.value.type) {
    toast.error({ title: t('settings.mcpServer.selectType') });
    return false;
  }
  
  if (form.value.timeout <= 0) {
    toast.error({ title: t('settings.mcpServer.timeoutPositive') });
    return false;
  }
  
  if (form.value.type === 'stdio') {
    if (!form.value.command.trim()) {
      toast.error({ title: t('settings.mcpServer.enterCommand') });
      return false;
    }
  } else {
    if (!form.value.url.trim()) {
      toast.error({ title: t('settings.mcpServer.enterUrl') });
      return false;
    }
  }
  
  return true;
};

// 保存
const handleSave = async () => {
  if (!validateForm()) return;
  
  try {
    // 处理使用场景
    const useCases = useCasesText.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // 处理环境变量
    const env: Record<string, string> = {};
    envItems.value.forEach(item => {
      if (item.key.trim() && item.value.trim()) {
        env[item.key.trim()] = item.value;
      }
    });
    
    // 处理请求头
    const headers: Record<string, string> = {};
    headerItems.value.forEach(item => {
      if (item.key.trim() && item.value.trim()) {
        headers[item.key.trim()] = item.value;
      }
    });
    
    // 构建配置对象
    const config: any = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || undefined,
      useCases: useCases.length > 0 ? useCases : undefined,
      type: form.value.type,
      timeout: form.value.timeout
    };
    
    if (form.value.type === 'stdio') {
      config.command = form.value.command.trim();
      config.args = form.value.args.filter(a => a.trim().length > 0);
      if (Object.keys(env).length > 0) config.env = env;
    } else {
      config.url = form.value.url.trim();
      if (Object.keys(headers).length > 0) config.headers = headers;
    }
    
    if (isEdit.value && props.server) {
      const wasEnabled = props.server.enabled; // 记录之前的状态
      
      await mcpStore.updateServer(props.server.id, config);
      toast.success({ title: t('settings.mcpServer.updated') });
      emit('saved');
      
      // 如果之前是启用状态，异步重启
      if (wasEnabled) {
        mcpStore.setEnabled(props.server.id, true).then(() => {
          toast.success({ title: t('settings.mcpServer.restarted') });
        }).catch((error) => {
          toast.error({ 
            title: t('settings.mcpServer.restartFailed'), 
            description: String(error) 
          });
        });
      }
    } else {
      // 新建服务器
      const server = await mcpStore.createServer(config);
      toast.success({ title: t('settings.mcpServer.added') });
      
      // 先关闭弹窗，再异步启动服务器（不阻塞）
      emit('saved', server.id);
      
      // 异步启动新建的服务器
      mcpStore.setEnabled(server.id, true).then(() => {
        toast.success({ title: t('settings.mcpServer.started') });
      }).catch((error) => {
        toast.error({ 
          title: t('settings.mcpServer.startFailed'), 
          description: String(error) 
        });
      });
    }
    
    resetForm();
  } catch (error) {
    toast.error({ 
      title: t('settings.defaultModel.saveFailed'), 
      description: String(error) 
    });
  }
};

const handleCancel = () => {
  isOpen.value = false;
  resetForm();
};
</script>
