/** 使 Pi Web 可部署在 RuoYi 的 /xi-web 等子路径下。 */
function normalizeBasePath(value: string | undefined): string {
  const path = value?.trim();
  if (!path || path === "/") return "";
  if (!path.startsWith("/") || path.startsWith("//") || /[?#]/.test(path)) return "";
  return path.replace(/\/+$/, "");
}

export const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_PI_WEB_BASE_PATH);

export function withAppBasePath(path: string): string {
  if (!appBasePath || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === appBasePath || path.startsWith(`${appBasePath}/`)) return path;
  return `${appBasePath}${path}`;
}

/** 手写的 fetch/EventSource 不会自动识别 Next basePath，因此在首屏前统一补前缀。 */
export function appBasePathRequestBootstrap(): string {
  if (!appBasePath) return "";
  return `(function(){var basePath=${JSON.stringify(appBasePath)};if(window.__piWebBasePathFetchPatched)return;window.__piWebBasePathFetchPatched=true;var originalFetch=window.fetch;window.fetch=function(input,init){if(typeof input==="string"&&(/^\\/api(?:[/?]|$)/).test(input))input=basePath+input;return originalFetch.call(this,input,init);};var OriginalEventSource=window.EventSource;if(OriginalEventSource){function PiWebEventSource(url,configuration){if(typeof url==="string"&&(/^\\/api(?:[/?]|$)/).test(url))url=basePath+url;return new OriginalEventSource(url,configuration);}PiWebEventSource.prototype=OriginalEventSource.prototype;Object.setPrototypeOf(PiWebEventSource,OriginalEventSource);window.EventSource=PiWebEventSource;}})();`;
}
