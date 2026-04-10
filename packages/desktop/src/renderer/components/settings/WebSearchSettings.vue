<template>
  <div class="flex min-w-0 flex-1 min-h-0 bg-default rounded-xl overflow-hidden">
    <!-- 第二栏：搜索服务列表 -->
    <section class="w-[240px] flex flex-col border-r border-default min-h-0">
      <div class="h-[45px] px-4 border-b border-default flex items-center justify-between shrink-0">
        <div class="text-sm font-medium">{{ t("settings.webSearch.title") }}</div>
        <UTooltip :text="t('settings.webSearch.configAction')">
          <UButton
            icon="i-lucide-settings"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="showCommonConfigModal = true"
          />
        </UTooltip>
      </div>
      <div class="p-3 pb-2 shrink-0">
        <UInput
          v-model="webSearchListSearchQuery"
          :placeholder="t('settings.webSearch.listSearchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          :ui="{ root: 'w-full' }"
        />
      </div>
      
      <!-- 服务列表 -->
      <UList
        v-if="filteredDisplayList.length > 0"
        :model-value="selectedProviderId"
        :items="filteredDisplayList"
        value-key="id"
        label-key="name"
        size="md"
        gap="md"
        padding="md"
        class="flex-1 min-h-0"
        @update:model-value="handleSelectProvider"
      >
        <template #item="{ item }">
          <div class="flex flex-col items-start gap-1 min-w-0">
            <div class="flex items-center gap-1.5 w-full">
              <UText :text="item.name" class="text-sm font-medium flex-1 min-w-0" />
              <!-- 状态点：内置始终绿色，其他根据 enabled -->
              <div
                :class="[
                  'w-2 h-2 rounded-full shrink-0',
                  item.type === 'builtin' || item.enabled ? 'bg-green-500' : 'bg-inverted/30'
                ]"
              />
            </div>
            <!-- 内置显示"免费"，预设显示 Key 状态，自定义显示"自定义" -->
            <div v-if="item.type === 'builtin'" class="text-xs opacity-70">{{ t("settings.modelService.free") }}</div>
            <div v-else-if="item.type === 'preset'" class="text-xs opacity-70">
              {{ item.hasApiKey ? t("settings.modelService.keyConfigured") : t("settings.modelService.keyNotConfigured") }}
            </div>
            <div v-else class="text-xs opacity-70">{{ t("settings.modelService.custom") }}</div>
          </div>
        </template>
      </UList>
      <div
        v-else-if="webSearchListSearchQuery.trim()"
        class="flex-1 min-h-0 flex items-center justify-center p-2"
      >
        <UEmpty
          :title="t('common.listSearchNoResults')"
          icon="i-lucide-search"
          size="sm"
          variant="naked"
        />
      </div>
      <div v-else class="flex-1 min-h-0" />
      
      <!-- 底部按钮 -->
      <div class="p-3 border-t border-default shrink-0">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          block
          @click="handleAddCustom"
        >
          {{ t("settings.webSearch.addCustom") }}
        </UButton>
      </div>
    </section>

    <!-- 第三栏：服务详情配置 -->
    <section class="flex-1 min-w-0 flex flex-col">
      <!-- 未选中状态 -->
      <div v-if="!selectedProvider" class="h-full flex items-center justify-center">
        <div class="text-center opacity-70">
          <UIcon name="i-lucide-search" class="w-12 h-12 mx-auto mb-2" />
          <div class="text-sm">{{ t("settings.webSearch.selectPrompt") }}</div>
        </div>
      </div>

      <!-- 已选中服务 -->
      <div v-else class="flex flex-col h-full">
        <!-- 顶部标题 -->
        <div class="p-4 border-b border-default bg-muted">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h3 class="text-base font-semibold">{{ selectedProvider.name }}</h3>
            </div>
            <div class="flex items-center gap-2">
              <!-- 启用开关（非内置服务显示） -->
              <div v-if="selectedProvider.type !== 'builtin'" class="flex items-center gap-2 mr-2">
                <span class="text-xs text-muted">{{ t("settings.modelService.enabled") }}</span>
                <USwitch
                  :model-value="selectedProvider.enabled"
                  @update:model-value="handleEnableToggle"
                />
              </div>
              <UButton
                icon="i-lucide-play"
                size="sm"
                variant="solid"
                @click="showTestModal = true"
              >
                {{ t("settings.modelService.test") }}
              </UButton>
              <UButton
                v-if="selectedProvider.type === 'custom'"
                icon="i-lucide-trash-2"
                size="sm"
                variant="soft"
                color="error"
                @click="handleDeleteProvider"
              >
                {{ t("common.delete") }}
              </UButton>
            </div>
          </div>
          <p v-if="selectedProviderDescription" class="text-sm text-muted mt-1">
            {{ selectedProviderDescription }}
          </p>
        </div>

        <!-- 配置表单 -->
        <div class="flex-1 overflow-auto p-4">
          <div class="space-y-6 max-w-md">
            <!-- 内置服务配置 -->
            <template v-if="selectedProvider.type === 'builtin'">
              <!-- 搜索引擎 -->
              <div>
                <label class="block text-sm font-medium mb-2">
                  {{ t("settings.webSearch.builtin.engines") }}
                  <span class="text-muted font-normal ml-2">{{ config.selectedEngines.length }}</span>
                </label>
                <USelectMenu
                  v-if="builtinEngines.length > 0"
                  :model-value="config.selectedEngines"
                  :items="builtinEngineSelectItems"
                  value-key="name"
                  label-key="name"
                  multiple
                  :placeholder="t('settings.webSearch.builtin.enginesPlaceholder')"
                  class="w-full"
                  @update:model-value="handleBuiltinEnginesChange"
                >
                  <template #default="{ modelValue }">
                    <div
                      v-if="Array.isArray(modelValue) && modelValue.length > 0"
                      class="flex flex-wrap gap-1"
                    >
                      <UBadge
                        v-for="name in modelValue"
                        :key="name"
                        size="lg"
                        color="neutral"
                        variant="soft"
                        class="max-w-[160px]"
                      >
                        <span class="truncate">{{ name }}</span>
                      </UBadge>
                    </div>
                    <span v-else class="text-sm text-muted">{{ t("settings.webSearch.builtin.enginesPlaceholder") }}</span>
                  </template>
                </USelectMenu>
                <div v-else class="text-sm text-muted">{{ t("settings.webSearch.builtin.noEngines") }}</div>
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.builtin.enginesHint") }}</p>
              </div>

              <!-- 搜索结果数量 -->
              <div>
                <label class="block text-sm font-medium mb-2">
                  {{ t("settings.webSearch.builtin.resultLimit") }}
                  <span class="text-muted font-normal ml-2">{{ config.resultLimit }}</span>
                </label>
                <USlider
                  v-model="config.resultLimit"
                  :min="1"
                  :max="30"
                  :step="1"
                  size="xs"
                  @update:model-value="debouncedSaveConfig"
                />
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.builtin.resultLimitHint") }}</p>
              </div>

              <!-- 时间范围 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.builtin.timeRange") }}</label>
                <URadioGroup
                  v-model="config.timeRange"
                  :items="timeRangeOptions"
                  @update:model-value="debouncedSaveConfig"
                />
              </div>

              <!-- 安全搜索 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.builtin.safeSearch") }}</label>
                <URadioGroup
                  v-model="config.safeSearch"
                  :items="safeSearchOptions"
                  @update:model-value="debouncedSaveConfig"
                />
              </div>
            </template>

            <!-- 预设服务配置 -->
            <template v-else-if="selectedProvider.type === 'preset'">
              <!-- API Key -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.modelService.apiKey") }}</label>
                <UInput
                  v-model="providerApiKey"
                  type="password"
                  :placeholder="t('settings.modelService.apiKeyPlaceholder')"
                  class="w-full"
                  @update:model-value="debouncedSaveProvider"
                />
                <p v-if="selectedPresetTemplate?.website" class="text-xs text-muted mt-1">
                  {{ t("settings.webSearch.getApiKeyPrefix") }}
                  <a :href="selectedPresetTemplate.website" class="text-blue-500 hover:underline cursor-pointer">{{ selectedPresetTemplate.website }}</a>
                  {{ t("settings.webSearch.getApiKeySuffix") }}
                </p>
              </div>

              <!-- 可配置参数 -->
              <template v-if="selectedPresetTemplate?.configurableParams">
                <div v-for="param in selectedPresetTemplate.configurableParams" :key="param.key">
                  <label class="block text-sm font-medium mb-2">
                    {{ param.label }}
                    <span v-if="param.type === 'number'" class="text-muted font-normal ml-2">
                      {{ providerParams[param.key] ?? param.default }}
                    </span>
                  </label>
                  
                  <!-- Number 类型 -->
                  <template v-if="param.type === 'number'">
                    <USlider
                      :model-value="providerParams[param.key] ?? param.default"
                      :min="param.min ?? 1"
                      :max="param.max ?? 100"
                      :step="1"
                      size="xs"
                      @update:model-value="(val: number) => handleParamChange(param.key, val)"
                    />
                  </template>
                  
                  <!-- Boolean 类型 -->
                  <template v-else-if="param.type === 'boolean'">
                    <USwitch
                      :model-value="providerParams[param.key] ?? param.default"
                      @update:model-value="(val: boolean) => handleParamChange(param.key, val)"
                    />
                  </template>
                  
                  <!-- Select 类型 -->
                  <template v-else-if="param.type === 'select'">
                    <USelect
                      :model-value="providerParams[param.key] ?? param.default"
                      :items="param.options || []"
                      value-key="value"
                      label-key="label"
                      class="w-full"
                      @update:model-value="(val: string) => handleParamChange(param.key, val)"
                    />
                  </template>
                  
                  <!-- String 类型 -->
                  <template v-else>
                    <UInput
                      :model-value="providerParams[param.key] ?? param.default"
                      class="w-full"
                      @update:model-value="(val: string) => handleParamChange(param.key, val)"
                    />
                  </template>
                  
                  <p v-if="param.description" class="text-xs text-muted mt-1">{{ param.description }}</p>
                </div>
              </template>
            </template>

            <!-- 自定义服务配置 -->
            <template v-else-if="selectedProvider.type === 'custom'">
              <!-- 名称 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.customProvider.name") }}</label>
                <UInput
                  ref="customNameInputRef"
                  v-model="customConfig.name"
                  :placeholder="t('settings.webSearch.custom.namePlaceholder')"
                  class="w-full"
                  @update:model-value="debouncedSaveCustomProvider"
                />
              </div>

              <!-- 请求方式 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.custom.method") }}</label>
                <URadioGroup
                  v-model="customConfig.method"
                  :items="[{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }]"
                  @update:model-value="debouncedSaveCustomProvider"
                />
              </div>

              <!-- URL -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.field.requestUrl") }}</label>
                <UInput
                  v-model="customConfig.url"
                  placeholder="https://api.example.com/search"
                  class="w-full"
                  @update:model-value="debouncedSaveCustomProvider"
                />
              </div>

              <!-- 请求头 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.custom.headers") }}</label>
                <UTextarea
                  v-model="headersJson"
                  placeholder='{"Authorization": "Bearer your-api-key", "Content-Type": "application/json"}'
                  :rows="3"
                  @update:model-value="handleHeadersChange"
                />
              </div>

              <!-- 关键词字段名 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.field.queryField") }}</label>
                <UInput
                  v-model="customConfig.parameterMapping.queryField"
                  placeholder="query"
                  class="w-full"
                  @update:model-value="debouncedSaveCustomProvider"
                />
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.custom.queryFieldHint") }}</p>
              </div>

              <!-- 额外参数 -->
              <div>
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.custom.extraParams") }}</label>
                <UTextarea
                  v-model="extraParamsJson"
                  placeholder='{"max_results": 10}'
                  :rows="3"
                  @update:model-value="handleExtraParamsChange"
                />
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.custom.extraParamsHint") }}</p>
              </div>

              <!-- 响应映射 -->
              <div class="border-t border-default pt-4 mt-2">
                <h4 class="text-sm font-medium mb-4">{{ t("settings.webSearch.custom.responseMapping") }}</h4>
                
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.field.resultsPath") }}</label>
                    <UInput
                      v-model="customConfig.responseMapping.resultsPath"
                      :placeholder="t('settings.webSearch.custom.resultsPathPlaceholder')"
                      class="w-full"
                      @update:model-value="debouncedSaveCustomProvider"
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.field.urlField") }}</label>
                    <UInput
                      v-model="customConfig.responseMapping.urlField"
                      placeholder="url"
                      class="w-full"
                      @update:model-value="debouncedSaveCustomProvider"
                    />
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.field.titleField") }}</label>
                    <UInput
                      v-model="customConfig.responseMapping.titleField"
                      placeholder="title"
                      class="w-full"
                      @update:model-value="debouncedSaveCustomProvider"
                    />
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.field.contentField") }}</label>
                    <UInput
                      v-model="customConfig.responseMapping.contentField"
                      placeholder="content"
                      class="w-full"
                      @update:model-value="debouncedSaveCustomProvider"
                    />
                    <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.custom.contentFieldHint") }}</p>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- 通用配置 Modal -->
    <UModal v-model:open="showCommonConfigModal" :title="t('settings.webSearch.configAction')">
      
      <template #body>
        <p class="text-sm text-muted mb-4">{{ t("settings.webSearch.common.description") }}</p>
        <div class="space-y-6">
          <!-- API 请求超时 -->
          <div>
              <label class="block text-sm font-medium mb-2">
              {{ t("settings.webSearch.common.searchTimeout") }}
              <span class="text-muted font-normal ml-2">{{ t("settings.webSearch.seconds", { value: config.searchTimeout }) }}</span>
              </label>
            <USlider
              v-model="config.searchTimeout"
              :min="1"
              :max="60"
              :step="1"
              size="xs"
              @update:model-value="debouncedSaveConfig"
            />
            <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.common.searchTimeoutHint") }}</p>
          </div>

          <!-- 单页抓取超时 -->
          <div>
              <label class="block text-sm font-medium mb-2">
              {{ t("settings.webSearch.common.fetchTimeout") }}
              <span class="text-muted font-normal ml-2">{{ t("settings.webSearch.seconds", { value: config.fetchTimeout }) }}</span>
              </label>
            <USlider
              v-model="config.fetchTimeout"
              :min="1"
              :max="60"
              :step="1"
              size="xs"
              @update:model-value="debouncedSaveConfig"
            />
            <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.common.fetchTimeoutHint") }}</p>
          </div>

          <!-- 并发数量 -->
          <div>
              <label class="block text-sm font-medium mb-2">
              {{ t("settings.webSearch.common.pagePoolSize") }}
              <span class="text-muted font-normal ml-2">{{ t("settings.webSearch.count", { value: config.pagePoolSize }) }}</span>
              </label>
            <USlider
              v-model="config.pagePoolSize"
              :min="1"
              :max="10"
              :step="1"
              size="xs"
              @update:model-value="debouncedSaveConfig"
            />
            <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.common.pagePoolSizeHint") }}</p>
          </div>

          <!-- 分割线 -->
          <div class="border-t border-default pt-4 mt-2">
            <h4 class="text-sm font-medium mb-4">{{ t("settings.webSearch.common.resultProcessing") }}</h4>
            
            <!-- 处理模式 -->
            <div class="mb-4">
              <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.common.processMode") }}</label>
              <URadioGroup
                v-model="config.processMode"
                :items="processModeOptions"
                @update:model-value="debouncedSaveConfig"
              />
            </div>

            <!-- RAG 模式配置 -->
            <template v-if="config.processMode === 'rag'">
              <div class="mb-4">
                <label class="block text-sm font-medium mb-2">{{ t("settings.webSearch.common.embeddingModel") }}</label>
                <ModelSelector
                  v-model="config.embeddingModel"
                  :show-default="true"
                  model-type="embedding"
                  @update:model-value="handleEmbeddingModelChange"
                />
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.common.embeddingModelHint") }}</p>
              </div>

              <div class="mb-4">
                <label class="block text-sm font-medium mb-2">
                  {{ t("settings.webSearch.common.ragTopN") }}
                  <span class="text-muted font-normal ml-2">{{ t("settings.webSearch.items", { value: config.ragTopN }) }}</span>
                </label>
                <USlider
                  v-model="config.ragTopN"
                  :min="1"
                  :max="20"
                  :step="1"
                  size="xs"
                  @update:model-value="debouncedSaveConfig"
                />
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.common.ragTopNHint") }}</p>
              </div>

              <div>
                <label class="block text-sm font-medium mb-2">
                  {{ t("settings.webSearch.common.embeddingDimension") }}
                  <span class="text-muted font-normal ml-2">
                    {{ config.embeddingDimension === null ? t("settings.webSearch.defaultValue") : config.embeddingDimension }}
                  </span>
                </label>
                <UInput
                  v-model.number="embeddingDimensionInput"
                  type="number"
                  :placeholder="t('settings.webSearch.common.embeddingDimensionPlaceholder')"
                  :min="1"
                  @update:model-value="handleEmbeddingDimensionChange"
                />
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.common.embeddingDimensionHint") }}</p>
              </div>
            </template>

            <!-- 截断模式配置 -->
            <template v-if="config.processMode === 'truncate'">
              <div>
                <label class="block text-sm font-medium mb-2">
                  {{ t("settings.webSearch.common.contentMaxLength") }}
                  <span class="text-muted font-normal ml-2">
                    {{ config.contentMaxLength === null ? t("settings.webSearch.common.noTruncate") : t("settings.webSearch.characters", { value: config.contentMaxLength }) }}
                  </span>
                </label>
                <UInput
                  v-model.number="contentMaxLengthInput"
                  type="number"
                  :placeholder="t('settings.webSearch.common.contentMaxLengthPlaceholder')"
                  :min="500"
                  @update:model-value="handleContentMaxLengthChange"
                />
                <p class="text-xs text-muted mt-1">{{ t("settings.webSearch.common.contentMaxLengthHint") }}</p>
              </div>
            </template>
          </div>
        </div>
      </template>
    </UModal>

    <!-- 测试 Modal -->
    <UModal v-model:open="showTestModal">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-search" class="w-5 h-5" />
          <span>{{ t("settings.webSearch.test.title", { name: selectedProvider?.name ?? "" }) }}</span>
        </div>
      </template>
      
      <template #body>
        <div class="space-y-4">
          <!-- 搜索输入 -->
          <div class="flex gap-2">
            <UInput
              v-model="testQuery"
              :placeholder="t('settings.webSearch.test.queryPlaceholder')"
              class="flex-1"
              :disabled="isTestLoading"
              @keydown.enter="runTest"
            />
            <UButton
              :loading="isTestLoading"
              :disabled="!testQuery.trim()"
              @click="runTest"
            >
              {{ t("settings.webSearch.test.searchAction") }}
            </UButton>
          </div>
          
          <!-- 结果区域 -->
          <div v-if="testResult" class="space-y-3">
            <!-- 统计信息 -->
            <div class="flex flex-wrap items-center gap-4 text-sm text-muted border-b pb-2">
              <span>
                {{ t("settings.webSearch.test.source") }} <strong>{{ testResult.source }}</strong>
              </span>
              <span>
                {{ t("settings.webSearch.test.mode") }} <strong>{{ testResult.processMode === 'rag' ? 'RAG' : t("settings.webSearch.processMode.truncateShort") }}</strong>
              </span>
              <span>
                {{ t("settings.webSearch.test.results") }} <strong>{{ testResult.results?.length || 0 }}</strong> {{ t("settings.webSearch.unit.item") }}
              </span>
              <span>
                {{ t("settings.webSearch.test.searchDuration") }} <strong>{{ (testResult.searchDuration / 1000).toFixed(2) }}</strong> {{ t("settings.webSearch.unit.second") }}
              </span>
              <span>
                {{ t("settings.webSearch.test.totalDuration") }} <strong>{{ (testResult.duration / 1000).toFixed(2) }}</strong> {{ t("settings.webSearch.unit.second") }}
              </span>
            </div>
            
            <!-- RAG 统计信息 -->
            <div v-if="testResult.ragStats" class="text-sm bg-blue-50 p-3 rounded space-y-2">
              <div class="flex flex-wrap items-center gap-4 text-blue-600">
                <span>
                  {{ t("settings.webSearch.test.rag.searchResults") }} <strong>{{ testResult.ragStats.searchResultCount }}</strong> {{ t("settings.webSearch.unit.url") }}
                </span>
                <span>
                  {{ t("settings.webSearch.test.rag.fetchSuccess") }} <strong>{{ testResult.ragStats.fetchSuccessCount }}</strong>
                </span>
                <span v-if="testResult.ragStats.fetchFailedCount > 0" class="text-orange-600">
                  {{ t("settings.webSearch.test.rag.fetchFailed") }} <strong>{{ testResult.ragStats.fetchFailedCount }}</strong>
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-4 text-blue-600">
                <span>
                  {{ t("settings.webSearch.test.rag.totalChunks") }} <strong>{{ testResult.ragStats.totalChunks }}</strong>
                </span>
                <span>
                  {{ t("settings.webSearch.test.rag.retrievedChunks") }} <strong>{{ testResult.ragStats.retrievedChunks }}</strong>
                </span>
                <span>
                  {{ t("settings.webSearch.test.rag.retrievedUrls") }} <strong>{{ testResult.ragStats.retrievedUrlCount }}</strong>
                </span>
                <span>
                  {{ t("settings.webSearch.test.rag.ragDuration") }} <strong>{{ (testResult.ragStats.ragDuration / 1000).toFixed(2) }}</strong> {{ t("settings.webSearch.unit.second") }}
                </span>
              </div>
            </div>
            
            <!-- 结果标签页 -->
            <UTabs :items="resultTabs" class="w-full">
              <template #search-results>
                <div class="max-h-[400px] overflow-auto space-y-4">
                  <UEmpty
                    v-if="!testResult.searchResults?.length"
                    description="暂无搜索结果"
                  />
                  <div
                    v-for="(item, index) in testResult.searchResults || []"
                    :key="index"
                    class="border border-default rounded-lg p-3 text-sm"
                  >
                    <div class="flex items-start gap-3 mb-1">
                      <div class="text-xs text-muted shrink-0 pt-0.5">{{ index + 1 }}.</div>
                      <div class="font-medium text-blue-600 flex-1">{{ item.title }}</div>
                    </div>
                    <div class="text-xs text-muted truncate" :title="item.url">{{ item.url }}</div>
                  </div>
                </div>
              </template>

              <template #processed-results>
                <div class="max-h-[400px] overflow-auto space-y-4">
                  <UEmpty
                    v-if="!testResult.results?.length"
                    description="暂无正文处理结果"
                  />
                  <div
                    v-for="(item, index) in testResult.results || []"
                    :key="index"
                    class="border border-default rounded-lg p-3 text-sm"
                  >
                    <div class="flex items-start justify-between gap-2 mb-1">
                      <div class="font-medium text-blue-600 flex-1">{{ item.title }}</div>
                      <div v-if="item.fetchDuration" class="text-xs text-muted shrink-0">
                        {{ (item.fetchDuration / 1000).toFixed(2) }}s
                      </div>
                    </div>
                    <div class="text-xs text-muted mb-2 truncate" :title="item.realUrl || item.url">
                      {{ item.realUrl || item.url }}
                    </div>
                    <div v-if="getResultMetaText(item)" class="text-xs text-muted mb-2">
                      {{ getResultMetaText(item) }}
                    </div>
                    <div class="text-default whitespace-pre-wrap text-xs bg-elevated p-2 rounded">{{ item.content }}</div>
                    <div v-if="!item.fetchSuccess" class="text-xs text-red-500 mt-1">
                      {{ t("settings.webSearch.test.rag.fetchFailed") }} {{ item.fetchError }}
                    </div>
                    <div class="mt-2 flex justify-end">
                      <UButton
                        v-if="item.debugRawHtmlToken"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        :loading="getRawHtmlState(getTestResultKey(item, index)).loading"
                        @click="toggleRawHtml(item, index)"
                      >
                        {{ isRawHtmlOpen(getTestResultKey(item, index)) ? '收起原始内容' : '查看原始内容' }}
                      </UButton>
                    </div>
                    <div
                      v-if="isRawHtmlOpen(getTestResultKey(item, index))"
                      class="mt-2 rounded bg-elevated p-2"
                    >
                      <div v-if="getRawHtmlState(getTestResultKey(item, index)).error" class="text-xs text-error">
                        {{ getRawHtmlState(getTestResultKey(item, index)).error }}
                      </div>
                      <div v-else-if="getRawHtmlState(getTestResultKey(item, index)).loading" class="text-xs text-muted">
                        加载中...
                      </div>
                      <div v-else class="space-y-2">
                        <div
                          v-if="getRawHtmlState(getTestResultKey(item, index)).url"
                          class="text-[11px] text-muted break-all"
                        >
                          {{ getRawHtmlState(getTestResultKey(item, index)).url }}
                        </div>
                        <pre class="max-h-[240px] overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 font-mono">{{ getRawHtmlState(getTestResultKey(item, index)).html }}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </UTabs>
          </div>
          
          <!-- 错误信息 -->
          <div v-if="testError" class="text-red-500 text-sm p-3 bg-red-50 rounded">
            {{ testError }}
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, toRaw, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import UList from '@/components/UList.vue';
import UText from '@/components/UText.vue';
import ModelSelector from '@/components/ModelSelector.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useMyToast } from '@/composables/useMyToast';

