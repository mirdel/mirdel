/**
 * Applet 协议类型：与宿主无关，可被主进程、子进程、Runner 共用。
 */

/** 可序列化的 Action，UI 回调只传此类 */
export type Action = { type: string; [key: string]: unknown };

/** 声明式 Action 构造：根据 type + payload 生成严格 action */
export type TypedAction<TType extends string, TPayload extends Record<string, unknown> = Record<string, never>> = {
  type: TType;
} & TPayload;

/** 用于声明 ActionOf 的 payload map */
export type ActionPayloadMap = Record<string, Record<string, unknown> | undefined>;

type NormalizeActionPayload<T> = T extends Record<string, unknown> ? T : Record<string, never>;

/** 从 payload map 推导判别联合 action */
export type ActionOf<TMap extends ActionPayloadMap> = {
  [K in keyof TMap & string]: TypedAction<K, NormalizeActionPayload<TMap[K]>>;
}[keyof TMap & string];

/** LLM 消息：prompt 为快捷写法，有 messages 时忽略 prompt */
export type AppletLlmMessage = { role: "user" | "assistant" | "system"; content: string };

/** generateText / streamText 共用参数（prompt 与 messages 二选一，有 messages 时忽略 prompt） */
export type AppletLlmParams = {
  prompt?: string;
  messages?: AppletLlmMessage[];
  system?: string;
  /** 必填：providerId::modelId */
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
};

/** 运行状态（按 key 管理，如 streamText 的 key） */
export type RunStatus = "idle" | "running" | "done" | "error";

/** 布局 props（View/Row/Col 通用）。尺寸 number 渲染为 px，string 原样；overflow 需显式声明 */
export type LayoutProps = {
  /** 透传到渲染容器 class（用于 Tailwind/自定义样式） */
  class?: string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
  flex?: number;
  /** 主轴对齐（Row 为水平，Col 为垂直） */
  justify?: "start" | "center" | "end" | "space-between" | "space-around";
  /** 交叉轴对齐 */
  align?: "start" | "center" | "end" | "stretch";
  /** 是否换行（多用于 Row） */
  wrap?: boolean;
  /** number 渲染为 px，string 原样；无量化 */
  gap?: number | string;
  /** number | string 或 1～4 元数组，渲染为 style.padding */
  padding?: number | string | number[] | string[];
  /** 显式控制溢出：'auto' 为滚动，'hidden' 为裁剪；不传则不设置 overflow */
  overflow?: "auto" | "hidden";
  /** 默认 true；false 时隐藏 */
  visible?: boolean;
  /** 背景色，使用 Nuxt UI 主题色 */
  bgColor?: "default" | "transparent" | "success" | "info" | "warning" | "error";
  /** 边框样式，颜色与粗细写死 */
  border?: "none" | "solid" | "dashed" | "dotted";
  /** 圆角，默认 none */
  rounded?: "none" | "sm" | "md" | "lg" | "xl";
  /** 阴影，对应 Tailwind shadow-* */
  shadow?: "none" | "sm" | "md" | "lg" | "xl";
  /** 整块可点击时触发 */
  onClick?: Action;
};

