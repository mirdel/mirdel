<template>
  <template v-if="!node"> </template>

  <!-- 布局 -->
  <div
    v-else-if="node.type === 'View'"
    :class="viewClass(node.props)"
    :style="layoutStyle(node.props)"
    :role="node.props?.onClick ? 'button' : undefined"
    @click="handleClick(node.props?.onClick)"
  >
    <AppletSchemaRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :applet-state="appletState"
      :streaming-paths="streamingPaths"
      :applet-id="appletId"
      :dispatch="dispatch"
    />
  </div>
  <div
    v-else-if="node.type === 'Row'"
    :class="['flex flex-row', layoutClass(node.props), className(node.props)]"
    :style="layoutStyle(node.props)"
    :role="node.props?.onClick ? 'button' : undefined"
    @click="handleClick(node.props?.onClick)"
  >
    <AppletSchemaRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :applet-state="appletState"
      :streaming-paths="streamingPaths"
      :applet-id="appletId"
      :dispatch="dispatch"
    />
  </div>
  <div
    v-else-if="node.type === 'Col'"
    :class="['flex flex-col', layoutClass(node.props), className(node.props)]"
    :style="layoutStyle(node.props)"
    :role="node.props?.onClick ? 'button' : undefined"
    @click="handleClick(node.props?.onClick)"
  >
    <AppletSchemaRenderer
      v-for="(child, i) in node.children"
      :key="i"
      :node="child"
      :applet-state="appletState"
      :streaming-paths="streamingPaths"
      :applet-id="appletId"
      :dispatch="dispatch"
    />
  </div>
  <UModal
    v-else-if="node.type === 'Modal'"
    :open="!!(node.props?.open as boolean)"
    :title="(node.props?.title as string) || undefined"
    :description="(node.props?.description as string) || undefined"
    :overlay="node.props?.overlay !== false"
    :dismissible="node.props?.dismissible !== false"
    :close="node.props?.close !== false"
    :fullscreen="!!(node.props?.fullscreen as boolean)"
    @update:open="(v: boolean) => handleAction(node.props?.onOpenChange, { open: !!v })"
  >
    <template #body>
      <div :class="className(node.props)">
        <AppletSchemaRenderer
          v-for="(child, i) in node.children"
          :key="i"
          :node="child"
          :applet-state="appletState"
          :streaming-paths="streamingPaths"
          :applet-id="appletId"
          :dispatch="dispatch"
        />
      </div>
    </template>
  </UModal>
  <UPopover
    v-else-if="node.type === 'Popover'"
    :open="optionalBoolean(node.props?.open)"
    :mode="(node.props?.mode as string) || undefined"
    :content="popoverContent(node.props)"
    :disabled="!!(node.props?.disabled as boolean)"
    :delay-duration="integerAttr(node.props?.delayDuration)"
    @update:open="(v: boolean) => handleAction(node.props?.onOpenChange, { open: !!v })"
  >
    <UButton
      :color="uiColor(node.props?.triggerColor)"
      :variant="(node.props?.triggerVariant as string) || 'ghost'"
      :size="(node.props?.triggerSize as string) || 'sm'"
      :icon="popoverTriggerIcon(node.props)"
      :square="popoverTriggerSquare(node.props)"
    >
      {{ popoverTriggerLabel(node.props) ?? "" }}
    </UButton>
    <template #content>
      <div :class="className(node.props)">
        <AppletSchemaRenderer
          v-for="(child, i) in node.children"
          :key="i"
          :node="child"
          :applet-state="appletState"
          :streaming-paths="streamingPaths"
          :applet-id="appletId"
          :dispatch="dispatch"
        />
      </div>
    </template>
  </UPopover>
  <UDropdownMenu
    v-else-if="node.type === 'DropdownMenu'"
    :items="dropdownMenuItems(node.props)"
    :size="(node.props?.size as string) || undefined"
    :content="dropdownContent(node.props)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="className(node.props)"
    @update:open="(v: boolean) => handleAction(node.props?.onOpenChange, { open: !!v })"
  >
    <template v-if="Array.isArray(node.children) && node.children.length > 0">
      <AppletSchemaRenderer
        v-for="(child, i) in node.children"
        :key="i"
        :node="child"
        :applet-state="appletState"
        :streaming-paths="streamingPaths"
        :applet-id="appletId"
        :dispatch="dispatch"
      />
    </template>
    <UButton
      v-else
      :color="uiColor(node.props?.triggerColor)"
      :variant="(node.props?.triggerVariant as string) || 'ghost'"
      :size="(node.props?.triggerSize as string) || (node.props?.size as string) || 'sm'"
      :icon="dropdownTriggerIcon(node.props)"
      :square="dropdownTriggerSquare(node.props)"
    >
      {{ dropdownTriggerLabel(node.props) ?? "" }}
    </UButton>
  </UDropdownMenu>
  <UCalendar
    v-else-if="node.type === 'Calendar'"
    :model-value="calendarModelValue(node.props)"
    :range="!!(node.props?.range as boolean)"
    :multiple="!!(node.props?.multiple as boolean)"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) || undefined"
    :size="(node.props?.size as string) || undefined"
    :disabled="!!(node.props?.disabled as boolean)"
    :min-value="protocolDateToUiValue(node.props?.minValue)"
    :max-value="protocolDateToUiValue(node.props?.maxValue)"
    :placeholder="protocolDateToUiValue(node.props?.placeholder)"
    :month-controls="optionalBoolean(node.props?.monthControls)"
    :year-controls="optionalBoolean(node.props?.yearControls)"
    :week-numbers="optionalBoolean(node.props?.weekNumbers)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleCalendarChange(node.props, v)"
  />
  <UInputDate
    v-else-if="node.type === 'DatePicker'"
    :model-value="datePickerModelValue(node.props)"
    :range="!!(node.props?.range as boolean)"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) || 'outline'"
    :size="(node.props?.size as string) || 'md'"
    :disabled="!!(node.props?.disabled as boolean)"
    :readonly="!!(node.props?.readonly as boolean)"
    :autofocus="!!(node.props?.autofocus as boolean)"
    :min-value="protocolDateToUiValue(node.props?.minValue)"
    :max-value="protocolDateToUiValue(node.props?.maxValue)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleDatePickerChange(node.props, v)"
    @blur="() => handleDatePickerBlur(node.props)"
  />
  <div
    v-else-if="node.type === 'InputTime' && !!(node.props?.range as boolean)"
    :class="['flex items-center gap-2', className(node.props)]"
  >
    <UInputTime
      :model-value="timeRangePartModelValue(node.props, 'start')"
      :color="uiColor(node.props?.color)"
      :variant="(node.props?.variant as string) || 'outline'"
      :size="(node.props?.size as string) || 'md'"
      :disabled="!!(node.props?.disabled as boolean)"
      :readonly="!!(node.props?.readonly as boolean)"
      :autofocus="!!(node.props?.autofocus as boolean)"
      :min-value="protocolTimeToUiValue(node.props?.minValue)"
      :max-value="protocolTimeToUiValue(node.props?.maxValue)"
      :placeholder="protocolTimeToUiValue(node.props?.placeholder)"
      :hour-cycle="timeHourCycle(node.props?.hourCycle)"
      :granularity="timeGranularity(node.props?.granularity)"
      class="flex-1 min-w-0"
      @update:model-value="(v: unknown) => handleTimeInputRangePartChange(node.props, 'start', v)"
      @blur="() => handleTimeInputBlur(node.props)"
    />
    <UIcon name="i-lucide-minus" class="size-4 shrink-0 text-muted" />
    <UInputTime
      :model-value="timeRangePartModelValue(node.props, 'end')"
      :color="uiColor(node.props?.color)"
      :variant="(node.props?.variant as string) || 'outline'"
      :size="(node.props?.size as string) || 'md'"
      :disabled="!!(node.props?.disabled as boolean)"
      :readonly="!!(node.props?.readonly as boolean)"
      :autofocus="false"
      :min-value="protocolTimeToUiValue(node.props?.minValue)"
      :max-value="protocolTimeToUiValue(node.props?.maxValue)"
      :placeholder="protocolTimeToUiValue(node.props?.placeholder)"
      :hour-cycle="timeHourCycle(node.props?.hourCycle)"
      :granularity="timeGranularity(node.props?.granularity)"
      class="flex-1 min-w-0"
      @update:model-value="(v: unknown) => handleTimeInputRangePartChange(node.props, 'end', v)"
      @blur="() => handleTimeInputBlur(node.props)"
    />
  </div>
  <UInputTime
    v-else-if="node.type === 'InputTime'"
    :model-value="timeInputModelValue(node.props)"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) || 'outline'"
    :size="(node.props?.size as string) || 'md'"
    :disabled="!!(node.props?.disabled as boolean)"
    :readonly="!!(node.props?.readonly as boolean)"
    :autofocus="!!(node.props?.autofocus as boolean)"
    :min-value="protocolTimeToUiValue(node.props?.minValue)"
    :max-value="protocolTimeToUiValue(node.props?.maxValue)"
    :placeholder="protocolTimeToUiValue(node.props?.placeholder)"
    :hour-cycle="timeHourCycle(node.props?.hourCycle)"
    :granularity="timeGranularity(node.props?.granularity)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleTimeInputChange(node.props, v)"
    @blur="() => handleTimeInputBlur(node.props)"
  />
  <UTable
    v-else-if="node.type === 'Table'"
    :data="tableRows(node.props)"
    :columns="tableColumns(node.props)"
    :loading="!!(node.props?.loading as boolean)"
    :empty="tableEmpty(node.props)"
    :sticky="tableSticky(node.props)"
    :sorting="tableSorting(node.props)"
    :class="className(node.props)"
    :on-select="(e: Event, row: unknown) => handleTableRowSelect(node.props, e, row)"
    @update:sorting="(v: unknown) => handleTableSortingChange(node.props, v)"
  />

  <!-- 叶子 -->
  <component
    v-else-if="node.type === 'Text'"
    :is="textTag(node.props)"
    :class="[textClass(node.props), className(node.props)]"
  >
    {{ node.props?.value ?? '' }}
  </component>
  <MarkdownBlock
    v-else-if="node.type === 'Markdown'"
    :content="(node.props?.value as string) || ''"
    :is-streaming="isMarkdownStreaming(node.props)"
    :class="className(node.props)"
  />
  <UInput
    v-else-if="node.type === 'Input'"
    :model-value="(node.props?.value as string) ?? ''"
    :name="(node.props?.name as string) || undefined"
    :required="!!(node.props?.required as boolean)"
    :placeholder="(node.props?.placeholder as string) ?? ''"
    :type="(node.props?.type as string) ?? 'text'"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) ?? 'outline'"
    :size="(node.props?.size as string) ?? 'md'"
    :icon="normalizeIcon(node.props?.icon)"
    :leading-icon="normalizeIcon(node.props?.leadingIcon)"
    :trailing-icon="normalizeIcon(node.props?.trailingIcon)"
    :loading="!!(node.props?.loading as boolean)"
    :autofocus="!!(node.props?.autofocus as boolean)"
    :autocomplete="(node.props?.autocomplete as string) || undefined"
    :readonly="!!(node.props?.readonly as boolean)"
    :min="numberishValue(node.props?.min)"
    :max="numberishValue(node.props?.max)"
    :step="numberishValue(node.props?.step)"
    :pattern="(node.props?.pattern as string) || undefined"
    :minlength="integerAttr(node.props?.minlength)"
    :maxlength="integerAttr(node.props?.maxlength)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="inputClass(node.props)"
    @update:model-value="(v: string | number) => handleAction(node.props?.onChange, { value: String(v) })"
    @blur="(e: FocusEvent) => handleTextInputBlur(node.props, e)"
  />
  <UTextarea
    v-else-if="node.type === 'Textarea'"
    :model-value="(node.props?.value as string) ?? ''"
    :name="(node.props?.name as string) || undefined"
    :required="!!(node.props?.required as boolean)"
    :placeholder="(node.props?.placeholder as string) ?? ''"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) ?? 'outline'"
    :size="(node.props?.size as string) ?? 'md'"
    :icon="normalizeIcon(node.props?.icon)"
    :leading-icon="normalizeIcon(node.props?.leadingIcon)"
    :trailing-icon="normalizeIcon(node.props?.trailingIcon)"
    :loading="!!(node.props?.loading as boolean)"
    :autofocus="!!(node.props?.autofocus as boolean)"
    :autocomplete="(node.props?.autocomplete as string) || undefined"
    :rows="textareaRows(node.props)"
    :maxrows="integerAttr(node.props?.maxrows)"
    :autoresize="!!(node.props?.autoresize as boolean)"
    :readonly="!!(node.props?.readonly as boolean)"
    :minlength="integerAttr(node.props?.minlength)"
    :maxlength="integerAttr(node.props?.maxlength)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="textareaClass(node.props)"
    @update:model-value="(v: string | number) => handleAction(node.props?.onChange, { value: String(v) })"
    @blur="(e: FocusEvent) => handleTextInputBlur(node.props, e)"
  />
  <USelectMenu
    v-else-if="node.type === 'Select'"
    :model-value="selectModelValue(node.props)"
    :items="selectItems(node.props)"
    value-key="value"
    label-key="label"
    :name="(node.props?.name as string) || undefined"
    :required="!!(node.props?.required as boolean)"
    :search-input="selectSearchInput(node.props)"
    :clear="!!(node.props?.clear as boolean)"
    :placeholder="(node.props?.placeholder as string) ?? ''"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) ?? 'outline'"
    :size="(node.props?.size as string) ?? 'md'"
    :leading-icon="normalizeIcon(node.props?.leadingIcon)"
    :trailing-icon="normalizeIcon(node.props?.trailingIcon)"
    :selected-icon="normalizeIcon(node.props?.selectedIcon)"
    :loading="!!(node.props?.loading as boolean)"
    :multiple="!!(node.props?.multiple as boolean)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleSelectChange(node.props, v)"
    @blur="() => handleSelectBlur(node.props)"
  />
  <UButton
    v-else-if="node.type === 'Button'"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) ?? 'solid'"
    :size="(node.props?.size as string) ?? 'md'"
    :icon="normalizeIcon(node.props?.icon)"
    :leading-icon="normalizeIcon(node.props?.leadingIcon)"
    :trailing-icon="normalizeIcon(node.props?.trailingIcon)"
    :square="!!(node.props?.square as boolean)"
    :loading="!!(node.props?.loading as boolean)"
    :block="!!(node.props?.block as boolean)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="className(node.props)"
    @click="handleClick(node.props?.onClick)"
  >
    {{ (node.props?.text as string) ?? '' }}
  </UButton>
  <USwitch
    v-else-if="node.type === 'Switch'"
    :model-value="!!(node.props?.checked)"
    :label="(node.props?.label as string) || undefined"
    :description="(node.props?.description as string) || undefined"
    :color="uiColor(node.props?.color)"
    :size="(node.props?.size as string) || undefined"
    :loading="!!(node.props?.loading as boolean)"
    :checked-icon="normalizeIcon(node.props?.checkedIcon)"
    :unchecked-icon="normalizeIcon(node.props?.uncheckedIcon)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleAction(node.props?.onChange, { value: !!v })"
  />
  <UCheckbox
    v-else-if="node.type === 'Checkbox'"
    :model-value="!!(node.props?.checked)"
    :label="(node.props?.label as string) || undefined"
    :description="(node.props?.description as string) || undefined"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) || undefined"
    :size="(node.props?.size as string) || undefined"
    :indicator="(node.props?.indicator as string) || undefined"
    :icon="normalizeIcon(node.props?.icon)"
    :indeterminate-icon="normalizeIcon(node.props?.indeterminateIcon)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleAction(node.props?.onChange, { value: !!v })"
  />
  <UProgress
    v-else-if="node.type === 'Progress'"
    :model-value="progressValue(node.props?.value)"
    :max="progressMax(node.props?.max)"
    :status="!!(node.props?.status as boolean)"
    :color="uiColor(node.props?.color)"
    :size="(node.props?.size as string) || undefined"
    :orientation="(node.props?.orientation as string) || undefined"
    :inverted="!!(node.props?.inverted as boolean)"
    :animation="(node.props?.animation as string) || undefined"
    :class="className(node.props)"
  />
  <UAlert
    v-else-if="node.type === 'Alert'"
    :title="(node.props?.title as string) || undefined"
    :description="(node.props?.description as string) || undefined"
    :icon="normalizeIcon(node.props?.icon)"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) || undefined"
    :class="className(node.props)"
  />
  <URadioGroup
    v-else-if="node.type === 'RadioGroup'"
    :model-value="String(node.props?.value ?? '')"
    :items="radioItems(node.props)"
    value-key="value"
    label-key="label"
    description-key="description"
    :legend="(node.props?.legend as string) || undefined"
    :color="uiColor(node.props?.color)"
    :size="(node.props?.size as string) || undefined"
    :variant="(node.props?.variant as string) || undefined"
    :orientation="(node.props?.orientation as string) || undefined"
    :indicator="(node.props?.indicator as string) || undefined"
    :loop="node.props?.loop !== false"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleAction(node.props?.onChange, { value: v == null ? '' : String(v) })"
  />
  <UTabs
    v-else-if="node.type === 'Tabs'"
    :model-value="String(node.props?.value ?? '')"
    :items="tabsItems(node.props)"
    value-key="value"
    label-key="label"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) || undefined"
    :size="(node.props?.size as string) || undefined"
    :orientation="(node.props?.orientation as string) || undefined"
    :activation-mode="(node.props?.activationMode as string) || undefined"
    :content="node.props?.content !== false"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleAction(node.props?.onChange, { value: v == null ? '' : String(v) })"
  />
  <UAccordion
    v-else-if="node.type === 'Accordion'"
    :model-value="accordionModelValue(node.props)"
    :items="accordionItems(node.props)"
    value-key="value"
    label-key="label"
    :type="accordionType(node.props)"
    :collapsible="node.props?.collapsible !== false"
    :trailing-icon="normalizeIcon(node.props?.trailingIcon)"
    :disabled="!!(node.props?.disabled as boolean)"
    :class="className(node.props)"
    @update:model-value="(v: unknown) => handleAccordionChange(node.props, v)"
  />
  <UBadge
    v-else-if="node.type === 'Badge'"
    :label="(node.props?.label as string) || ''"
    :color="uiColor(node.props?.color)"
    :variant="(node.props?.variant as string) || undefined"
    :size="(node.props?.size as string) || undefined"
    :icon="normalizeIcon(node.props?.icon)"
    :leading-icon="normalizeIcon(node.props?.leadingIcon)"
    :trailing-icon="normalizeIcon(node.props?.trailingIcon)"
    :square="!!(node.props?.square as boolean)"
    :class="className(node.props)"
  />
  <USeparator
    v-else-if="node.type === 'Separator'"
    :label="(node.props?.label as string) || undefined"
    :icon="normalizeIcon(node.props?.icon)"
    :color="uiColor(node.props?.color)"
    :size="(node.props?.size as string) || undefined"
    :type="(node.props?.type as string) || undefined"
    :orientation="(node.props?.orientation as string) || undefined"
    :class="className(node.props)"
  />
  <UTooltip
    v-else-if="node.type === 'Tooltip'"
    :text="tooltipText(node.props?.text)"
    :content="tooltipContent(node.props)"
    :disabled="!!(node.props?.disabled as boolean)"
    :delay-duration="integerAttr(node.props?.delayDuration)"
  >
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      :icon="tooltipTriggerIcon(node.props)"
      :square="tooltipTriggerSquare(node.props)"
      :class="className(node.props)"
    >
      {{ tooltipTriggerLabel(node.props) ?? "" }}
    </UButton>
  </UTooltip>
  <UIcon
    v-else-if="node.type === 'Icon'"
    :name="iconName(node.props?.name)"
    :size="iconSize(node.props?.size)"
    :class="className(node.props)"
  />
  <img
    v-else-if="node.type === 'Image'"
    :src="(node.props?.src as string) || ''"
    :alt="(node.props?.alt as string) || ''"
    :class="className(node.props)"
  />
