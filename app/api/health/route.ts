export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 輕量探測用：保活打外網窗口，不要走整頁 /login。 */
export function GET() {
  return new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