/** UI Schema 节点：声明式 UI 树，可 JSON 序列化，各组件 props 限定死便于问题暴露 */
export type UINode =
  | { type: "View"; props: LayoutProps; children: UINode[] }
  | { type: "Row"; props: LayoutProps; children: UINode[] }
  | { type: "Col"; props: LayoutProps; children: UINode[] }
  | { type: "Modal"; props: ModalProps; children: UINode[] }
  | { type: "Popover"; props: PopoverProps; children: UINode[] }
  | { type: "DropdownMenu"; props: DropdownMenuProps; children: UINode[] }
  | { type: "Calendar"; props: CalendarProps }
  | { type: "DatePicker"; props: DatePickerProps }
  | { type: "InputTime"; props: InputTimeProps }
  | { type: "Table"; props: TableProps }
  | { type: "Text"; props: TextProps }
  | { type: "Markdown"; props: MarkdownProps }
  | { type: "Input"; props: InputProps }
  | { type: "Textarea"; props: TextareaProps }
  | { type: "Select"; props: SelectProps }
  | { type: "Button"; props: ButtonProps }
  | { type: "Switch"; props: SwitchProps }
  | { type: "Checkbox"; props: CheckboxProps }
  | { type: "Progress"; props: ProgressProps }
  | { type: "Alert"; props: AlertProps }
  | { type: "RadioGroup"; props: RadioGroupProps }
  | { type: "Tabs"; props: TabsProps }
  | { type: "Accordion"; props: AccordionProps }
  | { type: "Badge"; props: BadgeProps }
  | { type: "Separator"; props: SeparatorProps }
  | { type: "Tooltip"; props: TooltipProps }
  | { type: "Icon"; props: IconProps }
  | { type: "Image"; props: ImageProps };

export type TextProps = {
  value: string;
  class?: string;
  /** 字体色：default 正常、muted 浅色、主题色 */
  color?: "default" | "muted" | "success" | "info" | "warning" | "error";
  /** 最多显示行数，1～6；不传则换行完整显示 */
  lineClamp?: number;
  /** 字号，默认 md（16px） */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
};

export type MarkdownProps = {
  value: string;
  class?: string;
};

export type InputProps = {
  value: string;
  class?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  /** 透传 NInput type，默认 text */
  type?: "text" | "number" | "password" | "search" | "email" | "url" | "tel";
  /** 透传 NInput color */
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  /** 与 NInput variant 一致，默认 outline */
  variant?: "outline" | "soft" | "subtle" | "ghost" | "none";
  /** 与 NInput size 一致，默认 md */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** lucide 图标名，如 search、user，渲染为 i-lucide-xxx；默认无 */
  icon?: string;
  leadingIcon?: string;
  trailingIcon?: string;
  loading?: boolean;
  autofocus?: boolean;
  /** 透传原生 autocomplete */
  autocomplete?: string;
  /** 透传原生 readonly */
  readonly?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  pattern?: string;
  minlength?: number;
  maxlength?: number;
  disabled?: boolean;
  /** true 时加 w-full，默认 false */
  block?: boolean;
  onChange?: Action;
  onBlur?: Action;
};

export type TextareaProps = {
  value: string;
  class?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "outline" | "soft" | "subtle" | "ghost" | "none";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  icon?: string;
  leadingIcon?: string;
  trailingIcon?: string;
  loading?: boolean;
  autofocus?: boolean;
  autocomplete?: string;
  rows?: number;
  maxrows?: number;
  autoresize?: boolean;
  readonly?: boolean;
  minlength?: number;
  maxlength?: number;
  disabled?: boolean;
  block?: boolean;
  onChange?: Action;
  onBlur?: Action;
};

export type SelectItem = {
  label: string;
  value: string;
  disabled?: boolean;
  description?: string;
  icon?: string;
};

export type SelectProps = {
  value?: string;
  values?: string[];
  class?: string;
  name?: string;
  required?: boolean;
  autocomplete?: string;
  /** 是否启用下拉内搜索框（底层 USelectMenu 的 search-input） */
  search?: boolean;
  /** 是否展示清空按钮（底层 USelectMenu 的 clear） */
  clear?: boolean;
  placeholder?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "outline" | "soft" | "subtle" | "ghost" | "none";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  leadingIcon?: string;
  trailingIcon?: string;
  selectedIcon?: string;
  loading?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  items: SelectItem[];
  onChange?: Action;
  onBlur?: Action;
};

export type AppletModelPurpose = "chat" | "embedding" | "rerank" | "image" | "video";

export type AppletModelListOptions = {
  /** 默认 chat */
  purpose?: AppletModelPurpose;
  providerId?: string;
};

