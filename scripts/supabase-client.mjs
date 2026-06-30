/**
 * Node.js 腳本用 Supabase client
 * - Node 22+：原生 WebSocket
 * - Node 20：使用 ws transport（需安裝 ws 套件）
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");

let wsTransport;
try {
  wsTransport = require("ws");
} catch {
  wsTransport = undefined;
}

function createClient(url, key, options = {}) {
  const clientOptions = { ...options };

  // Supabase Realtime on Node <22 needs an explicit WebSocket transport.
  if (wsTransport) {
    clientOptions.realtime = {
      ...(clientOptions.realtime || {}),
      transport: wsTransport,
    };
  }

  return createSupabaseClient(url, key, clientOptions);
}

export { createClient };
