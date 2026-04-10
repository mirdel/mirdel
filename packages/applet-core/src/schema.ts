import type {
  UINode,
  LayoutProps,
  TextProps,
  MarkdownProps,
  InputProps,
  TextareaProps,
  SelectProps,
  SelectItem,
  ModelSelectProps,
  ButtonProps,
  SwitchProps,
  CheckboxProps,
  ProgressProps,
  AlertProps,
  RadioGroupProps,
  RadioItem,
  TabsProps,
  TabsItem,
  AccordionProps,
  AccordionItem,
  BadgeProps,
  SeparatorProps,
  TooltipProps,
  ModalProps,
  PopoverProps,
  DropdownMenuProps,
  DropdownMenuItem,
  CalendarProps,
  DatePickerProps,
  DateRangeValue,
  AppletDateString,
  InputTimeProps,
  TimeRangeValue,
  AppletTimeString,
  TableProps,
  TableColumn,
  IconProps,
  ImageProps,
  AppletModelListOptions,
  AppletModelOption,
  Action,
} from "./types";

function layoutProps(props: LayoutProps): LayoutProps {
  return {
    class: props.class,
    width: props.width,
    height: props.height,
    minWidth: props.minWidth,
    maxWidth: props.maxWidth,
    minHeight: props.minHeight,
    maxHeight: props.maxHeight,
    flex: props.flex,
    justify: props.justify,
    align: props.align,
    wrap: props.wrap,
    gap: props.gap,
    padding: props.padding,
    overflow: props.overflow,
    visible: props.visible,
    bgColor: props.bgColor,
    border: props.border,
    rounded: props.rounded,
    shadow: props.shadow,
    onClick: ensureAction(props.onClick) ?? undefined,
  };
}

function ensureAction(action: Action | undefined): Action | undefined {
  if (action == null) return undefined;
  if (typeof action === "object" && "type" in action && typeof (action as Action).type === "string") {
    return action as Action;
  }
  return undefined;
}

function textProps(props: TextProps): TextProps {
  return {
    value: String(props.value ?? ""),
    class: props.class,
    color: props.color,
    lineClamp: props.lineClamp,
    size: props.size,
    bold: props.bold,
    italic: props.italic,
    strikethrough: props.strikethrough,
    underline: props.underline,
  };
}

function markdownProps(props: MarkdownProps): MarkdownProps {
  return {
    value: String(props.value ?? ""),
    class: props.class,
  };
}

function selectItems(items: SelectItem[] | undefined): SelectItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    label: String(item?.label ?? ""),
    value: String(item?.value ?? ""),
    disabled: !!item?.disabled,
    description: item?.description ? String(item.description) : undefined,
    icon: item?.icon ? String(item.icon) : undefined,
  }));
}

function radioItems(items: RadioItem[] | undefined): RadioItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    label: String(item?.label ?? ""),
    value: String(item?.value ?? ""),
    description: item?.description ? String(item.description) : undefined,
    disabled: !!item?.disabled,
  }));
}

function tabsItems(items: TabsItem[] | undefined): TabsItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    label: String(item?.label ?? ""),
    value: item?.value != null ? String(item.value) : undefined,
    content: item?.content != null ? String(item.content) : undefined,
    icon: item?.icon ? String(item.icon) : undefined,
    disabled: !!item?.disabled,
  }));
}

function accordionItems(items: AccordionItem[] | undefined): AccordionItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    label: String(item?.label ?? ""),
    value: item?.value != null ? String(item.value) : undefined,
    content: item?.content != null ? String(item.content) : undefined,
    icon: item?.icon ? String(item.icon) : undefined,
    trailingIcon: item?.trailingIcon ? String(item.trailingIcon) : undefined,
    disabled: !!item?.disabled,
  }));
}

function dropdownMenuItems(items: DropdownMenuItem[] | undefined): DropdownMenuItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    label: String(item?.label ?? ""),
    value: item?.value != null ? String(item.value) : undefined,
    icon: item?.icon ? String(item.icon) : undefined,
    color: item?.color,
    disabled: !!item?.disabled,
    onSelect: ensureAction(item?.onSelect),
  }));
}

