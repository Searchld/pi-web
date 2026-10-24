import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { literalWord, shellAssignment, splitShellWords, type ShellWord } from "./shell-words";

export const DESTRUCTIVE_COMMAND_GUARD_EXTENSION_NAME = "pi-web-destructive-command-guard";

const BLOCKED_REASON = "为保护本机文件，Pi Web 已阻止递归强制删除命令。";

function commandIndex(words: readonly ShellWord[]): number {
  let index = 0;
  while (index < words.length && shellAssignment(words[index])) index++;

  // 常用的命令包装器不应让 rm 绕过检查。
  while (index < words.length) {
    const word = literalWord(words[index]);
    if (word === "sudo") {
      index++;
      while (index < words.length && literalWord(words[index])?.startsWith("-")) index++;
      continue;
    }
    if (word === "command" || word === "time" || word === "nohup") {
      index++;
      continue;
    }
    if (word === "env") {
      index++;
      while (index < words.length && shellAssignment(words[index])) index++;
      continue;
    }
    break;
  }
  return index;
}

function isRmCommand(word: string | undefined): boolean {
  return word === "rm" || /(?:^|[\\/])rm$/.test(word ?? "");
}

function splitCommandSequences(command: string): string[] {
  const sequences: string[] = [];
  let start = 0;
  let quote: "'" | '"' | undefined;

  const push = (end: number) => {
    const sequence = command.slice(start, end).trim();
    if (sequence) sequences.push(sequence.replace(/^(?:then|do|else)\b\s*/, ""));
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === "\\") {
      index++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ";" || char === "\n" || char === "|" || char === "&" || char === "(" || char === ")") {
      push(index);
      if ((char === "|" || char === "&") && command[index + 1] === char) index++;
      start = index + 1;
    }
  }
  push(command.length);
  return sequences;
}

function isForcedRecursiveRemove(words: readonly ShellWord[]): boolean {
  const index = commandIndex(words);
  const executable = literalWord(words[index]);
  if (!isRmCommand(executable)) {
    // `bash -c '…'` 仍会在当前 shell 中执行内层命令，继续检查其脚本参数。
    if (/^(?:ba)?sh$|^zsh$/.test(executable ?? "")) {
      const scriptIndex = words.findIndex((word, wordIndex) => wordIndex > index && literalWord(word) === "-c");
      const script = scriptIndex < 0 ? undefined : literalWord(words[scriptIndex + 1]);
      return script !== undefined && isBlockedDestructiveCommand(script);
    }
    return false;
  }

  let recursive = false;
  let force = false;
  for (const word of words.slice(index + 1)) {
    const value = literalWord(word);
    if (!value) continue;
    if (value === "--") break;
    if (value === "--recursive") recursive = true;
    else if (value === "--force") force = true;
    else if (/^-[^-]+$/.test(value)) {
      recursive ||= /r/i.test(value);
      force ||= value.includes("f");
    }
  }
  return recursive && force;
}

/** 是否为直接执行的 rm -rf（或等效参数排列）。 */
export function isBlockedDestructiveCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  return splitCommandSequences(command).some((sequence) => {
    const result = splitShellWords(sequence);
    return result.ok && isForcedRecursiveRemove(result.words);
  });
}

/** 在工具执行前阻断递归强制删除；嵌套的 Code mode 调用也会经过此钩子。 */
export function createDestructiveCommandGuard(): InlineExtension {
  return {
    name: DESTRUCTIVE_COMMAND_GUARD_EXTENSION_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on("tool_call", (event) => {
        if (event.toolName !== "bash" || !isBlockedDestructiveCommand(event.input.command)) return undefined;
        return { block: true, reason: BLOCKED_REASON, terminate: true };
      });
    },
  };
}
