import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps, NodeViewRenderer } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import EditorImageUploadNode from "./EditorImageUploadNode.vue";

export interface EditorImageUploadResult {
  src: string;
  alt?: string;
  title?: string;
}

export type EditorImageUploader = (file: File) => Promise<EditorImageUploadResult>;

export interface EditorImageUploadOptions {
  upload?: EditorImageUploader;
  accept?: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageUpload: {
      insertImageUpload: () => ReturnType;
    };
  }
}

export const ImageUpload = Node.create<EditorImageUploadOptions>({
  name: "imageUpload",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return {
      upload: undefined,
      accept: "image/*",
    } satisfies EditorImageUploadOptions;
  },

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="image-upload"]',
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "image-upload" })];
  },

  addNodeView(): NodeViewRenderer {
    return VueNodeViewRenderer(EditorImageUploadNode);
  },

  addCommands() {
    return {
      insertImageUpload: () => ({ commands }: CommandProps) => {
        return commands.insertContent({ type: this.name });
      },
    };
  },
});

