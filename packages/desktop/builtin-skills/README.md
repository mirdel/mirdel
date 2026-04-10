# 内置技能目录

本目录用于打包时拷贝到应用资源目录，首次启动时会同步到用户目录 `{userData}/skills/.system/`。

## 当前内置技能

- `docx` - Word 文档创建、编辑与分析
- `pdf` - PDF 文件处理（读取、合并、拆分、创建等）
- `xlsx` - Excel 电子表格处理
- `pptx` - PowerPoint 演示文稿创建与编辑
- `skill-creator` - 创建自定义技能的指南

## 目录结构

每个子文件夹应包含至少一个 `SKILL.md` 文件，可选 `scripts/`、`references/`、`assets/`。

```
builtin-skills/
  README.md
  pdf/
    SKILL.md
    scripts/
    ...
  docx/
    SKILL.md
    ...
```