const { confirm } = useConfirm();
const toast = useMyToast();
const { t } = useI18n();

// 类型定义
interface SearchProvider {
  id: string;
  type: 'builtin' | 'preset' | 'custom';
  name: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  presetId?: string;
  apiKey?: string;
  params?: Record<string, any>;
  customConfig?: CustomSearchConfig;
}

interface CustomSearchConfig {
  name: string;
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  parameterMapping: {
    queryField: string;
  };
  extraParams?: Record<string, any>;
  responseMapping: {
    resultsPath: string;
    titleField: string;
    urlField: string;
    contentField?: string;
  };
}

interface PresetTemplate {
  id: string;
  name: string;
  description: string;
  website?: string;
  configurableParams: Array<{
    key: string;
    label: string;
    type: 'number' | 'boolean' | 'select' | 'string';
    default: any;
    options?: Array<{ label: string; value: string }>;
    min?: number;
    max?: number;
    description?: string;
  }>;
}

interface BuiltinSearchEngineOption {
  name: string;
  categories: string[];
  enabled: boolean;
}

interface TestResultItem {
  title: string;
  url: string;
  realUrl?: string;
  content: string;
  truncated: boolean;
  byline?: string;
  siteName?: string;
  publishedDate?: string;
  fetchSuccess: boolean;
  fetchError?: string;
  fetchDuration?: number;
  debugFetchMode?: 'http' | 'browser' | 'api';
  debugRawHtmlToken?: string;
}

