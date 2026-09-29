type LiteLLMGatewayKey = "beijing" | "hefei";

const STORAGE_KEY = "lobsterai.bound-api-key.v1";

export interface BoundApiKey {
  apiKey: string;
  gateway?: LiteLLMGatewayKey;
}

function isGateway(value: unknown): value is LiteLLMGatewayKey {
  return value === "beijing" || value === "hefei";
}

export function loadBoundApiKey(): BoundApiKey | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const stored = JSON.parse(raw) as { apiKey?: unknown; gateway?: unknown };
    if (typeof stored.apiKey !== "string" || !stored.apiKey.trim()) {
      return null;
    }
    return {
      apiKey: stored.apiKey.trim(),
      gateway: isGateway(stored.gateway) ? stored.gateway : undefined
    };
  } catch {
    return null;
  }
}

export function saveBoundApiKey(apiKey: string, gateway?: LiteLLMGatewayKey): boolean {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    return false;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiKey: normalizedKey,
        gateway
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearBoundApiKey(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 浏览器禁用本地存储时，页面内仍可继续使用 API Key。
  }
}
