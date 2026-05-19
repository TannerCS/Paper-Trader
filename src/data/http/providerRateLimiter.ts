import { ProviderHttpError } from "./providerHttp";

type ProviderHost = "binanceus" | "coinbase" | "generic";

interface RateLimitProfile {
  minimumSpacingMilliseconds: number;
  cooldownStorageKey: string;
  defaultRateLimitCooldownMilliseconds: number;
  defaultBanCooldownMilliseconds: number;
}

const profiles: Record<ProviderHost, RateLimitProfile> = {
  binanceus: {
    minimumSpacingMilliseconds: 1500,
    cooldownStorageKey: "paper-trader.cooldown.binanceus",
    defaultRateLimitCooldownMilliseconds: 60_000,
    defaultBanCooldownMilliseconds: 15 * 60_000,
  },
  coinbase: {
    minimumSpacingMilliseconds: 1200,
    cooldownStorageKey: "paper-trader.cooldown.coinbase",
    defaultRateLimitCooldownMilliseconds: 30_000,
    defaultBanCooldownMilliseconds: 5 * 60_000,
  },
  generic: {
    minimumSpacingMilliseconds: 1500,
    cooldownStorageKey: "paper-trader.cooldown.generic",
    defaultRateLimitCooldownMilliseconds: 60_000,
    defaultBanCooldownMilliseconds: 10 * 60_000,
  },
};

const lastRequestAtByHost = new Map<ProviderHost, number>();
const queuedByHost = new Map<ProviderHost, Promise<unknown>>();

export async function runProviderRequest<ResponseBody>(
  url: string,
  request: () => Promise<ResponseBody>,
): Promise<ResponseBody> {
  const host = getProviderHost(url);
  const previousQueue = queuedByHost.get(host) ?? Promise.resolve();
  const queuedRequest = previousQueue
    .catch(() => undefined)
    .then(async () => {
      await waitForProviderSlot(host);

      try {
        return await request();
      } catch (error) {
        rememberProviderCooldown(host, error);
        throw error;
      }
    });

  queuedByHost.set(host, queuedRequest);
  return queuedRequest;
}

export function getProviderCooldownUntil(provider: ProviderHost) {
  const storedValue = globalThis.localStorage?.getItem(profiles[provider].cooldownStorageKey);
  const cooldownUntil = Number(storedValue);
  return Number.isFinite(cooldownUntil) ? cooldownUntil : 0;
}

async function waitForProviderSlot(host: ProviderHost) {
  const profile = profiles[host];
  const cooldownUntil = getProviderCooldownUntil(host);
  const now = Date.now();

  if (cooldownUntil > now) {
    throw new ProviderHttpError(`Provider is cooling down until ${new Date(cooldownUntil).toLocaleTimeString()}.`);
  }

  const lastRequestAt = lastRequestAtByHost.get(host) ?? 0;
  const earliestNextRequest = lastRequestAt + profile.minimumSpacingMilliseconds;
  const waitMilliseconds = Math.max(0, earliestNextRequest - now);

  if (waitMilliseconds > 0) {
    await delay(waitMilliseconds);
  }

  lastRequestAtByHost.set(host, Date.now());
}

function rememberProviderCooldown(host: ProviderHost, error: unknown) {
  const profile = profiles[host];
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = extractStatusCode(message);

  if (statusCode !== 418 && statusCode !== 429) {
    return;
  }

  const explicitTimestamp = extractFutureTimestamp(message);
  const cooldownUntil =
    explicitTimestamp ??
    Date.now() + (statusCode === 418 ? profile.defaultBanCooldownMilliseconds : profile.defaultRateLimitCooldownMilliseconds);
  globalThis.localStorage?.setItem(profile.cooldownStorageKey, String(cooldownUntil));
}

function extractStatusCode(message: string) {
  const match = message.match(/\b(418|429)\b/);
  return match ? Number(match[1]) : null;
}

function extractFutureTimestamp(message: string) {
  const match = message.match(/\b(1[0-9]{12,})\b/);

  if (!match) {
    return null;
  }

  const timestamp = Number(match[1]);
  return Number.isFinite(timestamp) && timestamp > Date.now() ? timestamp : null;
}

function getProviderHost(url: string): ProviderHost {
  try {
    const host = new URL(url).host;

    if (host.includes("binance.us")) return "binanceus";
    if (host.includes("coinbase.com")) return "coinbase";
  } catch {
    return "generic";
  }

  return "generic";
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