interface TestRawHtmlState {
  open: boolean;
  loading: boolean;
  html: string;
  error: string | null;
  url: string;
}

// 搜索服务提供者列表
const providers = ref<SearchProvider[]>([]);
const presetTemplates = ref<PresetTemplate[]>([]);
const builtinEngines = ref<BuiltinSearchEngineOption[]>([]);

// 当前选中的提供者
const selectedProviderId = ref<string>('builtin');
const showCommonConfigModal = ref(false);
const customNameInputRef = ref<{ inputRef?: HTMLInputElement } | null>(null);
const selectedProvider = computed(() => 
  providers.value.find(p => p.id === selectedProviderId.value)
);

// 当前选中的预设模板（用于预设服务配置）
const selectedPresetTemplate = computed(() => {
  if (selectedProvider.value?.type !== 'preset') return null;
  return presetTemplates.value.find(t => t.id === selectedProvider.value?.presetId);
});

// 选中服务的描述
const selectedProviderDescription = computed(() => {
  if (!selectedProvider.value) return '';
  if (selectedProvider.value.type === 'builtin') {
    return t('settings.webSearch.builtinDescription');
  }
  if (selectedProvider.value.type === 'preset' && selectedPresetTemplate.value) {
    return selectedPresetTemplate.value.description;
  }
  return '';
});