export type AppletModelOption = SelectItem & {
  /** providerId::modelId */
  value: string;
  providerId: string;
  providerName?: string;
  modelId: string;
  modelType?: "generative" | "embedding" | "rerank";
  inputModalities?: string[];
  outputModalities?: string[];
};

export type ModelSelectProps = Omit<SelectProps, "items"> & AppletModelListOptions;

export type ButtonProps = {
  text: string;
  class?: string;
  /** default 传 primary 给 UButton，其余透传；默认 default */
  color?: "default" | "primary" | "secondary" | "neutral" | "success" | "info" | "warning" | "error";
  /** 透传 UButton variant */
  variant?: "solid" | "outline" | "soft" | "subtle" | "ghost" | "link";
  /** 透传 UButton size */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** 图标名，默认按 lucide 短名处理，也支持 i-* / provider:icon */
  icon?: string;
  leadingIcon?: string;
  trailingIcon?: string;
  square?: boolean;
  /** 透传 UButton loading */
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;
  onClick?: Action;
};

export type SwitchProps = {
  label?: string;
  description?: string;
  class?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  loading?: boolean;
  checkedIcon?: string;
  uncheckedIcon?: string;
  disabled?: boolean;
  checked: boolean;
  onChange?: Action;
};

export type CheckboxProps = {
  label?: string;
  description?: string;
  class?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "card" | "list";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  indicator?: "start" | "end" | "hidden";
  icon?: string;
  indeterminateIcon?: string;
  disabled?: boolean;
  checked: boolean;
  onChange?: Action;
};

export type ProgressProps = {
  value?: number;
  max?: number;
  status?: boolean;
  class?: string;
  size?: "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  orientation?: "horizontal" | "vertical";
  inverted?: boolean;
  animation?: "carousel" | "carousel-inverse" | "swing" | "elastic";
};

export type AlertProps = {
  title?: string;
  description?: string;
  icon?: string;
  class?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "solid" | "outline" | "soft" | "subtle";
};

export type RadioItem = {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
};

export type RadioGroupProps = {
  value?: string;
  legend?: string;
  class?: string;
  items: RadioItem[];
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "card" | "list" | "table";
  orientation?: "horizontal" | "vertical";
  indicator?: "start" | "end" | "hidden";
  loop?: boolean;
  disabled?: boolean;
  onChange?: Action;
};

export type TabsItem = {
  label: string;
  value?: string;
  content?: string;
  icon?: string;
  disabled?: boolean;
};

export type TabsProps = {
  value?: string;
  class?: string;
  items: TabsItem[];
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "pill" | "link";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  orientation?: "horizontal" | "vertical";
  activationMode?: "automatic" | "manual";
  content?: boolean;
  onChange?: Action;
};

export type AccordionItem = {
  label: string;
  value?: string;
  content?: string;
  icon?: string;
  trailingIcon?: string;
  disabled?: boolean;
};

export type AccordionProps = {
  value?: string;
  values?: string[];
  class?: string;
  items: AccordionItem[];
  multiple?: boolean;
  collapsible?: boolean;
  trailingIcon?: string;
  disabled?: boolean;
  onChange?: Action;
};

export type BadgeProps = {
  label: string;
  class?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "solid" | "outline" | "soft" | "subtle";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  icon?: string;
  leadingIcon?: string;
  trailingIcon?: string;
  square?: boolean;
};

export type SeparatorProps = {
  class?: string;
  label?: string;
  icon?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  type?: "solid" | "dashed" | "dotted";
  orientation?: "horizontal" | "vertical";
};

export type TooltipProps = {
  text: string;
  class?: string;
  triggerLabel?: string;
  triggerIcon?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  disabled?: boolean;
  delayDuration?: number;
};

export type PopoverProps = {
  open?: boolean;
  class?: string;
  mode?: "click" | "hover";
  triggerLabel?: string;
  triggerIcon?: string;
  triggerColor?: "default" | "primary" | "secondary" | "neutral" | "success" | "info" | "warning" | "error";
  triggerVariant?: "solid" | "outline" | "soft" | "subtle" | "ghost" | "link";
  triggerSize?: "xs" | "sm" | "md" | "lg" | "xl";
  triggerSquare?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  disabled?: boolean;
  delayDuration?: number;
  onOpenChange?: Action;
};