/** 协议层日期归一化：仅接受 YYYY-MM-DD 字符串 */
function normalizeProtocolDateString(value: unknown): AppletDateString | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

function normalizeDateRange(value: DateRangeValue | undefined): DateRangeValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const start = normalizeProtocolDateString(value.start);
  const end = normalizeProtocolDateString(value.end);
  if (!start && !end) return undefined;
  return { start, end };
}

/** 协议层时间归一化：仅接受 HH:mm 或 HH:mm:ss 字符串 */
function normalizeProtocolTimeString(value: unknown): AppletTimeString | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s)) return undefined;
  return s;
}

function normalizeTimeRange(value: TimeRangeValue | undefined): TimeRangeValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const start = normalizeProtocolTimeString(value.start);
  const end = normalizeProtocolTimeString(value.end);
  if (!start && !end) return undefined;
  return { start, end };
}

function normalizeTableColumns(columns: TableColumn[] | undefined): TableColumn[] {
  if (!Array.isArray(columns)) return [];
  return columns
    .map((col) => ({
      key: String(col?.key ?? "").trim(),
      label: col?.label != null ? String(col.label) : undefined,
      align: col?.align,
      width: col?.width,
      sortable: !!col?.sortable,
      class: col?.class != null ? String(col.class) : undefined,
    }))
    .filter((col) => !!col.key);
}

function normalizeTableRows(rows: Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({ ...(row as Record<string, unknown>) }));
}

type CreateUIApiOptions = {
  listModels?: (options?: AppletModelListOptions) => AppletModelOption[];
};