// 显示列表项类型
interface DisplayItem {
  id: string;
  name: string;
  type: 'builtin' | 'preset' | 'custom';
  presetId?: string;
  /** 预设服务是否已配置（有对应的 provider） */
  configured?: boolean;
  /** 是否启用 */
  enabled?: boolean;
  /** 是否已设置 API Key */
  hasApiKey?: boolean;
  /** 对应的 provider ID（仅预设服务且已配置时有值） */
  providerId?: string;
}

// 显示列表（内置 + 预设服务 + 自定义服务）
const displayList = computed<DisplayItem[]>(() => {
  const list: DisplayItem[] = [];
  
  // 1. 内置搜索
  const builtinProvider = providers.value.find(p => p.type === 'builtin');
  if (builtinProvider) {
    list.push({
      id: 'builtin',
      name: builtinProvider.name,
      type: 'builtin',
    });
  }
  
  // 2. 预设服务（始终显示所有预设）
  for (const preset of presetTemplates.value) {
    // 查找是否已有对应的 provider
    const existingProvider = providers.value.find(
      p => p.type === 'preset' && p.presetId === preset.id
    );
    
    if (existingProvider) {
      list.push({
        id: existingProvider.id,
        name: preset.name,
        type: 'preset',
        presetId: preset.id,
        configured: true,
        enabled: existingProvider.enabled,
        hasApiKey: !!existingProvider.apiKey,
        providerId: existingProvider.id,
      });
    } else {
      // 未添加的预设，使用特殊 ID 格式
      list.push({
        id: `preset:${preset.id}`,
        name: preset.name,
        type: 'preset',
        presetId: preset.id,
        configured: false,
        enabled: false,
        hasApiKey: false,
      });
    }
  }
  
  // 3. 自定义服务
  const customProviders = providers.value.filter(p => p.type === 'custom');
  for (const provider of customProviders) {
    list.push({
      id: provider.id,
      name: provider.name,
      type: 'custom',
      enabled: provider.enabled,
    });
  }
  
  return list;
});

