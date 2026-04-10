export type Intent =
  | 'expand'
  | 'simplify'
  | 'explain'
  | 'example'
  | 'analogy'
  | 'conclusion'
  | 'table'
  | 'alternative'
  | 'compare'
  | 'recommend'
  | 'risk'
  | 'scenarios'
  | 'cost-benefit'
  | 'steps'
  | 'todo'
  | 'timeline'
  | 'mvp'
  | 'checklist'
  | 'next-action'
  | 'code'
  | 'pseudocode'
  | 'api-design'
  | 'data-structure'
  | 'unit-test'
  | 'performance'
  | 'clarify'
  | 'assumptions'
  | 'ask-first'

export const INTENT_META: Record<Intent, { icon: string }> = {
  expand: { icon: 'i-lucide-maximize-2' },
  simplify: { icon: 'i-lucide-minimize-2' },
  explain: { icon: 'i-lucide-message-square-text' },
  example: { icon: 'i-lucide-list' },
  analogy: { icon: 'i-lucide-book-open' },
  conclusion: { icon: 'i-lucide-target' },
  table: { icon: 'i-lucide-table' },
  alternative: { icon: 'i-lucide-repeat' },
  compare: { icon: 'i-lucide-scale' },
  recommend: { icon: 'i-lucide-thumbs-up' },
  risk: { icon: 'i-lucide-alert-triangle' },
  scenarios: { icon: 'i-lucide-flag' },
  'cost-benefit': { icon: 'i-lucide-trending-up' },
  steps: { icon: 'i-lucide-list-ordered' },
  todo: { icon: 'i-lucide-list-checks' },
  timeline: { icon: 'i-lucide-calendar' },
  mvp: { icon: 'i-lucide-rocket' },
  checklist: { icon: 'i-lucide-clipboard-check' },
  'next-action': { icon: 'i-lucide-corner-down-right' },
  code: { icon: 'i-lucide-code-2' },
  pseudocode: { icon: 'i-lucide-file-code' },
  'api-design': { icon: 'i-lucide-plug' },
  'data-structure': { icon: 'i-lucide-database' },
  'unit-test': { icon: 'i-lucide-flask-conical' },
  performance: { icon: 'i-lucide-zap' },
  clarify: { icon: 'i-lucide-help-circle' },
  assumptions: { icon: 'i-lucide-info' },
  'ask-first': { icon: 'i-lucide-message-circle-question' },
}

export const INTENT_GROUPS = [
  {
    key: 'expression',
    intents: ['expand', 'simplify', 'explain', 'example', 'analogy', 'conclusion', 'table'] as Intent[]
  },
  {
    key: 'decision',
    intents: ['alternative', 'compare', 'recommend', 'risk', 'scenarios', 'cost-benefit'] as Intent[]
  },
  {
    key: 'execution',
    intents: ['steps', 'todo', 'timeline', 'mvp', 'checklist', 'next-action'] as Intent[]
  },
  {
    key: 'engineering',
    intents: ['code', 'pseudocode', 'api-design', 'data-structure', 'unit-test', 'performance'] as Intent[]
  },
  {
    key: 'clarify',
    intents: ['clarify', 'assumptions', 'ask-first'] as Intent[]
  },
] as const