</template>

<script setup lang="ts">
import MarkdownBlock from "@/components/MarkdownBlock.vue";
import { parseDate, parseTime, type DateValue, type Time as IntlTime } from "@internationalized/date";
import type { UINode } from "@mirdel/applet-core";

const props = defineProps<{
  node: UINode | null | undefined;
  appletState?: Record<string, unknown>;
  streamingPaths?: string[];
  appletId: string;
  dispatch: (appletId: string, action: unknown) => void;
}>();

/** default 映射为 primary，其余透传 */
function uiColor(color: unknown): string | undefined {
  if (color === "default" || !color) return "primary";
  return color as string;
}

/** 将 lucide 图标名转为 i-lucide-xxx 格式，通用方法 */
function normalizeIcon(icon: unknown): string | undefined {
  if (!icon || typeof icon !== "string") return undefined;
  const s = icon.trim();
  if (!s) return undefined;
  if (s.startsWith("i-") || s.includes(":")) return s;
  return `i-lucide-${s}`;
}

function iconName(name: unknown): string {
  if (typeof name !== "string") return "";
  const value = name.trim();
  if (!value) return "";
  if (value.startsWith("i-") || value.includes(":")) return value;
  return `i-lucide-${value}`;
}

function numberishValue(value: unknown): string | number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function integerAttr(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.trunc(n));
}

