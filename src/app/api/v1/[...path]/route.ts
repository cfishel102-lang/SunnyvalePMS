import { BookingError, OPERATIONS, type OperationName } from "@/lib/api";
import { orgFromRequest } from "@/lib/auth";

const json = (body: unknown, status = 200) => Response.json(body, { status });

function openapi(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [name, op] of Object.entries(OPERATIONS)) {
    const [method, path] = op.http;
    const inPath = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const props = Object.entries(op.input as Record<string, object>);
    const body = method === "POST" || method === "PATCH";
    (paths[path] ??= {})[method.toLowerCase()] = {
      operationId: name,
      summary: op.description,
      parameters: props.filter(([k]) => inPath.includes(k) || !body).map(([k, schema]) => ({
        name: k, in: inPath.includes(k) ? "path" : "query", required: inPath.includes(k) || (op.required as readonly string[]).includes(k), schema,
      })),
      ...(body ? { requestBody: { content: { "application/json": { schema: { type: "object", properties: Object.fromEntries(props.filter(([k]) => !inPath.includes(k))), required: op.required.filter((k) => !inPath.includes(k)) } } } } } : {}),
      responses: { 200: { description: "OK" }, 400: { description: "The request could not be carried out; see `error`." }, 401: { description: "Missing or invalid API key" } },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Campground reservations API", version: "1.0.0" },
    servers: [{ url: `${origin}/api/v1` }],
    components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer" } } },
    security: [{ apiKey: [] }],
    paths,
  };
}

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  if (path.join("/") === "openapi.json") return json(openapi(process.env.APP_URL || url.origin));

  const orgId = await orgFromRequest(req);
  if (!orgId) return json({ error: "Send your API key as: Authorization: Bearer <key>" }, 401);

  // Match "/reservations/ABC123" against "/reservations/{code}".
  for (const [name, op] of Object.entries(OPERATIONS)) {
    const [method, pattern] = op.http;
    const parts = pattern.split("/").filter(Boolean);
    if (method !== req.method || parts.length !== path.length) continue;
    if (!parts.every((p, i) => p.startsWith("{") || p === path[i])) continue;
    const args: Record<string, unknown> = Object.fromEntries(url.searchParams);
    if (method === "POST" || method === "PATCH") Object.assign(args, await req.json().catch(() => ({})));
    parts.forEach((p, i) => { if (p.startsWith("{")) args[p.slice(1, -1)] = path[i]; });
    try {
      return json({ data: await OPERATIONS[name as OperationName].run(orgId, args) });
    } catch (e) {
      if (e instanceof BookingError) return json({ error: e.message }, 400);
      throw e;
    }
  }
  return json({ error: "Not found" }, 404);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