export type DropdownMenuItem = {
  label: string;
  value?: string;
  icon?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  disabled?: boolean;
  onSelect?: Action;
};

export type DropdownMenuProps = {
  class?: string;
  items: DropdownMenuItem[];
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  triggerLabel?: string;
  triggerIcon?: string;
  triggerColor?: "default" | "primary" | "secondary" | "neutral" | "success" | "info" | "warning" | "error";
  triggerVariant?: "solid" | "outline" | "soft" | "subtle" | "ghost" | "link";
  triggerSize?: "xs" | "sm" | "md" | "lg" | "xl";
  triggerSquare?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  disabled?: boolean;
  onOpenChange?: Action;
  onSelect?: Action;
};

/** 轻应用协议中的日期字符串，固定 YYYY-MM-DD */
export type AppletDateString = string;
/** 轻应用协议中的时间字符串，固定 HH:mm 或 HH:mm:ss */
export type AppletTimeString = string;

export type DateRangeValue = {
  /** 协议层日期：YYYY-MM-DD */
  start?: AppletDateString;
  /** 协议层日期：YYYY-MM-DD */
  end?: AppletDateString;
};

export type CalendarProps = {
  /** 协议层日期：YYYY-MM-DD（非 range/multiple 模式） */
  value?: AppletDateString;
  /** 协议层日期数组：YYYY-MM-DD（multiple 模式） */
  values?: AppletDateString[];
  rangeValue?: DateRangeValue;
  class?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "solid" | "outline" | "soft" | "subtle" | "ghost" | "link";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  range?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  /** 协议层日期：YYYY-MM-DD */
  minValue?: AppletDateString;
  /** 协议层日期：YYYY-MM-DD */
  maxValue?: AppletDateString;
  /** 协议层日期：YYYY-MM-DD */
  placeholder?: AppletDateString;
  monthControls?: boolean;
  yearControls?: boolean;
  weekNumbers?: boolean;
  onChange?: Action;
};

export type DatePickerProps = {
  /** 协议层日期：YYYY-MM-DD（非 range 模式） */
  value?: AppletDateString;
  rangeValue?: DateRangeValue;
  class?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "outline" | "soft" | "subtle" | "ghost" | "none";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  range?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  autofocus?: boolean;
  /** 协议层日期：YYYY-MM-DD */
  minValue?: AppletDateString;
  /** 协议层日期：YYYY-MM-DD */
  maxValue?: AppletDateString;
  /** 协议层日期：YYYY-MM-DD */
  placeholder?: AppletDateString;
  onChange?: Action;
  onBlur?: Action;
};

export type TimeRangeValue = {
  /** 协议层时间：HH:mm 或 HH:mm:ss */
  start?: AppletTimeString;
  /** 协议层时间：HH:mm 或 HH:mm:ss */
  end?: AppletTimeString;
};

export type InputTimeProps = {
  /** 协议层时间：HH:mm 或 HH:mm:ss（非 range 模式） */
  value?: AppletTimeString;
  rangeValue?: TimeRangeValue;
  class?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  variant?: "outline" | "soft" | "subtle" | "ghost" | "none";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  range?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  autofocus?: boolean;
  /** 协议层时间：HH:mm 或 HH:mm:ss */
  minValue?: AppletTimeString;
  /** 协议层时间：HH:mm 或 HH:mm:ss */
  maxValue?: AppletTimeString;
  /** 协议层时间：HH:mm 或 HH:mm:ss */
  placeholder?: AppletTimeString;
  hourCycle?: 12 | 24;
  granularity?: "hour" | "minute" | "second";
  onChange?: Action;
  onBlur?: Action;
};

export type TableColumn = {
  key: string;
  label?: string;
  align?: "left" | "center" | "right";
  width?: number | string;
  sortable?: boolean;
  class?: string;
};

