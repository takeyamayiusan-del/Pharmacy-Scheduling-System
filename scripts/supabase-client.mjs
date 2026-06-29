/**
 * Node.js 腳本用 Supabase client（相容 Node 24，走 CJS 載入）
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

export { createClient };