function iconSize(size: unknown): string | number | undefined {
  if (typeof size === "number") return size;
  if (typeof size !== "string") return undefined;
  const value = size.trim();
  return value || undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

const PROTOCOL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PROTOCOL_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/**
 * Applet 协议边界：
 * - 轻应用脚本层只读写 YYYY-MM-DD 字符串
 * - Renderer 内部才桥接为 Nuxt UI 所需的 DateValue
 */
function protocolDateToUiValue(value: unknown): DateValue | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!PROTOCOL_DATE_RE.test(s)) return undefined;
  try {
    return parseDate(s);
  } catch {
    return undefined;
  }
}

function uiValueToProtocolDate(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const toStringFn = (value as { toString?: () => string }).toString;
  if (typeof toStringFn !== "function") return undefined;
  const text = toStringFn.call(value);
  if (typeof text !== "string") return undefined;
  const normalized = text.trim();
  if (!PROTOCOL_DATE_RE.test(normalized)) return undefined;
  return normalized;
}

function protocolDateRangeToUiValue(
  p: Record<string, unknown> | undefined
): { start?: DateValue; end?: DateValue } | undefined {
  const raw = p?.rangeValue;
  if (!raw || typeof raw !== "object") return undefined;
  const start = protocolDateToUiValue((raw as Record<string, unknown>).start);
  const end = protocolDateToUiValue((raw as Record<string, unknown>).end);
  if (!start && !end) return undefined;
  return { start, end };
}

