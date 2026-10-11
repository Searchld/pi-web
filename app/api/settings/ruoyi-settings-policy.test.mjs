import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routes = [
  ["general", "app/api/tools/settings/route.ts"],
  ["models", "app/api/models-config/route.ts"],
  ["models", "app/api/models-config/catalog/route.ts"],
  ["models", "app/api/models-config/discover/route.ts"],
  ["models", "app/api/models-config/test/route.ts"],
  ["models", "app/api/models/enabled/route.ts"],
  ["models", "app/api/models/default/route.ts"],
  ["models", "app/api/models/refresh/route.ts"],
  ["models", "app/api/auth/providers/route.ts"],
  ["models", "app/api/auth/login/[provider]/route.ts"],
  ["models", "app/api/auth/logout/[provider]/route.ts"],
  ["models", "app/api/auth/api-key/[provider]/route.ts"],
  ["skills", "app/api/skills/route.ts"],
  ["skills", "app/api/skills/install/route.ts"],
  ["skills", "app/api/skills/search/route.ts"],
  ["skills", "app/api/skills/check/route.ts"],
  ["skills", "app/api/skills/update/route.ts"],
  ["agents", "app/api/subagents/settings/route.ts"],
  ["agents", "app/api/subagents/profiles/route.ts"],
  ["plugins", "app/api/plugins/route.ts"],
  ["plugins", "app/api/plugins/check/route.ts"],
  ["mcp", "app/api/mcp/route.ts"],
  ["mcp", "app/api/mcp/test/route.ts"],
  ["mcp", "app/api/mcp/sign-in/route.ts"],
  ["mcp", "app/api/mcp/sign-in/[flowId]/route.ts"],
];

test("RuoYi 设置权限同时保护页签背后的 API", async () => {
  for (const [section, route] of routes) {
    const source = await readFile(route, "utf8");
    assert.match(source, new RegExp(`requireRuoyiSettingsAccess\\(req, "${section}"\\)`), route);
  }
});
