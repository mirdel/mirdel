export type MarkdownToPlainOptions = {
  codeBlockPlaceholder?: string;
  imagePlaceholder?: string;
  preserveLineBreaks?: boolean;
};

const DEFAULT_CODE_PLACEHOLDER = "[code]";
const DEFAULT_IMAGE_PLACEHOLDER = "[image]";

function normalizeMarkdown(input: string) {
  return String(input || "")
    .replace(/\r\n?/g, "\n")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ");
}

function replaceFencedCode(input: string, placeholder: string) {
  return input
    .replace(/```[\s\S]*?```/g, ` ${placeholder} `)
    .replace(/~~~[\s\S]*?~~~/g, ` ${placeholder} `)
    .replace(/<pre[\s\S]*?<\/pre>/gi, ` ${placeholder} `);
}

function replaceFencedCodeWithContent(input: string) {
  return input
    .replace(/```(?:[^\n]*\n)?([\s\S]*?)```/g, (_match, content: string) => `\n${content}\n`)
    .replace(/~~~(?:[^\n]*\n)?([\s\S]*?)~~~/g, (_match, content: string) => `\n${content}\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_match, content: string) => `\n${content}\n`);
}

function replaceImages(input: string, placeholder: string) {
  return input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ` ${placeholder} `)
    .replace(/<img\b[^>]*>/gi, ` ${placeholder} `);
}

function replaceImagesWithAltText(input: string) {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_match, alt: string) => alt ? ` ${alt} ` : " ")
    .replace(/<img\b[^>]*alt=(['"])(.*?)\1[^>]*>/gi, (_match, _quote: string, alt: string) => alt ? ` ${alt} ` : " ")
    .replace(/<img\b[^>]*>/gi, " ");
}

function replaceTables(input: string) {
  return input
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, " ")
    .replace(/^\s*\|(.+)\|\s*$/gm, (_, row: string) => {
      const cells = row
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      return cells.length ? ` ${cells.join(" ")} ` : " ";
    });
}

function stripMarkdownSyntax(input: string) {
  return input
    .replace(/^\s*[-*+]\s+\[(?:\s|x|X)\]\s+/gm, "")
    .replace(/^\s*\d+\.\s+\[(?:\s|x|X)\]\s+/gm, "")
    .replace(/^\s*\[(?:\s|x|X)\]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^\s*([-*_]){3,}\s*$/gm, "")
    .replace(/\+\+([\s\S]+?)\+\+/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, " ");
}

function finalizePlainText(input: string, preserveLineBreaks: boolean) {
  if (!preserveLineBreaks) {
    return input
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return input
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function markdownToPlain(markdown: string, options: MarkdownToPlainOptions = {}) {
  const codePlaceholder = options.codeBlockPlaceholder || DEFAULT_CODE_PLACEHOLDER;
  const imagePlaceholder = options.imagePlaceholder || DEFAULT_IMAGE_PLACEHOLDER;
  const preserveLineBreaks = !!options.preserveLineBreaks;

  let text = normalizeMarkdown(markdown);
  text = replaceFencedCode(text, codePlaceholder);
  text = replaceImages(text, imagePlaceholder);
  text = replaceTables(text);
  text = stripMarkdownSyntax(text);

  return finalizePlainText(text, preserveLineBreaks);
}

export function markdownToSearchText(markdown: string, options: Pick<MarkdownToPlainOptions, "preserveLineBreaks"> = {}) {
  const preserveLineBreaks = !!options.preserveLineBreaks;

  let text = normalizeMarkdown(markdown);
  text = replaceFencedCodeWithContent(text);
  text = replaceImagesWithAltText(text);
  text = replaceTables(text);
  text = stripMarkdownSyntax(text);

  return finalizePlainText(text, preserveLineBreaks);
}