export type TableProps = {
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
  rowKey?: string;
  class?: string;
  loading?: boolean;
  empty?: string;
  sticky?: boolean | "header" | "footer";
  sortKey?: string;
  sortDesc?: boolean;
  onRowClick?: Action;
  onSortChange?: Action;
};

export type ModalProps = {
  open: boolean;
  class?: string;
  title?: string;
  description?: string;
  overlay?: boolean;
  dismissible?: boolean;
  close?: boolean;
  fullscreen?: boolean;
  onOpenChange?: Action;
};

export type IconProps = {
  name: string;
  class?: string;
  size?: string | number;
};

export type ImageProps = {
  src: string;
  alt?: string;
  class?: string;
};

/** 宿主提供的 LLM 能力（主进程实现，子进程通过 IPC 调用） */
export type AppletLlmHost = {
  generateText(params: AppletLlmParams): Promise<string>;
  streamText(params: AppletLlmParams & { key?: string; statePath: string; onDelta?: (chunk: string) => void }): Promise<void>;
  abort(key: string): void;
  status(key: string): RunStatus;
};

export type AppletModelsApi = {
  list(options?: AppletModelListOptions): Promise<AppletModelOption[]>;
};

export type AppletModelsHost = AppletModelsApi & {
  /** 仅宿主内部用于 render 阶段同步取列表 */
  listSync?(options?: AppletModelListOptions): AppletModelOption[];
};

/** 宿主提供的 runs 状态（子进程内由 host 驱动） */
export type AppletRunsHost = {
  cancel(key: string): void;
  status(key: string): RunStatus;
};

/** search 简化返回结构 */
export type AppletSearchResult = {
  success: boolean;
  source?: string;
  results?: Array<{
    title: string;
    url: string;
    content: string;
    truncated?: boolean;
    fetchSuccess?: boolean;
  }>;
  error?: string;
  searchDuration?: number;
  duration?: number;
};

/** clipboard 能力（读写） */
export type AppletClipboardHost = {
  write(text: string): Promise<boolean>;
  read(): Promise<string>;
};

/** fs 能力：node:fs/promises 全部 API，由宿主注入 */
export type AppletFsHost = Record<string, unknown>;

export type AppletStorageValue =
  | null
  | boolean
  | number
  | string
  | AppletStorageValue[]
  | { [key: string]: AppletStorageValue };

export type AppletStorageHost = {
  get(key: string): Promise<AppletStorageValue | undefined>;
  set(key: string, value: AppletStorageValue): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  getAll(): Promise<Record<string, AppletStorageValue>>;
};

export type AppletDialogFilter = {
  name: string;
  extensions: string[];
};

export type AppletSelectFileOptions = {
  title?: string;
  defaultPath?: string;
  filters?: AppletDialogFilter[];
  multiSelections?: boolean;
};

export type AppletSelectFileResult = {
  canceled: boolean;
  filePaths: string[];
};

export type AppletSelectDirectoryOptions = {
  title?: string;
  defaultPath?: string;
};

export type AppletSelectDirectoryResult = {
  canceled: boolean;
  filePath: string | null;
};

export type AppletSaveFileOptions = {
  title?: string;
  defaultPath?: string;
  filters?: AppletDialogFilter[];
};

export type AppletSaveFileResult = {
  canceled: boolean;
  filePath: string | null;
};

export type AppletDialogHost = {
  selectFile(options?: AppletSelectFileOptions): Promise<AppletSelectFileResult>;
  selectDirectory(options?: AppletSelectDirectoryOptions): Promise<AppletSelectDirectoryResult>;
  saveFile(options?: AppletSaveFileOptions): Promise<AppletSaveFileResult>;
};

export type AppletShellResult = {
  ok: boolean;
  error?: string;
};

export type AppletShellHost = {
  openExternal(url: string): Promise<AppletShellResult>;
  showItemInFolder(path: string): Promise<AppletShellResult>;
  openPath(path: string): Promise<AppletShellResult>;
};