const webSearchListSearchQuery = ref("");
const filteredDisplayList = computed(() => {
  const query = webSearchListSearchQuery.value.trim().toLowerCase();
  if (!query) return displayList.value;
  return displayList.value.filter(
    (item) =>
      item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query)
  );
});

// 处理选中服务
async function handleSelectProvider(id: string) {
  // 检查是否是未配置的预设服务
  if (id.startsWith('preset:')) {
    const presetId = id.replace('preset:', '');
    const preset = presetTemplates.value.find(t => t.id === presetId);
    if (!preset) return;
    
    // 自动创建 provider
    try {
      const newProvider = await window.ipc('webSearch:addProvider', {
        type: 'preset',
        name: preset.name,
        enabled: false,
        presetId: preset.id,
        apiKey: '',
        params: {}
      }) as SearchProvider;
      
      providers.value.push(newProvider);
      selectedProviderId.value = newProvider.id;
    } catch (error) {
      console.error('Failed to add preset provider', error);
    }
  } else {
    selectedProviderId.value = id;
  }
}

// 处理模式选项
const processModeOptions = computed(() => [
  { label: t('settings.webSearch.processMode.rag'), value: 'rag' },
  { label: t('settings.webSearch.processMode.truncate'), value: 'truncate' }
]);

const timeRangeOptions = computed(() => [
  { label: t('settings.webSearch.timeRange.none'), value: 'none' },
  { label: t('settings.webSearch.timeRange.day'), value: 'day' },
  { label: t('settings.webSearch.timeRange.month'), value: 'month' },
  { label: t('settings.webSearch.timeRange.year'), value: 'year' }
]);

