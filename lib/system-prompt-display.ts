/**
 * 仅用于“系统”面板的展示翻译；原始系统提示词仍会不经修改地发送给模型。
 */
export function translateSystemPromptForDisplay(prompt: string, locale: string): string {
  if (locale !== "zh-CN") return prompt;

  return prompt
    .replaceAll(
      "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
      "你是运行在 pi 编程代理环境中的专业编程助手。你通过读取文件、执行命令、编辑代码和创建新文件来帮助用户。",
    )
    .replaceAll("(none)", "（无）")
    .replaceAll(
      "In addition to the tools above, you may have access to other custom tools depending on the project.",
      "除上述工具外，你还可能根据项目配置获得其他自定义工具。",
    )
    .replaceAll("- Be concise in your responses", "- 回复应简洁明了")
    .replaceAll("- Show file paths clearly when working with files", "- 处理文件时清晰展示文件路径")
    .replaceAll(
      "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
      "Pi 文档（仅当用户询问 Pi 本身、SDK、扩展、主题、技能或 TUI 时阅读）：",
    )
    .replace(/^- Main documentation: (.+)$/gm, "- 主文档：$1")
    .replace(/^- Additional docs: (.+)$/gm, "- 补充文档：$1")
    .replace(/^- Examples: (.+) \(extensions, custom tools, SDK\)$/gm, "- 示例：$1（扩展、自定义工具、SDK）")
    .replaceAll(
      "- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory",
      "- 阅读 Pi 文档或示例时，应在“补充文档”下解析 docs/...、在“示例”下解析 examples/...，而不是在当前工作目录中解析。",
    )
    .replaceAll(
      "- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md), MCP servers (docs/mcp.md), codemode scripts and non-LLM models such as classifiers and image models (docs/codemode.md)",
      "- 被问及以下主题时，分别参考对应文档：扩展（docs/extensions.md、examples/extensions/）、主题（docs/themes.md）、技能（docs/skills.md）、提示词模板（docs/prompt-templates.md）、TUI 组件（docs/tui.md）、快捷键（docs/keybindings.md）、SDK 集成（docs/sdk.md）、自定义提供商（docs/custom-provider.md）、添加模型（docs/models.md）、Pi 软件包（docs/packages.md）、环境变量（docs/environment-variables.md）、MCP 服务（docs/mcp.md），以及 Code mode 脚本和分类器、图像模型等非 LLM 模型（docs/codemode.md）。",
    )
    .replaceAll(
      "- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing",
      "- 处理 Pi 相关主题时，实施前先阅读文档和示例，并遵循 .md 文件中的交叉引用。",
    )
    .replaceAll(
      "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
      "- 始终完整阅读 Pi 的 .md 文件，并跟随相关文档链接（例如通过 tui.md 查看 TUI API 详情）。",
    );
}
