import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const providerProxyPath = "/__paper_trader_provider_proxy";
const allowedProviderHosts = new Set([
  "api.binance.us",
  "api.coinbase.com",
  "www.okx.com",
  "api.mexc.com",
  "api.bybit.com",
  "api.phemex.com",
]);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [providerProxyPlugin(), react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setupTests.ts",
    css: true,
  },
}));

function providerProxyPlugin() {
  return {
    name: "paper-trader-provider-proxy",
    configureServer(server) {
      server.middlewares.use(providerProxyPath, async (request, response) => {
        try {
          const requestUrl = new URL(request.url ?? "", "http://localhost");
          const providerUrl = requestUrl.searchParams.get("url");

          if (!providerUrl) {
            sendJson(response, 400, { error: "Missing provider URL." });
            return;
          }

          const parsedProviderUrl = new URL(providerUrl);

          if (!allowedProviderHosts.has(parsedProviderUrl.host)) {
            sendJson(response, 403, { error: `Provider host is not allowed: ${parsedProviderUrl.host}` });
            return;
          }

          const providerResponse = await fetch(parsedProviderUrl, {
            headers: {
              accept: "application/json",
              "user-agent": "Paper Trader local dev proxy",
            },
          });
          const body = await providerResponse.text();

          response.statusCode = providerResponse.status;
          response.setHeader("content-type", providerResponse.headers.get("content-type") ?? "application/json");
          response.end(body);
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : "Provider proxy failed." });
        }
      });
    },
  };
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}
