/**
 * Cached prompt config utility — fetches user prompt overrides from API
 * and provides them for AI call sites.
 */

interface PromptConfig {
  key: string;
  label: string;
  description: string;
  system_prompt: string;
  temperature: number;
  model_override: string | null;
  is_default: boolean;
}

let _cache: PromptConfig[] | null = null;
let _fetchPromise: Promise<PromptConfig[]> | null = null;

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,
  };
}

export async function fetchPromptConfigs(): Promise<PromptConfig[]> {
  if (_cache) return _cache;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch("/api/v1/prompt-configs", { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : []))
    .then((data: PromptConfig[]) => {
      _cache = data;
      _fetchPromise = null;
      return data;
    })
    .catch(() => {
      _fetchPromise = null;
      return [];
    });

  return _fetchPromise;
}

export function invalidatePromptCache(): void {
  _cache = null;
  _fetchPromise = null;
}

export async function getPromptOverrides(
  key: string
): Promise<{ system_prompt?: string; model_override?: string; temperature?: number }> {
  const configs = await fetchPromptConfigs();
  const config = configs.find((c) => c.key === key);
  if (!config || config.is_default) return {};
  return {
    system_prompt: config.system_prompt,
    ...(config.model_override ? { model_override: config.model_override } : {}),
    temperature: config.temperature,
  };
}
