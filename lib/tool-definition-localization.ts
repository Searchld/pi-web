import type { ToolEntry } from "./tool-presets";

type Translate = (key: string) => string;

type BuiltinToolTranslations = {
  name: string;
  description: string;
  parameters?: Record<string, string>;
  guidelines?: string[];
};

/**
 * 内置工具由 pi SDK 以英文定义；这里只转换工具页的展示内容，绝不改写模型的工具定义。
 * 扩展和 RuoYi 业务工具仍使用各自注册时提供的 label、description 与参数说明。
 */
const BUILTIN_TOOL_TRANSLATIONS: Record<string, BuiltinToolTranslations> = {
  read: {
    name: "tools.builtin.read.name",
    description: "tools.builtin.read.description",
    parameters: {
      path: "tools.builtin.read.path",
      offset: "tools.builtin.read.offset",
      limit: "tools.builtin.read.limit",
    },
    guidelines: ["tools.builtin.read.guideline1"],
  },
  bash: {
    name: "tools.builtin.bash.name",
    description: "tools.builtin.bash.description",
    parameters: {
      command: "tools.builtin.bash.command",
      timeout: "tools.builtin.bash.timeout",
    },
    guidelines: ["tools.builtin.bash.guideline1"],
  },
  edit: {
    name: "tools.builtin.edit.name",
    description: "tools.builtin.edit.description",
    parameters: {
      path: "tools.builtin.edit.path",
      edits: "tools.builtin.edit.edits",
    },
    guidelines: [
      "tools.builtin.edit.guideline1",
      "tools.builtin.edit.guideline2",
      "tools.builtin.edit.guideline3",
      "tools.builtin.edit.guideline4",
    ],
  },
  write: {
    name: "tools.builtin.write.name",
    description: "tools.builtin.write.description",
    parameters: {
      path: "tools.builtin.write.path",
      content: "tools.builtin.write.content",
    },
    guidelines: ["tools.builtin.write.guideline1"],
  },
  grep: {
    name: "tools.builtin.grep.name",
    description: "tools.builtin.grep.description",
    parameters: {
      pattern: "tools.builtin.grep.pattern",
      path: "tools.builtin.grep.path",
      glob: "tools.builtin.grep.glob",
      ignoreCase: "tools.builtin.grep.ignoreCase",
      literal: "tools.builtin.grep.literal",
      context: "tools.builtin.grep.context",
      limit: "tools.builtin.grep.limit",
    },
  },
  find: {
    name: "tools.builtin.find.name",
    description: "tools.builtin.find.description",
    parameters: {
      pattern: "tools.builtin.find.pattern",
      path: "tools.builtin.find.path",
      limit: "tools.builtin.find.limit",
    },
  },
  ls: {
    name: "tools.builtin.ls.name",
    description: "tools.builtin.ls.description",
    parameters: {
      path: "tools.builtin.ls.path",
      limit: "tools.builtin.ls.limit",
    },
  },
};

function localizedParameters(
  parameters: ToolEntry["parameters"],
  translations: BuiltinToolTranslations,
  translate: Translate,
): ToolEntry["parameters"] {
  if (!parameters?.properties || typeof parameters.properties !== "object" || !translations.parameters) return parameters;
  const properties = Object.fromEntries(Object.entries(parameters.properties).map(([name, value]) => {
    const key = translations.parameters?.[name];
    if (!key || !value || typeof value !== "object") return [name, value];
    return [name, { ...value as Record<string, unknown>, description: translate(key) }];
  }));
  return { ...parameters, properties };
}

export interface DisplayToolEntry extends ToolEntry {
  displayName: string;
}

/** 返回工具页专用的本地化副本。 */
export function localizeToolDefinition(tool: ToolEntry, translate: Translate): DisplayToolEntry {
  const translations = BUILTIN_TOOL_TRANSLATIONS[tool.name];
  if (!translations) {
    return { ...tool, displayName: tool.label?.trim() || tool.name };
  }
  return {
    ...tool,
    displayName: translate(translations.name),
    description: translate(translations.description),
    parameters: localizedParameters(tool.parameters, translations, translate),
    promptGuidelines: translations.guidelines?.map(translate),
  };
}