export function createUIApi(options: CreateUIApiOptions = {}): import("./types").AppletUIApi {
  const listModels = options.listModels ?? (() => []);
  return {
    View(props, children) {
      return { type: "View", props: layoutProps(props), children: children ?? [] };
    },
    Row(props, children) {
      return { type: "Row", props: layoutProps(props), children: children ?? [] };
    },
    Col(props, children) {
      return { type: "Col", props: layoutProps(props), children: children ?? [] };
    },
    Modal(props: ModalProps, children: UINode[]): UINode {
      const { onOpenChange, ...rest } = props;
      return {
        type: "Modal",
        props: {
          open: !!rest.open,
          class: rest.class,
          title: rest.title ? String(rest.title) : undefined,
          description: rest.description ? String(rest.description) : undefined,
          overlay: rest.overlay ?? true,
          dismissible: rest.dismissible ?? true,
          close: rest.close ?? true,
          fullscreen: rest.fullscreen ?? false,
          onOpenChange: ensureAction(onOpenChange),
        },
        children: children ?? [],
      };
    },
    Popover(props: PopoverProps, children: UINode[]): UINode {
      const { onOpenChange, ...rest } = props;
      return {
        type: "Popover",
        props: {
          open: typeof rest.open === "boolean" ? rest.open : undefined,
          class: rest.class,
          mode: rest.mode,
          triggerLabel: rest.triggerLabel ? String(rest.triggerLabel) : undefined,
          triggerIcon: rest.triggerIcon ? String(rest.triggerIcon) : undefined,
          triggerColor: rest.triggerColor ?? "neutral",
          triggerVariant: rest.triggerVariant ?? "ghost",
          triggerSize: rest.triggerSize ?? "sm",
          triggerSquare: rest.triggerSquare ?? false,
          side: rest.side,
          align: rest.align,
          sideOffset: Number.isFinite(rest.sideOffset) ? Number(rest.sideOffset) : undefined,
          disabled: rest.disabled ?? false,
          delayDuration: Number.isFinite(rest.delayDuration) ? Math.max(0, Number(rest.delayDuration)) : undefined,
          onOpenChange: ensureAction(onOpenChange),
        },
        children: children ?? [],
      };
    },
    DropdownMenu(props: DropdownMenuProps, children: UINode[]): UINode {
      const { onOpenChange, onSelect, ...rest } = props;
      return {
        type: "DropdownMenu",
        props: {
          class: rest.class,
          items: dropdownMenuItems(rest.items),
          size: rest.size ?? "sm",
          triggerLabel: rest.triggerLabel ? String(rest.triggerLabel) : undefined,
          triggerIcon: rest.triggerIcon ? String(rest.triggerIcon) : undefined,
          triggerColor: rest.triggerColor ?? "neutral",
          triggerVariant: rest.triggerVariant ?? "ghost",
          triggerSize: rest.triggerSize ?? rest.size ?? "sm",
          triggerSquare: rest.triggerSquare ?? false,
          side: rest.side,
          align: rest.align,
          sideOffset: Number.isFinite(rest.sideOffset) ? Number(rest.sideOffset) : undefined,
          disabled: rest.disabled ?? false,
          onOpenChange: ensureAction(onOpenChange),
          onSelect: ensureAction(onSelect),
        },
        children: children ?? [],
      };
    },
    Calendar(props: CalendarProps): UINode {
      const { onChange, ...rest } = props;
      const range = !!rest.range;
      const multiple = !range && !!rest.multiple;
      return {
        type: "Calendar",
        props: {
          value: !range && !multiple ? normalizeProtocolDateString(rest.value) : undefined,
          values: multiple
            ? (Array.isArray(rest.values)
                ? (rest.values.map(normalizeProtocolDateString).filter(Boolean) as AppletDateString[])
                : [])
            : undefined,
          rangeValue: range ? normalizeDateRange(rest.rangeValue) : undefined,
          class: rest.class,
          color: rest.color,
          variant: rest.variant,
          size: rest.size,
          range,
          multiple,
          disabled: rest.disabled ?? false,
          minValue: normalizeProtocolDateString(rest.minValue),
          maxValue: normalizeProtocolDateString(rest.maxValue),
          placeholder: normalizeProtocolDateString(rest.placeholder),
          monthControls: typeof rest.monthControls === "boolean" ? rest.monthControls : undefined,
          yearControls: typeof rest.yearControls === "boolean" ? rest.yearControls : undefined,
          weekNumbers: typeof rest.weekNumbers === "boolean" ? rest.weekNumbers : undefined,
          onChange: ensureAction(onChange),
        },
      };
    },
    DatePicker(props: DatePickerProps): UINode {
      const { onChange, onBlur, ...rest } = props;
      const range = !!rest.range;
      return {
        type: "DatePicker",
        props: {
          value: !range ? normalizeProtocolDateString(rest.value) : undefined,
          rangeValue: range ? normalizeDateRange(rest.rangeValue) : undefined,
          class: rest.class,
          color: rest.color,
          variant: rest.variant,
          size: rest.size,
          range,
          disabled: rest.disabled ?? false,
          readonly: rest.readonly ?? false,
          autofocus: rest.autofocus ?? false,
          minValue: normalizeProtocolDateString(rest.minValue),
          maxValue: normalizeProtocolDateString(rest.maxValue),
          placeholder: normalizeProtocolDateString(rest.placeholder),
          onChange: ensureAction(onChange),
          onBlur: ensureAction(onBlur),
        },
      };
    },
    InputTime(props: InputTimeProps): UINode {
      const { onChange, onBlur, ...rest } = props;
      const range = !!rest.range;
      return {
        type: "InputTime",
        props: {
          value: !range ? normalizeProtocolTimeString(rest.value) : undefined,
          rangeValue: range ? normalizeTimeRange(rest.rangeValue) : undefined,
          class: rest.class,
          color: rest.color,
          variant: rest.variant,
          size: rest.size,
          range,
          disabled: rest.disabled ?? false,
          readonly: rest.readonly ?? false,
          autofocus: rest.autofocus ?? false,
          minValue: normalizeProtocolTimeString(rest.minValue),
          maxValue: normalizeProtocolTimeString(rest.maxValue),
          placeholder: normalizeProtocolTimeString(rest.placeholder),
          hourCycle: rest.hourCycle === 12 || rest.hourCycle === 24 ? rest.hourCycle : undefined,
          granularity:
            rest.granularity === "hour" || rest.granularity === "minute" || rest.granularity === "second"
              ? rest.granularity
              : undefined,
          onChange: ensureAction(onChange),
          onBlur: ensureAction(onBlur),
        },
      };
    },
    Table(props: TableProps): UINode {
      const { onRowClick, onSortChange, ...rest } = props;
      return {
        type: "Table",
        props: {
          columns: normalizeTableColumns(rest.columns),
          rows: normalizeTableRows(rest.rows),
          rowKey: rest.rowKey ? String(rest.rowKey) : undefined,
          class: rest.class,
          loading: rest.loading ?? false,
          empty: rest.empty != null ? String(rest.empty) : undefined,
          sticky: rest.sticky === true || rest.sticky === "header" || rest.sticky === "footer" ? rest.sticky : false,
          sortKey: rest.sortKey ? String(rest.sortKey) : undefined,
          sortDesc: !!rest.sortDesc,
          onRowClick: ensureAction(onRowClick),
          onSortChange: ensureAction(onSortChange),
        },
      };
    },
    Text(props) {
      return { type: "Text", props: textProps(props) };
    },
    Markdown(props) {
      return { type: "Markdown", props: markdownProps(props) };
    },
    Input(props) {
      const { onChange, onBlur, ...rest } = props;
      return {
        type: "Input",
        props: {
          value: rest.value ?? "",
          class: rest.class,
          name: rest.name,
          required: rest.required ?? false,
          placeholder: rest.placeholder,
          type: rest.type ?? "text",
          color: rest.color,
          variant: rest.variant ?? "outline",
          size: rest.size ?? "md",
          icon: rest.icon,
          leadingIcon: rest.leadingIcon,
          trailingIcon: rest.trailingIcon,
          loading: rest.loading ?? false,
          autofocus: rest.autofocus ?? false,
          autocomplete: rest.autocomplete,
          readonly: rest.readonly ?? false,
          min: rest.min,
          max: rest.max,
          step: rest.step,
          pattern: rest.pattern,
          minlength: Number.isFinite(rest.minlength) ? Math.max(0, Number(rest.minlength)) : undefined,
          maxlength: Number.isFinite(rest.maxlength) ? Math.max(0, Number(rest.maxlength)) : undefined,
          disabled: rest.disabled ?? false,
          block: rest.block ?? false,
          onChange: ensureAction(onChange),
          onBlur: ensureAction(onBlur),
        },
      };
    },
    Textarea(props) {
      const { onChange, onBlur, ...rest } = props;
      return {
        type: "Textarea",
        props: {
          value: rest.value ?? "",
          class: rest.class,
          name: rest.name,
          required: rest.required ?? false,
          placeholder: rest.placeholder,
          color: rest.color,
          variant: rest.variant ?? "outline",
          size: rest.size ?? "md",
          icon: rest.icon,
          leadingIcon: rest.leadingIcon,
          trailingIcon: rest.trailingIcon,
          loading: rest.loading ?? false,
          autofocus: rest.autofocus ?? false,
          autocomplete: rest.autocomplete,
          rows: Number.isFinite(rest.rows) ? Math.max(2, Number(rest.rows)) : 4,
          maxrows: Number.isFinite(rest.maxrows) ? Math.max(0, Number(rest.maxrows)) : undefined,
          autoresize: rest.autoresize ?? false,
          readonly: rest.readonly ?? false,
          minlength: Number.isFinite(rest.minlength) ? Math.max(0, Number(rest.minlength)) : undefined,
          maxlength: Number.isFinite(rest.maxlength) ? Math.max(0, Number(rest.maxlength)) : undefined,
          disabled: rest.disabled ?? false,
          block: rest.block ?? false,
          onChange: ensureAction(onChange),
          onBlur: ensureAction(onBlur),
        },
      };
    },
    Select(props) {
      const { onChange, onBlur, ...rest } = props;
      const multiple = !!rest.multiple;
      const normalizedValues = Array.isArray(rest.values)
        ? rest.values.map((v) => String(v))
        : [];
      const normalizedValue = rest.value != null ? String(rest.value) : "";
      return {
        type: "Select",
        props: {
          class: rest.class,
          name: rest.name,
          required: rest.required ?? false,
          autocomplete: rest.autocomplete,
          search: rest.search ?? false,
          clear: rest.clear ?? false,
          value: multiple ? undefined : normalizedValue,
          values: multiple ? normalizedValues : undefined,
          placeholder: rest.placeholder,
          color: rest.color,
          variant: rest.variant ?? "outline",
          size: rest.size ?? "md",
          leadingIcon: rest.leadingIcon,
          trailingIcon: rest.trailingIcon,
          selectedIcon: rest.selectedIcon,
          loading: rest.loading ?? false,
          disabled: rest.disabled ?? false,
          multiple,
          items: selectItems(rest.items),
          onChange: ensureAction(onChange),
          onBlur: ensureAction(onBlur),
        },
      };
    },
    ModelSelect(props: ModelSelectProps): UINode {
      const { onChange, onBlur, purpose, providerId, ...rest } = props;
      const multiple = !!rest.multiple;
      const normalizedValues = Array.isArray(rest.values)
        ? rest.values.map((v) => String(v))
        : [];
      const normalizedValue = rest.value != null ? String(rest.value) : "";
      const runtimeItems = listModels({ purpose, providerId });
      return {
        type: "Select",
        props: {
          class: rest.class,
          name: rest.name,
          required: rest.required ?? false,
          autocomplete: rest.autocomplete,
          search: rest.search ?? false,
          clear: rest.clear ?? false,
          value: multiple ? undefined : normalizedValue,
          values: multiple ? normalizedValues : undefined,
          placeholder: rest.placeholder,
          color: rest.color,
          variant: rest.variant ?? "outline",
          size: rest.size ?? "md",
          leadingIcon: rest.leadingIcon,
          trailingIcon: rest.trailingIcon,
          selectedIcon: rest.selectedIcon,
          loading: rest.loading ?? false,
          disabled: rest.disabled ?? false,
          multiple,
          items: selectItems(runtimeItems),
          onChange: ensureAction(onChange),
          onBlur: ensureAction(onBlur),
        },
      };
    },
    Button(props) {
      const { onClick, ...rest } = props;
      return {
        type: "Button",
        props: {
          text: rest.text ?? "",
          class: rest.class,
          color: rest.color ?? "default",
          variant: rest.variant,
          size: rest.size,
          icon: rest.icon,
          leadingIcon: rest.leadingIcon,
          trailingIcon: rest.trailingIcon,
          square: rest.square ?? false,
          loading: rest.loading,
          disabled: rest.disabled ?? false,
          block: rest.block ?? false,
          onClick: ensureAction(onClick),
        },
      };
    },
    Switch(props) {
      const { onChange, ...rest } = props;
      return {
        type: "Switch",
        props: {
          label: rest.label,
          description: rest.description,
          class: rest.class,
          color: rest.color,
          size: rest.size,
          loading: rest.loading ?? false,
          checkedIcon: rest.checkedIcon,
          uncheckedIcon: rest.uncheckedIcon,
          disabled: rest.disabled ?? false,
          checked: !!rest.checked,
          onChange: ensureAction(onChange),
        },
      };
    },
    Checkbox(props: CheckboxProps): UINode {
      const { onChange, ...rest } = props;
      return {
        type: "Checkbox",
        props: {
          label: rest.label,
          description: rest.description,
          class: rest.class,
          color: rest.color,
          variant: rest.variant,
          size: rest.size,
          indicator: rest.indicator,
          icon: rest.icon,
          indeterminateIcon: rest.indeterminateIcon,
          disabled: rest.disabled ?? false,
          checked: !!rest.checked,
          onChange: ensureAction(onChange),
        },
      };
    },
    Progress(props: ProgressProps): UINode {
      return {
        type: "Progress",
        props: {
          value: Number.isFinite(props.value) ? Number(props.value) : undefined,
          max: Number.isFinite(props.max) ? Math.max(0, Number(props.max)) : undefined,
          status: props.status ?? false,
          class: props.class,
          size: props.size,
          color: props.color,
          orientation: props.orientation,
          inverted: props.inverted ?? false,
          animation: props.animation,
        },
      };
    },
    Alert(props: AlertProps): UINode {
      return {
        type: "Alert",
        props: {
          title: props.title ? String(props.title) : undefined,
          description: props.description ? String(props.description) : undefined,
          icon: props.icon ? String(props.icon) : undefined,
          class: props.class,
          color: props.color,
          variant: props.variant,
        },
      };
    },
    RadioGroup(props: RadioGroupProps): UINode {
      const { onChange, ...rest } = props;
      return {
        type: "RadioGroup",
        props: {
          value: rest.value != null ? String(rest.value) : "",
          legend: rest.legend ? String(rest.legend) : undefined,
          class: rest.class,
          items: radioItems(rest.items),
          color: rest.color,
          size: rest.size,
          variant: rest.variant,
          orientation: rest.orientation,
          indicator: rest.indicator,
          loop: rest.loop ?? true,
          disabled: rest.disabled ?? false,
          onChange: ensureAction(onChange),
        },
      };
    },
    Tabs(props: TabsProps): UINode {
      const { onChange, ...rest } = props;
      return {
        type: "Tabs",
        props: {
          value: rest.value != null ? String(rest.value) : "",
          class: rest.class,
          items: tabsItems(rest.items),
          color: rest.color,
          variant: rest.variant,
          size: rest.size,
          orientation: rest.orientation,
          activationMode: rest.activationMode,
          content: rest.content ?? true,
          onChange: ensureAction(onChange),
        },
      };
    },
    Accordion(props: AccordionProps): UINode {
      const { onChange, ...rest } = props;
      const multiple = !!rest.multiple;
      const normalizedValues = Array.isArray(rest.values)
        ? rest.values.map((v) => String(v))
        : [];
      const normalizedValue = rest.value != null ? String(rest.value) : "";
      return {
        type: "Accordion",
        props: {
          value: multiple ? undefined : normalizedValue,
          values: multiple ? normalizedValues : undefined,
          class: rest.class,
          items: accordionItems(rest.items),
          multiple,
          collapsible: rest.collapsible ?? true,
          trailingIcon: rest.trailingIcon,
          disabled: rest.disabled ?? false,
          onChange: ensureAction(onChange),
        },
      };
    },
    Badge(props: BadgeProps): UINode {
      return {
        type: "Badge",
        props: {
          label: String(props.label ?? ""),
          class: props.class,
          color: props.color,
          variant: props.variant,
          size: props.size,
          icon: props.icon,
          leadingIcon: props.leadingIcon,
          trailingIcon: props.trailingIcon,
          square: props.square ?? false,
        },
      };
    },
    Separator(props: SeparatorProps): UINode {
      return {
        type: "Separator",
        props: {
          class: props.class,
          label: props.label ? String(props.label) : undefined,
          icon: props.icon ? String(props.icon) : undefined,
          color: props.color,
          size: props.size,
          type: props.type,
          orientation: props.orientation,
        },
      };
    },
    Tooltip(props: TooltipProps): UINode {
      return {
        type: "Tooltip",
        props: {
          text: String(props.text ?? ""),
          class: props.class,
          triggerLabel: props.triggerLabel ? String(props.triggerLabel) : undefined,
          triggerIcon: props.triggerIcon ? String(props.triggerIcon) : undefined,
          side: props.side,
          align: props.align,
          sideOffset: Number.isFinite(props.sideOffset) ? Number(props.sideOffset) : undefined,
          disabled: props.disabled ?? false,
          delayDuration: Number.isFinite(props.delayDuration) ? Math.max(0, Number(props.delayDuration)) : undefined,
        },
      };
    },
    Icon(props: IconProps): UINode {
      return {
        type: "Icon",
        props: {
          name: String(props.name ?? ""),
          class: props.class,
          size: props.size,
        },
      };
    },
    Image(props: ImageProps): UINode {
      return {
        type: "Image",
        props: {
          src: String(props.src ?? ""),
          alt: props.alt ? String(props.alt) : undefined,
          class: props.class,
        },
      };
    },
  };
}