/** toast 能力（轻提示） */
export type AppletToastInput = {
  title?: string;
  description?: string;
  icon?: string;
  color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
  duration?: number;
  close?: boolean;
  progress?: boolean;
};

export type AppletToastHost = (input: AppletToastInput) => void;

/** 执行上下文：注入到用户脚本的 ctx */
export type AppletCtx<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TAction extends Action = Action,
> = {
  state: TState;
  dispatch(action: TAction): void;
  llm: AppletLlmHost;
  models: AppletModelsApi;
  runs: AppletRunsHost;
  ui: AppletUIApi;
  search?(query: string, options?: { limit?: number; providerId?: string }): Promise<AppletSearchResult>;
  clipboard?: AppletClipboardHost;
  fs?: AppletFsHost;
  storage?: AppletStorageHost;
  dialog?: AppletDialogHost;
  shell?: AppletShellHost;
  toast?: AppletToastHost;
};

type WithOptionalChildren<TProps> = TProps & { children?: UINode | UINode[] };

/** UI API：在脚本中调用的工厂，返回 UINode，props 限定死便于问题暴露 */
export type AppletUIApi = {
  View(props: WithOptionalChildren<LayoutProps>, children?: UINode[]): UINode;
  Row(props: WithOptionalChildren<LayoutProps>, children?: UINode[]): UINode;
  Col(props: WithOptionalChildren<LayoutProps>, children?: UINode[]): UINode;
  Modal(props: WithOptionalChildren<ModalProps>, children?: UINode[]): UINode;
  Popover(props: WithOptionalChildren<PopoverProps>, children?: UINode[]): UINode;
  DropdownMenu(props: WithOptionalChildren<DropdownMenuProps>, children?: UINode[]): UINode;
  /** 日期入参/回调一律使用协议字符串 YYYY-MM-DD（内部由 Renderer 转换为 UI 日期对象） */
  Calendar(props: CalendarProps): UINode;
  /** 日期入参/回调一律使用协议字符串 YYYY-MM-DD（内部由 Renderer 转换为 UI 日期对象） */
  DatePicker(props: DatePickerProps): UINode;
  /** 时间入参/回调一律使用协议字符串 HH:mm / HH:mm:ss（内部由 Renderer 转换为 UI 时间对象） */
  InputTime(props: InputTimeProps): UINode;
  Table(props: TableProps): UINode;
  Text(props: TextProps): UINode;
  Markdown(props: MarkdownProps): UINode;
  Input(props: InputProps): UINode;
  Textarea(props: TextareaProps): UINode;
  Select(props: SelectProps): UINode;
  ModelSelect(props: ModelSelectProps): UINode;
  Button(props: ButtonProps): UINode;
  Switch(props: SwitchProps): UINode;
  Checkbox(props: CheckboxProps): UINode;
  Progress(props: ProgressProps): UINode;
  Alert(props: AlertProps): UINode;
  RadioGroup(props: RadioGroupProps): UINode;
  Tabs(props: TabsProps): UINode;
  Accordion(props: AccordionProps): UINode;
  Badge(props: BadgeProps): UINode;
  Separator(props: SeparatorProps): UINode;
  Tooltip(props: TooltipProps): UINode;
  Icon(props: IconProps): UINode;
  Image(props: ImageProps): UINode;
};

/** 用户脚本导出的接口 */
export type AppletScript<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TAction extends Action = Action,
> = {
  init(): TState;
  onAction(ctx: AppletCtx<TState, TAction>, action: TAction): void | Promise<void>;
  render(ctx: AppletCtx<TState, TAction>): UINode;
};

/** 轻应用定义入口：用于约束导出结构并让 State 从 init 自动推导 */
export declare function defineApplet<
  TState extends Record<string, unknown>,
  TAction extends Action = Action,
>(script: AppletScript<TState, TAction>): AppletScript<TState, TAction>;
