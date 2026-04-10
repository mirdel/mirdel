// electron.vite.config.ts
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
var __electron_vite_injected_dirname = path.dirname(fileURLToPath(import.meta.url));
var sharedAlias = {
  "@shared": path.join(__electron_vite_injected_dirname, "../shared/src/index.ts")
};
var markdownToPlainAlias = {
  "@mirdel/markdown-to-plain": path.join(__electron_vite_injected_dirname, "../markdown-to-plain/src/index.ts")
};
var appletCoreAlias = {
  "@mirdel/applet-core": path.join(__electron_vite_injected_dirname, "../applet-core/src/index.ts")
};
var rendererWatchIgnored = [
  "**/.runtime/**",
  "**/builtin-skills/**",
  "**/searxng/**",
  "**/dist/**",
  "**/release/**",
  "**/*.dylib",
  "**/*.dll",
  "**/*.so",
  "**/*.zip"
];
var electron_vite_config_default = defineConfig({
  main: {
    resolve: {
      alias: { ...sharedAlias, ...appletCoreAlias, ...markdownToPlainAlias }
    },
    build: {
      outDir: "dist/main",
      // 子进程入口依赖 applet-core，必须打进包；否则会从 node_modules 加载 TS 源码导致 ERR_MODULE_NOT_FOUND
      externalizeDeps: {
        exclude: ["@mirdel/applet-core"]
      },
      rollupOptions: {
        input: {
          index: path.join(__electron_vite_injected_dirname, "src/main/index.ts"),
          // Built-in MCP servers (separate entry points)
          "builtin-servers/filesystem": path.join(__electron_vite_injected_dirname, "src/main/services/mcp/builtin/filesystem/index.ts"),
          "builtin-servers/shell": path.join(__electron_vite_injected_dirname, "src/main/services/mcp/builtin/shell/index.ts"),
          // 轻应用子进程入口（独立进程跑 Applet 脚本）
          "applet/subprocessRunner": path.join(__electron_vite_injected_dirname, "src/main/services/applet/subprocessRunner.ts")
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        },
        external: []
      }
    }
  },
  preload: {
    resolve: { alias: { ...sharedAlias, ...markdownToPlainAlias } },
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    server: {
      watch: {
        ignored: rendererWatchIgnored
      }
    },
    optimizeDeps: {
      include: [
        "@nuxt/ui > prosemirror-state",
        "@nuxt/ui > prosemirror-transform",
        "@nuxt/ui > prosemirror-model",
        "@nuxt/ui > prosemirror-view",
        "@nuxt/ui > prosemirror-gapcursor"
      ],
      // Keep table extension out of pre-bundling to avoid duplicate runtime
      // execution of prosemirror-tables (Selection.jsonID('cell')) in dev.
      exclude: [
        "@tiptap/extension-table",
        "@tiptap/extension-table/kit",
        "@tiptap/pm/tables",
        "prosemirror-tables"
      ]
    },
    build: {
      // 与 main 里 loadFile(path.join(__dirname, "../renderer/index.html")) 对齐
      outDir: "dist/renderer",
      rollupOptions: {
        input: {
          // 主窗口页面
          main: path.join(__electron_vite_injected_dirname, "src/renderer/index.html"),
          // 图片预览小窗口页面
          imagePreview: path.join(__electron_vite_injected_dirname, "src/renderer/image-preview.html"),
          // 轻应用运行窗口
          appletRunner: path.join(__electron_vite_injected_dirname, "src/renderer/applet-runner.html")
        }
      }
    },
    resolve: {
      alias: {
        "@": path.join(__electron_vite_injected_dirname, "src/renderer"),
        ...sharedAlias,
        ...markdownToPlainAlias
      }
    },
    plugins: [
      vue(),
      ui({
        theme: {
          defaultVariants: {
            color: "neutral"
          }
        },
        ui: {
          colors: {
            primary: "teal"
          },
          modal: {
            slots: {
              overlay: "z-100",
              content: "z-100"
            }
          },
          dropdownMenu: {
            variants: {
              size: {
                md: {
                  itemLeadingIcon: "w-4"
                },
                lg: {
                  itemLeadingIcon: "w-4"
                }
              }
            }
          },
          button: {
            variants: {
              size: {
                md: {
                  leadingIcon: "p-[1px]"
                },
                lg: {
                  leadingIcon: "p-[1px]"
                },
                xl: {
                  leadingIcon: "p-[1px]"
                }
              }
            }
          },
          input: {
            variants: {
              size: {
                md: {
                  leadingIcon: "p-[1px]"
                },
                lg: {
                  leadingIcon: "p-[1px]"
                },
                xl: {
                  leadingIcon: "p-[1px]"
                }
              }
            }
          },
          empty: {
            slots: {
              title: "text-muted"
            }
          },
          editorSuggestionMenu: {
            variants: {
              size: {
                sm: {
                  itemLeadingIcon: "w-4"
                },
                md: {
                  itemLeadingIcon: "w-4"
                }
              }
            }
          }
        }
      })
    ]
  }
});
export {
  electron_vite_config_default as default
};
