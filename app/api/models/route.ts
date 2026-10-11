import { existsSync } from "fs";
import { stat } from "fs/promises";
import { resolve } from "path";
import { createAgentSessionServices, getAgentDir, type SettingsManager } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
  loadModelsWithCache,
  withModelRuntimeError,
  withSafeModelLoadFailure,
  type ModelsData,
} from "@/lib/models-cache";
import { orderSelectorModels, resolveVisibleModels, selectInitialModelScope } from "@/lib/model-scope";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { projectTrustReloadOptions } from "@/lib/project-trust";
import { rememberProviderModels, withDeferredProviderModels } from "@/lib/deferred-provider-models";
import { inferRemovedWorktree } from "@/lib/worktree";
import { isRuoyiIntegrationEnabled } from "@/lib/ruoyi-identity";
import { requireRuoyiChatAccess } from "@/lib/ruoyi-access";

export const dynamic = "force-dynamic";

async function loadModels(cwd: string, ruoyiManaged: boolean): Promise<ModelsData> {
  const nameMap = new Map<string, string>();
  let modelList: { id: string; name: string; provider: string }[] = [];
  let defaultModel: { provider: string; modelId: string } | null = null;
  const thinkingLevels: Record<string, string[]> = {};
  const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};

  const agentDir = getAgentDir();
  // 企业模式下模型清单只用于和 RuoYi 白名单取交集，不能为此加载项目或用户扩展。
  // 普通本地模式仍保持原有项目可信任行为。
  const trustReloadOptions = ruoyiManaged ? undefined : projectTrustReloadOptions(cwd, agentDir);
  const services = await createAgentSessionServices({
    cwd,
    agentDir,
    ...(ruoyiManaged ? {
      resourceLoaderOptions: {
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      },
    } : {}),
    ...(trustReloadOptions ? { resourceLoaderReloadOptions: trustReloadOptions } : {}),
  });
  const modelError = services.modelRuntime.getError();
  const settings: SettingsManager = services.settingsManager;
  await rememberProviderModels(services.modelRuntime);
  // `enabledModels` supports globs and fuzzy patterns, so resolve it the same
  // way the CLI does instead of comparing pattern strings literally (#307).
  const scope = await resolveVisibleModels(
    withDeferredProviderModels(services.modelRuntime),
    settings.getEnabledModels(),
  );
  const { visible, thinkingLevelPins, warnings } = scope;
  modelList = orderSelectorModels(scope).map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    input: m.input,
  }));
  for (const m of visible) {
    const key = `${m.provider}:${m.id}`;
    nameMap.set(key, m.name);
    thinkingLevels[key] = getSupportedThinkingLevels(m);
    if (m.thinkingLevelMap) thinkingLevelMaps[key] = m.thinkingLevelMap;
  }

  const defaultProvider = settings.getDefaultProvider();
  const defaultModelId = settings.getDefaultModel();
  const initial = selectInitialModelScope(scope, {
    ...(defaultProvider && defaultModelId
      ? { defaultModel: { provider: defaultProvider, modelId: defaultModelId } }
      : {}),
  });
  if (initial.model) {
    defaultModel = { provider: initial.model.provider, modelId: initial.model.id };
  }
  const defaultThinkingLevel = initial.thinkingLevel
    ?? (initial.model
      ? settings.getModelThinkingLevel(initial.model.provider, initial.model.id)
      : undefined)
    ?? settings.getDefaultThinkingLevel()
    ?? null;

  return withModelRuntimeError(
    {
      models: Object.fromEntries(nameMap),
      modelList,
      defaultModel,
      defaultThinkingLevel,
      savedDefaultThinkingLevel: settings.getDefaultThinkingLevel() ?? null,
      thinkingLevels,
      thinkingLevelMaps,
      thinkingLevelPins,
      ...(warnings.length > 0 ? { modelScopeWarnings: warnings } : {}),
    },
    modelError,
  );
}

const EMPTY_MODELS: ModelsData = {
  models: {},
  modelList: [],
  defaultModel: null,
  defaultThinkingLevel: null,
  savedDefaultThinkingLevel: null,
  thinkingLevels: {},
  thinkingLevelMaps: {},
  thinkingLevelPins: {},
};

export async function GET(req: Request) {
  const access = isRuoyiIntegrationEnabled() ? await requireRuoyiChatAccess(req) : null;
  if (access instanceof Response) return access;
  const requestedCwd = resolve(access?.workspace ?? (new URL(req.url).searchParams.get("cwd") || process.cwd()));
  // A subagent run isolated in a worktree has that worktree removed when the run
  // finishes, yet its session file still records the worktree as its cwd. Fall back
  // to the main repo it branched from, so opening a finished subagent resolves the
  // same models a non-isolated one would. The roots check below runs on the folder
  // actually answered from, so the fallback reaches no project that was not allowed
  // by name already.
  const cwd = existsSync(requestedCwd)
    ? requestedCwd
    : inferRemovedWorktree(requestedCwd)?.projectRoot ?? requestedCwd;

  let cwdStat;
  try {
    cwdStat = await stat(cwd);
  } catch {
    return Response.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
  }
  if (!cwdStat.isDirectory()) {
    return Response.json({ error: `Not a directory: ${cwd}` }, { status: 400 });
  }
  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    // 受管模式与本地模式不能复用缓存：本地模式的缓存可能含有项目扩展注册的模型。
    const models = access
      ? await loadModels(cwd, true)
      : await loadModelsWithCache(cwd, () => loadModels(cwd, false));
    if (!access) return Response.json(models);
    const allowed = new Set(access.policy.modelPolicy.models.map((model) => `${model.provider}:${model.modelId}`));
    const modelList = models.modelList.filter((model) => allowed.has(`${model.provider}:${model.id}`));
    const names = Object.fromEntries(Object.entries(models.models).filter(([key]) => allowed.has(key)));
    const defaultDefinition = access.policy.modelPolicy.models.find((model) => model.modelCode === access.policy.modelPolicy.defaultModelCode);
    const defaultModel = defaultDefinition && allowed.has(`${defaultDefinition.provider}:${defaultDefinition.modelId}`)
      ? { provider: defaultDefinition.provider, modelId: defaultDefinition.modelId }
      : modelList[0] ? { provider: modelList[0].provider, modelId: modelList[0].id } : null;
    return Response.json({
      ...models,
      models: names,
      modelList,
      defaultModel,
      modelPolicyVersion: access.policy.modelPolicy.policyVersion,
    });
  } catch {
    return Response.json(withSafeModelLoadFailure(EMPTY_MODELS));
  }
}
