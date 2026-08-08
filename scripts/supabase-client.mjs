/**
 * Node.js 腳本用 Supabase client
 * - Node 22+：原生 WebSocket
 * - Node 20：必須安裝 ws，並以 transport 傳入
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");

const major = Number(process.versions.node.split(".")[0]);
const needsWsTransport = Number.isFinite(major) && major < 22;

let wsTransport;
try {
  wsTransport = require("ws");
} catch {
  wsTransport = undefined;
}

if (needsWsTransport && !wsTransport) {
  console.error(
    "錯誤：Node.js < 22 執行腳本需要 ws 套件。請在專案目錄執行：npm install ws"
  );
  process.exit(1);
}

function createClient(url, key, options = {}) {
  const clientOptions = { ...options };

  if (wsTransport) {
    clientOptions.realtime = {
      ...(clientOptions.realtime || {}),
      transport: wsTransport,
    };
  }

  return createSupabaseClient(url, key, clientOptions);
}

export { createClient };