/**
 * Applet 协议边界：
 * - 轻应用脚本层只读写 HH:mm / HH:mm:ss 字符串
 * - Renderer 内部才桥接为 Nuxt UI 所需的 Time 对象
 */
function protocolTimeToUiValue(value: unknown): IntlTime | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!PROTOCOL_TIME_RE.test(s)) return undefined;
  try {
    return parseTime(s);
  } catch {
    return undefined;
  }
}

function uiValueToProtocolTime(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const toStringFn = (value as { toString?: () => string }).toString;
  if (typeof toStringFn !== "function") return undefined;
  const text = toStringFn.call(value);
  if (typeof text !== "string") return undefined;
  const normalized = text.trim();
  if (!PROTOCOL_TIME_RE.test(normalized)) return undefined;
  return normalized;
}

function className(p: Record<string, unknown> | undefined): string | undefined {
  const cls = p?.class;
  if (typeof cls !== "string") return undefined;
  const normalized = cls.trim();
  return normalized || undefined;
}

function readValueByPath(source: Record<string, unknown> | undefined, path: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  const parts = String(path || "")
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return undefined;
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isMarkdownStreaming(nodeProps: Record<string, unknown> | undefined): boolean {
  const markdownValue = typeof nodeProps?.value === "string" ? nodeProps.value : "";
  if (!markdownValue) return false;
  const state = props.appletState;
  const paths = Array.isArray(props.streamingPaths) ? props.streamingPaths : [];
  if (!state || paths.length === 0) return false;
  for (const path of paths) {
    const stateValue = readValueByPath(state, path);
    if (typeof stateValue === "string" && stateValue.length > 0 && stateValue === markdownValue) {
      return true;
    }
  }
  return false;
}

function textTag(p: Record<string, unknown> | undefined): "span" | "div" {
  if (!p || p.lineClamp == null) return "span";
  const n = Number(p.lineClamp);
  return n >= 1 && n <= 6 ? "div" : "span";
}

function textClass(p: Record<string, unknown> | undefined): string {
  if (!p) return "text-base";
  const c: string[] = [];
  if (p.size === "xs") c.push("text-xs");
  else if (p.size === "sm") c.push("text-sm");
  else if (p.size === "lg") c.push("text-lg");
  else if (p.size === "xl") c.push("text-xl");
  else c.push("text-base");
  if (p.color === "muted") c.push("text-muted");
  else if (p.color === "success") c.push("text-success");
  else if (p.color === "info") c.push("text-info");
  else if (p.color === "warning") c.push("text-warning");
  else if (p.color === "error") c.push("text-error");
  const n = Number(p.lineClamp);
  if (n === 1) c.push("line-clamp-1");
  else if (n === 2) c.push("line-clamp-2");
  else if (n === 3) c.push("line-clamp-3");
  else if (n === 4) c.push("line-clamp-4");
  else if (n === 5) c.push("line-clamp-5");
  else if (n === 6) c.push("line-clamp-6");
  if (p.bold) c.push("font-bold");
  if (p.italic) c.push("italic");
  if (p.strikethrough) c.push("line-through");
  if (p.underline) c.push("underline");
  return c.join(" ");
}

function sizeVal(v: number | string): string {
  return typeof v === "number" ? `${v}px` : String(v);
}

function layoutStyle(p: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!p) return undefined;
  const s: Record<string, string> = {};
  if (p.width != null) s.width = sizeVal(p.width as number | string);
  if (p.height != null) s.height = sizeVal(p.height as number | string);
  if (p.minWidth != null) s.minWidth = sizeVal(p.minWidth as number | string);
  if (p.maxWidth != null) s.maxWidth = sizeVal(p.maxWidth as number | string);
  if (p.minHeight != null) s.minHeight = sizeVal(p.minHeight as number | string);
  if (p.maxHeight != null) s.maxHeight = sizeVal(p.maxHeight as number | string);
  if (p.flex != null) s.flex = String(p.flex);
  if (p.gap != null) s.gap = sizeVal(p.gap as number | string);
  if (p.padding != null) {
    const pad = p.padding;
    if (Array.isArray(pad)) {
      const parts = pad.map((x) => (typeof x === "number" ? `${x}px` : String(x)));
      s.padding = parts.join(" ");
    } else {
      s.padding = typeof pad === "number" ? `${pad}px` : String(pad);
    }
  }
  if (Object.keys(s).length === 0) return undefined;
  return s;
}

