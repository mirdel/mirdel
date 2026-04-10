// 技能库相关类型（Agent Skills 格式）

export interface SkillItem {
  id: string
  name: string
  description: string
  /** 是否为内置技能（来自 .system） */
  isBuiltin: boolean
  /** 技能目录最后修改时间（毫秒时间戳），用于列表按时间排序 */
  updatedAt?: number
}

export interface SkillDetail extends SkillItem {
  /** SKILL.md 的 body 部分（Markdown） */
  bodyMarkdown?: string
  /** scripts/ 下相对路径 */
  scriptPaths?: string[]
  /** references/ 下相对路径 */
  referencePaths?: string[]
  /** assets/ 下相对路径 */
  assetPaths?: string[]
  /** 未被脚本/引用/资源包含的其余文件（从根目录起的相对路径） */
  otherFilePaths?: string[]
}
