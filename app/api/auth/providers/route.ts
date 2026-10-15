import { buildApiKeyProviderList, buildOAuthProviderList } from "@/lib/provider-listing";
import { collectProviderListingInputs } from "@/lib/provider-listing-runtime";
import { getModelRuntimeWithExtensions } from "@/lib/model-runtime";
import { requireRuoyiSettingsAccess } from "@/lib/ruoyi-settings-access";

export const dynamic = "force-dynamic";

// Providers that declare an OAuth login method, including anthropic
// (Claude Pro/Max) — see lib/provider-listing.ts (#309).
export async function GET(req: Request) {
  const denied = await requireRuoyiSettingsAccess(req, "models");
  if (denied) return denied;
  const modelRuntime = await getModelRuntimeWithExtensions();
  const inputs = await collectProviderListingInputs(modelRuntime);
  const oauthProviders = buildOAuthProviderList(inputs);
  const apiKeyProviders = buildApiKeyProviderList(inputs);
  return Response.json({ providers: oauthProviders, oauthProviders, apiKeyProviders });
}