function addLayoutDecorationClass(c: string[], p: Record<string, unknown>) {
  if (p.rounded === "sm") c.push("rounded-sm");
  else if (p.rounded === "md") c.push("rounded-md");
  else if (p.rounded === "lg") c.push("rounded-lg");
  else if (p.rounded === "xl") c.push("rounded-xl");

  if (p.shadow === "none") c.push("shadow-none");
  else if (p.shadow === "sm") c.push("shadow-sm");
  else if (p.shadow === "md") c.push("shadow-md");
  else if (p.shadow === "lg") c.push("shadow-lg");
  else if (p.shadow === "xl") c.push("shadow-xl");

  if (p.bgColor === "transparent") c.push("bg-transparent");
  else if (p.bgColor === "default") c.push("bg-default");
  else if (p.bgColor === "success") c.push("bg-success");
  else if (p.bgColor === "info") c.push("bg-info");
  else if (p.bgColor === "warning") c.push("bg-warning");
  else if (p.bgColor === "error") c.push("bg-error");

  if (p.border != null) {
    if (p.border === "none") {
      // no border
    } else if (p.border === "dashed") c.push("border border-dashed border-default");
    else if (p.border === "dotted") c.push("border border-dotted border-default");
    else c.push("border border-solid border-default");
  }
}

function layoutClass(p: Record<string, unknown> | undefined): string {
  if (!p) return "min-h-0 rounded-none items-start justify-start";
  const c: string[] = ["min-h-0"];
  if (p.visible === false) {
    c.push("hidden");
    return c.join(" ");
  }
  if (p.overflow === "hidden") c.push("overflow-hidden");
  else if (p.overflow === "auto") c.push("overflow-auto");

  if (p.justify === "center") c.push("justify-center");
  else if (p.justify === "end") c.push("justify-end");
  else if (p.justify === "space-between") c.push("justify-between");
  else if (p.justify === "space-around") c.push("justify-around");
  else c.push("justify-start");

  if (p.align === "center") c.push("items-center");
  else if (p.align === "end") c.push("items-end");
  else if (p.align === "stretch") c.push("items-stretch");
  else c.push("items-start");

  if (p.wrap) c.push("flex-wrap");

  if (p.rounded === "none" || p.rounded == null) c.push("rounded-none");
  addLayoutDecorationClass(c, p);
  return c.join(" ");
}

function viewClass(p: Record<string, unknown> | undefined): string {
  if (!p) return "";
  const c: string[] = [];
  if (p.visible === false) {
    c.push("hidden");
    return c.join(" ");
  }

  if (p.overflow === "hidden") c.push("overflow-hidden");
  else if (p.overflow === "auto") c.push("overflow-auto");

  if (p.justify != null || p.align != null || p.wrap) {
    c.push("flex", "flex-col");
    if (p.justify === "center") c.push("justify-center");
    else if (p.justify === "end") c.push("justify-end");
    else if (p.justify === "space-between") c.push("justify-between");
    else if (p.justify === "space-around") c.push("justify-around");
    else c.push("justify-start");

    if (p.align === "center") c.push("items-center");
    else if (p.align === "end") c.push("items-end");
    else if (p.align === "stretch") c.push("items-stretch");
    else c.push("items-start");

    if (p.wrap) c.push("flex-wrap");
  }

  addLayoutDecorationClass(c, p);

  const customClass = className(p);
  if (customClass) c.push(customClass);
  return c.join(" ");
}