const safeSearchOptions = computed(() => [
  { label: t('settings.webSearch.safeSearch.off'), value: 0 },
  { label: t('settings.webSearch.safeSearch.moderate'), value: 1 },
  { label: t('settings.webSearch.safeSearch.strict'), value: 2 }
]);

// 内置服务配置
const config = ref({
  selectedEngines: [] as string[],
  resultLimit: 10,
  timeRange: 'none' as 'none' | 'day' | 'month' | 'year',
  safeSearch: 0 as 0 | 1 | 2,
  searchTimeout: 15,
  fetchTimeout: 15,
  pagePoolSize: 5,
  processMode: 'rag' as 'rag' | 'truncate',
  embeddingModel: '__default__',
  embeddingDimension: null as number | null,
  ragTopN: 8,
  contentMaxLength: 2000 as number | null
});

// 输入框值（用于处理空值）
const contentMaxLengthInput = ref<number | string>(2000);
const embeddingDimensionInput = ref<number | string>('');

// 预设/自定义服务配置
const providerApiKey = ref('');
const providerParams = ref<Record<string, any>>({});
const customConfig = ref<CustomSearchConfig>({
  name: '',
  method: 'POST',
  url: '',
  headers: {},
  parameterMapping: { queryField: 'query' },
  extraParams: {},
  responseMapping: {
    resultsPath: 'results',
    titleField: 'title',
    urlField: 'url',
    contentField: ''
  }
});
const extraParamsJson = ref('{}');
const headersJson = ref('{}');

// 测试相关状态
const showTestModal = ref(false);
const testQuery = ref('');
const isTestLoading = ref(false);
const testResult = ref<any>(null);
const testError = ref<string | null>(null);
const rawHtmlStates = ref<Record<string, TestRawHtmlState>>({});

// 结果标签页配置
const resultTabs = computed(() => [
  { label: t('settings.webSearch.test.resultsTab'), slot: 'search-results' as const },
  { label: '正文处理结果', slot: 'processed-results' as const }
]);

const builtinEngineSelectItems = computed(() => {
  const selected = new Set(config.value.selectedEngines);
  const lockLastSelected = selected.size <= 1;
  return builtinEngines.value.map((engine) => ({
    name: engine.name,
    disabled: lockLastSelected && selected.has(engine.name)
  }));
});

// 加载数据
async function loadData() {
  try {
    const [providerList, presetList, configData, builtinEnginesData] = await Promise.all([
      window.ipc('webSearch:listProviders'),
      window.ipc('webSearch:listPresets'),
      window.ipc('webSearch:getConfig'),
      window.ipc('webSearch:listBuiltinEngines').catch(() => [])
    ]);
    
    providers.value = providerList as SearchProvider[];
    presetTemplates.value = presetList as PresetTemplate[];
    builtinEngines.value = (builtinEnginesData as BuiltinSearchEngineOption[]) ?? [];
    const selectedEngines = Array.isArray(configData.selectedEngines)
      ? configData.selectedEngines.filter((name: unknown): name is string => typeof name === 'string')
      : [];
    
    config.value = {
      selectedEngines,
      resultLimit: configData.resultLimit ?? 10,
      timeRange: configData.timeRange ?? 'none',
      safeSearch: configData.safeSearch ?? 0,
      searchTimeout: configData.searchTimeout ?? 15,
      fetchTimeout: configData.fetchTimeout ?? 15,
      pagePoolSize: configData.pagePoolSize ?? 5,
      processMode: configData.processMode ?? 'rag',
      embeddingModel: configData.embeddingModel ?? '__default__',
      embeddingDimension: configData.embeddingDimension ?? null,
      ragTopN: configData.ragTopN ?? 8,
      contentMaxLength: configData.contentMaxLength ?? 2000
    };

    contentMaxLengthInput.value = config.value.contentMaxLength ?? '';
    embeddingDimensionInput.value = config.value.embeddingDimension ?? '';
  } catch (error) {
    console.error('Failed to load web search data', error);
  }
}

