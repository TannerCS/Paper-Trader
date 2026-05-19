import { invoke, isTauri } from "@tauri-apps/api/core";
import { runProviderRequest } from "./providerRateLimiter";

export interface ProviderHttpHeader {
  name: string;
  value: string;
}

export class ProviderHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export async function providerGetJson<ResponseBody>(
  url: string,
  headers: ProviderHttpHeader[] = [],
): Promise<ResponseBody> {
  return runProviderRequest(url, async () => {
    if (isTauri()) {
      return invoke<ResponseBody>("provider_get", { url, headers });
    }

    const response = await fetch(getBrowserProviderUrl(url), {
      headers: new Headers(headers.map((header) => [header.name, header.value])),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new ProviderHttpError(`Provider returned ${response.status}${details ? `: ${details}` : ""}`);
    }

    return (await response.json()) as ResponseBody;
  });
}

function getBrowserProviderUrl(url: string) {
  if (isLocalDevelopmentHost()) {
    return `/__paper_trader_provider_proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}

function isLocalDevelopmentHost() {
  const host = globalThis.location?.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