function inputClass(p: Record<string, unknown> | undefined): string | undefined {
  const c: string[] = [];
  if (p?.block) c.push("w-full");
  const customClass = className(p);
  if (customClass) c.push(customClass);
  return c.length > 0 ? c.join(" ") : undefined;
}

function textareaRows(p: Record<string, unknown> | undefined): number {
  const rows = Number(p?.rows ?? 4);
  if (!Number.isFinite(rows)) return 4;
  return Math.max(2, rows);
}

function textareaClass(p: Record<string, unknown> | undefined): string | undefined {
  const c: string[] = [];
  if (p?.block) c.push("w-full");
  const customClass = className(p);
  if (customClass) c.push(customClass);
  return c.length > 0 ? c.join(" ") : undefined;
}

function selectItems(
  p: Record<string, unknown> | undefined
): Array<{ label: string; value: string; disabled?: boolean; description?: string; icon?: string }> {
  const raw = p?.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    label: String((item as any)?.label ?? ""),
    value: String((item as any)?.value ?? ""),
    disabled: !!(item as any)?.disabled,
    description: (item as any)?.description ? String((item as any).description) : undefined,
    icon: normalizeIcon((item as any)?.icon),
  }));
}

function radioItems(
  p: Record<string, unknown> | undefined
): Array<{ label: string; value: string; description?: string; disabled?: boolean }> {
  const raw = p?.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    label: String((item as any)?.label ?? ""),
    value: String((item as any)?.value ?? ""),
    description: (item as any)?.description ? String((item as any).description) : undefined,
    disabled: !!(item as any)?.disabled,
  }));
}

function tabsItems(
  p: Record<string, unknown> | undefined
): Array<{ label: string; value?: string; content?: string; icon?: string; disabled?: boolean }> {
  const raw = p?.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    label: String((item as any)?.label ?? ""),
    value: (item as any)?.value != null ? String((item as any).value) : undefined,
    content: (item as any)?.content != null ? String((item as any).content) : undefined,
    icon: normalizeIcon((item as any)?.icon),
    disabled: !!(item as any)?.disabled,
  }));
}

function accordionItems(
  p: Record<string, unknown> | undefined
): Array<{ label: string; value?: string; content?: string; icon?: string; trailingIcon?: string; disabled?: boolean }> {
  const raw = p?.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    label: String((item as any)?.label ?? ""),
    value: (item as any)?.value != null ? String((item as any).value) : undefined,
    content: (item as any)?.content != null ? String((item as any).content) : undefined,
    icon: normalizeIcon((item as any)?.icon),
    trailingIcon: normalizeIcon((item as any)?.trailingIcon),
    disabled: !!(item as any)?.disabled,
  }));
}

function accordionType(p: Record<string, unknown> | undefined): "single" | "multiple" {
  return p?.multiple ? "multiple" : "single";
}

function accordionModelValue(p: Record<string, unknown> | undefined): string | string[] {
  if (p?.multiple) {
    const values = p.values;
    if (Array.isArray(values)) return values.map((v) => String(v));
    return [];
  }
  return String(p?.value ?? "");
}

function handleAccordionChange(nodeProps: Record<string, unknown> | undefined, value: unknown) {
  const multiple = !!nodeProps?.multiple;
  if (multiple) {
    const values = Array.isArray(value) ? value.map((item) => String(item)) : [];
    handleAction(nodeProps?.onChange, { values });
    return;
  }
  handleAction(nodeProps?.onChange, { value: value == null ? "" : String(value) });
}

function progressValue(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function progressMax(max: unknown): number | undefined {
  const n = Number(max);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, n);
}

function tooltipText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function floatingContent(
  p: Record<string, unknown> | undefined
): { side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; sideOffset?: number } | undefined {
  if (!p) return undefined;
  const side =
    p.side === "top" || p.side === "right" || p.side === "bottom" || p.side === "left"
      ? (p.side as "top" | "right" | "bottom" | "left")
      : undefined;
  const align = p.align === "start" || p.align === "center" || p.align === "end" ? (p.align as "start" | "center" | "end") : undefined;
  const sideOffsetRaw = Number(p.sideOffset);
  const sideOffset = Number.isFinite(sideOffsetRaw) ? sideOffsetRaw : undefined;
  if (!side && !align && sideOffset == null) return undefined;
  return { side, align, sideOffset };
}

function tooltipContent(
  p: Record<string, unknown> | undefined
): { side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; sideOffset?: number } | undefined {
  return floatingContent(p);
}

function popoverContent(
  p: Record<string, unknown> | undefined
): { side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; sideOffset?: number } | undefined {
  return floatingContent(p);
}

function dropdownContent(
  p: Record<string, unknown> | undefined
): { side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; sideOffset?: number } | undefined {
  return floatingContent(p);
}

function tooltipTriggerLabel(p: Record<string, unknown> | undefined): string | undefined {
  const label = p?.triggerLabel;
  if (typeof label !== "string") return undefined;
  const value = label.trim();
  return value || undefined;
}

function tooltipTriggerIcon(p: Record<string, unknown> | undefined): string {
  const icon = normalizeIcon(p?.triggerIcon);
  return icon ?? "i-lucide-circle-help";
}

function tooltipTriggerSquare(p: Record<string, unknown> | undefined): boolean {
  return !tooltipTriggerLabel(p);
}

function popoverTriggerLabel(p: Record<string, unknown> | undefined): string | undefined {
  const label = p?.triggerLabel;
  if (typeof label !== "string") return undefined;
  const value = label.trim();
  return value || undefined;
}

function popoverTriggerIcon(p: Record<string, unknown> | undefined): string {
  const icon = normalizeIcon(p?.triggerIcon);
  return icon ?? "i-lucide-ellipsis";
}

function popoverTriggerSquare(p: Record<string, unknown> | undefined): boolean {
  if (typeof p?.triggerSquare === "boolean") return p.triggerSquare;
  return !popoverTriggerLabel(p);
}

function dropdownTriggerLabel(p: Record<string, unknown> | undefined): string | undefined {
  const label = p?.triggerLabel;
  if (typeof label !== "string") return undefined;
  const value = label.trim();
  return value || undefined;
}