// 加载选中 provider 的配置
function loadProviderConfig() {
  const provider = selectedProvider.value;
  if (!provider) return;
  
  providerApiKey.value = provider.apiKey || '';
  providerParams.value = { ...(provider.params || {}) };
  
  if (provider.type === 'custom' && provider.customConfig) {
    customConfig.value = { ...provider.customConfig };
    extraParamsJson.value = JSON.stringify(provider.customConfig.extraParams || {}, null, 2);
    headersJson.value = JSON.stringify(provider.customConfig.headers || {}, null, 2);
  }
}

// 监听选中 provider 变化
watch(selectedProviderId, () => {
  loadProviderConfig();
});

// 保存内置服务配置
async function saveConfig() {
  try {
    const configToSave = toRaw(config.value);
    await window.ipc('webSearch:setConfig', configToSave);
  } catch (error) {
    console.error('Failed to save web search config', error);
  }
}

// 保存 provider 配置（API Key 和参数）
async function saveProvider() {
  const provider = selectedProvider.value;
  if (!provider || provider.type === 'builtin') return;
  
  try {
    const updated = await window.ipc('webSearch:updateProvider', {
      id: provider.id,
      data: {
        apiKey: providerApiKey.value,
        params: toRaw(providerParams.value)
      }
    }) as SearchProvider | undefined;
    
    // 更新本地列表
    if (updated) {
      const index = providers.value.findIndex(p => p.id === provider.id);
      if (index !== -1) {
        providers.value[index] = updated;
      }
    }
  } catch (error) {
    console.error('Failed to save provider', error);
  }
}

// 处理启用/禁用切换
async function handleEnableToggle(enabled: boolean) {
  const provider = selectedProvider.value;
  if (!provider || provider.type === 'builtin') return;
  
  // 开启时校验必填项
  if (enabled) {
    if (provider.type === 'preset') {
      // 预设服务：必填 API Key
      if (!providerApiKey.value?.trim()) {
        toast.error({ title: t('settings.webSearch.fillApiKeyFirst') });
        return;
      }
    } else if (provider.type === 'custom') {
      // 自定义服务：必填 请求 URL、关键词字段名、结果数组路径、URL 字段
      const config = customConfig.value;
      const errors: string[] = [];
      if (!config.url?.trim()) errors.push(t('settings.webSearch.field.requestUrl'));
      if (!config.parameterMapping?.queryField?.trim()) errors.push(t('settings.webSearch.field.queryField'));
      if (!config.responseMapping.resultsPath?.trim()) errors.push(t('settings.webSearch.field.resultsPath'));
      if (!config.responseMapping.urlField?.trim()) errors.push(t('settings.webSearch.field.urlField'));
      
      if (errors.length > 0) {
        toast.error({ title: t('settings.webSearch.fillRequiredFields', { fields: errors.join(t('settings.webSearch.listSeparator')) }) });
        return;
      }
    }
  }
  
  try {
    const updated = await window.ipc('webSearch:updateProvider', {
      id: provider.id,
      data: { enabled }
    }) as SearchProvider | undefined;
    
    // 更新本地列表
    if (updated) {
      const index = providers.value.findIndex(p => p.id === provider.id);
      if (index !== -1) {
        providers.value[index] = updated;
      }
    }
  } catch (error) {
    console.error('Failed to toggle provider enabled', error);
  }
}

// 保存自定义 provider 配置
async function saveCustomProvider() {
  const provider = selectedProvider.value;
  if (!provider || provider.type !== 'custom') return;
  
  try {
    const updated = await window.ipc('webSearch:updateProvider', {
      id: provider.id,
      data: {
        name: customConfig.value.name,
        customConfig: toRaw(customConfig.value)
      }
    }) as SearchProvider | undefined;
    
    // 更新本地列表
    if (updated) {
      const index = providers.value.findIndex(p => p.id === provider.id);
      if (index !== -1) {
        providers.value[index] = updated;
      }
    }
  } catch (error) {
    console.error('Failed to save custom provider', error);
  }
}

// 防抖保存
let saveConfigTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveConfig() {
  if (saveConfigTimer) clearTimeout(saveConfigTimer);
  saveConfigTimer = setTimeout(saveConfig, 300);
}

let saveProviderTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveProvider() {
  if (saveProviderTimer) clearTimeout(saveProviderTimer);
  saveProviderTimer = setTimeout(saveProvider, 300);
}

let saveCustomProviderTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveCustomProvider() {
  if (saveCustomProviderTimer) clearTimeout(saveCustomProviderTimer);
  saveCustomProviderTimer = setTimeout(saveCustomProvider, 300);
}

function handleBuiltinEnginesChange(value: unknown) {
  const next = Array.isArray(value)
    ? Array.from(
      new Set(
        value
          .filter((name): name is string => typeof name === 'string')
          .map(name => name.trim())
          .filter(Boolean)
      )
    )
    : [];

  if (next.length === 0) {
    toast.error({ title: t('settings.webSearch.selectAtLeastOneEngine') });
    return;
  }

  config.value.selectedEngines = next;
  debouncedSaveConfig();
}

// 处理内容截断长度变化
function handleContentMaxLengthChange(value: number | string) {
  if (value === '' || value === null || value === undefined) {
    config.value.contentMaxLength = null;
  } else {
    const num = Number(value);
    config.value.contentMaxLength = isNaN(num) ? null : Math.max(500, num);
  }
  debouncedSaveConfig();
}

