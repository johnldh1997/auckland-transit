const BASE_URL = 'https://api.at.govt.nz';

function getSubscriptionKey(): string {
  return process.env.EXPO_PUBLIC_AT_API_KEY ?? '';
}

export function hasApiKey(): boolean {
  return getSubscriptionKey().length > 0;
}

export async function atFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': getSubscriptionKey() },
  });

  if (!response.ok) {
    throw new Error(`AT API error ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}