function dropdownTriggerIcon(p: Record<string, unknown> | undefined): string {
  const icon = normalizeIcon(p?.triggerIcon);
  return icon ?? "i-lucide-ellipsis";
}

function dropdownTriggerSquare(p: Record<string, unknown> | undefined): boolean {
  if (typeof p?.triggerSquare === "boolean") return p.triggerSquare;
  return !dropdownTriggerLabel(p);
}

function menuItemColor(color: unknown): string | undefined {
  if (typeof color !== "string") return undefined;
  if (!color) return undefined;
  if (color === "default") return "primary";
  return color;
}

function dropdownMenuItems(
  p: Record<string, unknown> | undefined
): Array<{ label: string; value?: string; icon?: string; color?: string; disabled?: boolean; onSelect?: () => void }> {
  const raw = p?.items;
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? "");
    const value = row.value != null ? String(row.value) : label;
    const itemAction = isAction(row.onSelect) ? row.onSelect : undefined;
    const fallbackAction = isAction(p?.onSelect) ? p.onSelect : undefined;
    return {
      label,
      value,
      icon: normalizeIcon(row.icon),
      color: menuItemColor(row.color),
      disabled: !!row.disabled,
      onSelect: () => handleAction(itemAction ?? fallbackAction, { value, label, index }),
    };
  });
}

function calendarModelValue(p: Record<string, unknown> | undefined): unknown {
  if (!!p?.range) {
    return protocolDateRangeToUiValue(p);
  }
  if (!!p?.multiple) {
    if (!Array.isArray(p?.values)) return [];
    return p.values.map((item) => protocolDateToUiValue(item)).filter(Boolean);
  }
  return protocolDateToUiValue(p?.value);
}

function handleCalendarChange(nodeProps: Record<string, unknown> | undefined, value: unknown) {
  if (!!nodeProps?.range) {
    const range = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const start = uiValueToProtocolDate(range.start);
    const end = uiValueToProtocolDate(range.end);
    handleAction(nodeProps?.onChange, { rangeValue: { start, end } });
    return;
  }
  if (!!nodeProps?.multiple) {
    const values = Array.isArray(value) ? value.map((item) => uiValueToProtocolDate(item)).filter(Boolean) : [];
    handleAction(nodeProps?.onChange, { values });
    return;
  }
  handleAction(nodeProps?.onChange, { value: uiValueToProtocolDate(value) ?? "" });
}

function datePickerModelValue(p: Record<string, unknown> | undefined): unknown {
  if (!!p?.range) return protocolDateRangeToUiValue(p);
  return protocolDateToUiValue(p?.value);
}

function handleDatePickerChange(nodeProps: Record<string, unknown> | undefined, value: unknown) {
  if (!!nodeProps?.range) {
    const range = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const start = uiValueToProtocolDate(range.start);
    const end = uiValueToProtocolDate(range.end);
    handleAction(nodeProps?.onChange, { rangeValue: { start, end } });
    return;
  }
  handleAction(nodeProps?.onChange, { value: uiValueToProtocolDate(value) ?? "" });
}

function handleDatePickerBlur(nodeProps: Record<string, unknown> | undefined) {
  if (!!nodeProps?.range) {
    const range = nodeProps?.rangeValue && typeof nodeProps.rangeValue === "object"
      ? (nodeProps.rangeValue as Record<string, unknown>)
      : {};
    const start = typeof range.start === "string" ? range.start : undefined;
    const end = typeof range.end === "string" ? range.end : undefined;
    handleAction(nodeProps?.onBlur, { rangeValue: { start, end } });
    return;
  }
  handleAction(nodeProps?.onBlur, { value: nodeProps?.value == null ? "" : String(nodeProps.value) });
}

function timeHourCycle(value: unknown): 12 | 24 | undefined {
  if (value === 12 || value === 24) return value;
  const n = Number(value);
  if (n === 12 || n === 24) return n;
  return undefined;
}

function timeGranularity(value: unknown): "hour" | "minute" | "second" | undefined {
  if (value === "hour" || value === "minute" || value === "second") return value;
  return undefined;
}

function protocolTimeRangePartValue(
  p: Record<string, unknown> | undefined,
  part: "start" | "end"
): string | undefined {
  const raw = p?.rangeValue;
  if (!raw || typeof raw !== "object") return undefined;
  const value = (raw as Record<string, unknown>)[part];
  return typeof value === "string" ? value : undefined;
}

function timeRangePartModelValue(
  p: Record<string, unknown> | undefined,
  part: "start" | "end"
): IntlTime | undefined {
  return protocolTimeToUiValue(protocolTimeRangePartValue(p, part));
}

function timeInputModelValue(p: Record<string, unknown> | undefined): unknown {
  if (!!p?.range) return protocolTimeToUiValue(protocolTimeRangePartValue(p, "start"));
  return protocolTimeToUiValue(p?.value);
}

function handleTimeInputRangePartChange(
  nodeProps: Record<string, unknown> | undefined,
  part: "start" | "end",
  value: unknown
) {
  const nextValue = uiValueToProtocolTime(value);
  const currentStart = protocolTimeRangePartValue(nodeProps, "start");
  const currentEnd = protocolTimeRangePartValue(nodeProps, "end");
  const rangeValue =
    part === "start"
      ? { start: nextValue, end: currentEnd }
      : { start: currentStart, end: nextValue };
  handleAction(nodeProps?.onChange, { rangeValue });
}

function handleTimeInputChange(nodeProps: Record<string, unknown> | undefined, value: unknown) {
  if (!!nodeProps?.range) {
    handleTimeInputRangePartChange(nodeProps, "start", value);
    return;
  }
  handleAction(nodeProps?.onChange, { value: uiValueToProtocolTime(value) ?? "" });
}

function handleTimeInputBlur(nodeProps: Record<string, unknown> | undefined) {
  if (!!nodeProps?.range) {
    const range = nodeProps?.rangeValue && typeof nodeProps.rangeValue === "object"
      ? (nodeProps.rangeValue as Record<string, unknown>)
      : {};
    const start = typeof range.start === "string" ? range.start : undefined;
    const end = typeof range.end === "string" ? range.end : undefined;
    handleAction(nodeProps?.onBlur, { rangeValue: { start, end } });
    return;
  }
  handleAction(nodeProps?.onBlur, { value: nodeProps?.value == null ? "" : String(nodeProps.value) });
}