// 处理嵌入模型变化
function handleEmbeddingModelChange() {
  debouncedSaveConfig();
}

// 处理嵌入维度变化
function handleEmbeddingDimensionChange(value: number | string) {
  if (value === '' || value === null || value === undefined) {
    config.value.embeddingDimension = null;
  } else {
    const num = Number(value);
    config.value.embeddingDimension = isNaN(num) ? null : Math.max(1, num);
  }
  debouncedSaveConfig();
}

// 处理参数变化
function handleParamChange(key: string, value: any) {
  providerParams.value[key] = value;
  debouncedSaveProvider();
}

// 处理额外参数变化
function handleExtraParamsChange(value: string) {
  try {
    customConfig.value.extraParams = JSON.parse(value);
    debouncedSaveCustomProvider();
  } catch {
    // 无效 JSON，不保存
  }
}

// 处理请求头变化
function handleHeadersChange(value: string) {
  try {
    customConfig.value.headers = JSON.parse(value);
    debouncedSaveCustomProvider();
  } catch {
    // 无效 JSON，不保存
  }
}

// 添加自定义服务
async function handleAddCustom() {
  try {
    const newProvider = await window.ipc('webSearch:addProvider', {
      type: 'custom',
      name: t('settings.webSearch.customDefaultName'),
      enabled: false,
      customConfig: {
        name: t('settings.webSearch.customDefaultName'),
        method: 'POST',
        url: '',
        headers: {},
        parameterMapping: { queryField: 'query' },
        responseMapping: {
          resultsPath: 'results',
          titleField: 'title',
          urlField: 'url'
        }
      }
    }) as SearchProvider;
    
    providers.value.push(newProvider);
    selectedProviderId.value = newProvider.id;
    
    // 聚焦名称输入框
    nextTick(() => {
      customNameInputRef.value?.inputRef?.focus();
    });
  } catch (error) {
    console.error('Failed to add custom provider', error);
  }
}

// 删除 provider（只有自定义服务允许删除）
async function handleDeleteProvider() {
  const provider = selectedProvider.value;
  if (!provider || provider.type !== 'custom') return;
  
  const confirmed = await confirm({
    title: t('settings.webSearch.deleteConfirmTitle'),
    content: t('settings.webSearch.deleteConfirmContent', { name: provider.name }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    confirmColor: 'error',
    confirmIcon: 'i-lucide-trash-2'
  });
  
  if (!confirmed) return;
  
  try {
    await window.ipc('webSearch:deleteProvider', { id: provider.id });
    providers.value = providers.value.filter(p => p.id !== provider.id);
    selectedProviderId.value = 'builtin';
  } catch (error) {
    console.error('Failed to delete provider', error);
  }
}

// 监听 contentMaxLength 变化，同步到输入框
watch(() => config.value.contentMaxLength, (val) => {
  contentMaxLengthInput.value = val ?? '';
});

// 监听 embeddingDimension 变化，同步到输入框
watch(() => config.value.embeddingDimension, (val) => {
  embeddingDimensionInput.value = val ?? '';
});

// 执行测试
async function runTest() {
  if (!testQuery.value.trim() || isTestLoading.value) return;
  
  isTestLoading.value = true;
  testResult.value = null;
  testError.value = null;
  rawHtmlStates.value = {};
  
  try {
    const result = await window.ipc('webSearch:test', { 
      query: testQuery.value.trim(),
      providerId: selectedProviderId.value
    }) as any;
    
    if (result.success) {
      testResult.value = result;
    } else {
      testError.value = result.error || t('settings.webSearch.test.searchFailed');
    }
  } catch (error) {
    testError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isTestLoading.value = false;
  }
}

function getTestResultKey(item: TestResultItem, index: number): string {
  return item.debugRawHtmlToken || `${index}:${item.realUrl || item.url}`;
}

function formatFetchMode(mode?: 'http' | 'browser' | 'api'): string {
  if (mode === 'http') return 'fetch';
  if (mode === 'browser') return 'browser';
  if (mode === 'api') return 'api';
  return '';
}

function getResultMetaText(item: TestResultItem): string {
  return [
    item.siteName,
    item.byline,
    formatFetchMode(item.debugFetchMode),
    item.publishedDate,
  ].filter(Boolean).join(' · ');
}

function getRawHtmlState(key: string): TestRawHtmlState {
  return rawHtmlStates.value[key] || {
    open: false,
    loading: false,
    html: '',
    error: null,
    url: '',
  };
}

function isRawHtmlOpen(key: string): boolean {
  return !!rawHtmlStates.value[key]?.open;
}

async function toggleRawHtml(item: TestResultItem, index: number) {
  const key = getTestResultKey(item, index);
  const current = rawHtmlStates.value[key];

  if (current?.open) {
    rawHtmlStates.value[key] = {
      ...current,
      open: false,
    };
    return;
  }

  if (!item.debugRawHtmlToken) {
    return;
  }

  if (current?.html) {
    rawHtmlStates.value[key] = {
      ...current,
      open: true,
    };
    return;
  }

  rawHtmlStates.value[key] = {
    open: true,
    loading: true,
    html: '',
    error: null,
    url: '',
  };

  try {
    const result = await window.ipc('webSearch:getTestRawHtml', {
      token: item.debugRawHtmlToken,
    }) as { ok: boolean; html?: string; url?: string; error?: string };

    if (!result.ok) {
      rawHtmlStates.value[key] = {
        open: true,
        loading: false,
        html: '',
        error: result.error || '加载失败',
        url: '',
      };
      return;
    }

    rawHtmlStates.value[key] = {
      open: true,
      loading: false,
      html: result.html || '',
      error: null,
      url: result.url || '',
    };
  } catch (error) {
    rawHtmlStates.value[key] = {
      open: true,
      loading: false,
      html: '',
      error: error instanceof Error ? error.message : String(error),
      url: '',
    };
  }
}

onMounted(() => {
  loadData();
});
</script>