function tableRows(p: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  if (!Array.isArray(p?.rows)) return [];
  return p.rows
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({ ...(row as Record<string, unknown>) }));
}

function tableAlignClass(align: unknown): string | undefined {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  if (align === "left") return "text-left";
  return undefined;
}

function tableCellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function tableWidthStyle(width: unknown): string | undefined {
  if (typeof width === "number") return `${width}px`;
  if (typeof width === "string" && width.trim()) return width.trim();
  return undefined;
}

function tableColumns(p: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const raw = p?.columns;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((col) => {
      const column = col as Record<string, unknown>;
      const key = String(column.key ?? "").trim();
      if (!key) return null;
      const label = column.label == null ? key : String(column.label);
      const alignClass = tableAlignClass(column.align);
      const customClass = typeof column.class === "string" ? column.class.trim() : "";
      const widthStyle = tableWidthStyle(column.width);
      return {
        accessorKey: key,
        id: key,
        header: label,
        enableSorting: !!column.sortable,
        cell: (ctx: { getValue: () => unknown }) => tableCellText(ctx.getValue()),
        meta: {
          class: {
            th: [alignClass, customClass].filter(Boolean).join(" ") || undefined,
            td: [alignClass, customClass].filter(Boolean).join(" ") || undefined,
          },
          style: widthStyle
            ? {
                th: widthStyle,
                td: widthStyle,
              }
            : undefined,
        },
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function tableRowKey(p: Record<string, unknown> | undefined): string | undefined {
  const key = p?.rowKey;
  if (typeof key !== "string") return undefined;
  const normalized = key.trim();
  return normalized || undefined;
}

function tableEmpty(p: Record<string, unknown> | undefined): string | undefined {
  if (typeof p?.empty !== "string") return undefined;
  return p.empty.trim() || undefined;
}

function tableSticky(p: Record<string, unknown> | undefined): boolean | "header" | "footer" {
  const sticky = p?.sticky;
  if (sticky === true || sticky === "header" || sticky === "footer") return sticky;
  return false;
}

function tableSorting(
  p: Record<string, unknown> | undefined
): Array<{ id: string; desc: boolean }> | undefined {
  const id = typeof p?.sortKey === "string" ? p.sortKey.trim() : "";
  if (!id) return undefined;
  return [{ id, desc: !!p?.sortDesc }];
}

function handleTableSortingChange(nodeProps: Record<string, unknown> | undefined, value: unknown) {
  const first = Array.isArray(value) && value.length > 0 ? value[0] : undefined;
  if (!first || typeof first !== "object") {
    handleAction(nodeProps?.onSortChange, { key: "", desc: false });
    return;
  }
  const row = first as Record<string, unknown>;
  handleAction(nodeProps?.onSortChange, {
    key: row.id == null ? "" : String(row.id),
    desc: !!row.desc,
  });
}

function handleTableRowSelect(nodeProps: Record<string, unknown> | undefined, event: Event, row: unknown) {
  const rowObj = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const original =
    rowObj.original && typeof rowObj.original === "object" && !Array.isArray(rowObj.original)
      ? (rowObj.original as Record<string, unknown>)
      : {};
  const rowKey = tableRowKey(nodeProps);
  const rowId = rowKey ? original[rowKey] : undefined;
  handleAction(nodeProps?.onRowClick, {
    row: original,
    index: Number.isFinite(Number(rowObj.index)) ? Number(rowObj.index) : undefined,
    rowId,
    eventType: (event as Event).type,
  });
}

function selectModelValue(p: Record<string, unknown> | undefined): string | string[] {
  const multiple = !!p?.multiple;
  if (multiple) {
    const values = p?.values;
    if (Array.isArray(values)) return values.map((value) => String(value));
    return [];
  }
  return String(p?.value ?? "");
}

function selectSearchInput(p: Record<string, unknown> | undefined): boolean | { autocomplete: string } {
  if (!p?.search) return false;
  const autocomplete = typeof p.autocomplete === "string" ? p.autocomplete.trim() : "";
  if (!autocomplete) return true;
  return { autocomplete };
}

function eventTargetValue(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const target = (event as any).target;
  if (!target || typeof target !== "object") return undefined;
  if (!("value" in target)) return undefined;
  return String((target as any).value ?? "");
}

function handleTextInputBlur(nodeProps: Record<string, unknown> | undefined, event: unknown) {
  const value = eventTargetValue(event) ?? String(nodeProps?.value ?? "");
  handleAction(nodeProps?.onBlur, { value });
}

function handleSelectChange(nodeProps: Record<string, unknown> | undefined, value: unknown) {
  const multiple = !!nodeProps?.multiple;
  if (multiple) {
    const values = Array.isArray(value) ? value.map((item) => String(item)) : [];
    handleAction(nodeProps?.onChange, { values });
    return;
  }
  handleAction(nodeProps?.onChange, { value: value == null ? "" : String(value) });
}

function handleSelectBlur(nodeProps: Record<string, unknown> | undefined) {
  const multiple = !!nodeProps?.multiple;
  if (multiple) {
    const values = Array.isArray(nodeProps?.values) ? nodeProps.values.map((item) => String(item)) : [];
    handleAction(nodeProps?.onBlur, { values });
    return;
  }
  handleAction(nodeProps?.onBlur, { value: nodeProps?.value == null ? "" : String(nodeProps.value) });
}

function isAction(a: unknown): a is { type: string; [k: string]: unknown } {
  return a != null && typeof a === "object" && "type" in a && typeof (a as any).type === "string";
}

/** IPC 只能传可结构化克隆的纯对象，避免 Vue reactive 代理导致 "An object could not be cloned" */
function toPlainAction(action: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(action));
  } catch {
    return action;
  }
}

function handleClick(action: unknown) {
  if (isAction(action)) props.dispatch(props.appletId, toPlainAction(action));
}

function handleAction(action: unknown, extra: Record<string, unknown>) {
  if (isAction(action)) props.dispatch(props.appletId, toPlainAction({ ...action, ...extra }));
}
</script>
