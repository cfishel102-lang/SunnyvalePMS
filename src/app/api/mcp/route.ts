// A Model Context Protocol server (stateless, JSON over HTTP) so AI assistants
// can work with reservations using the same operations as the REST API.
import { BookingError, OPERATIONS, type OperationName } from "@/lib/api";
import { orgFromRequest } from "@/lib/auth";

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

async function dispatch(orgId: string, m: Rpc) {
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "campground-reservations", version: "1.0.0" },
        instructions: "Manage campground reservations. Check availability before creating a reservation. Dates are YYYY-MM-DD.",
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: Object.entries(OPERATIONS).map(([name, op]) => ({
          name, description: op.description, inputSchema: { type: "object", properties: op.input, required: op.required },
        })),
      };
    case "tools/call": {
      const name = String(m.params?.name) as OperationName;
      if (!(name in OPERATIONS)) throw { code: -32602, message: `Unknown tool: ${name}` };
      try {
        const out = await OPERATIONS[name].run(orgId, (m.params?.arguments ?? {}) as Record<string, unknown>);
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      } catch (e) {
        if (e instanceof BookingError) return { content: [{ type: "text", text: e.message }], isError: true };
        throw e;
      }
    }
    default:
      throw { code: -32601, message: `Method not found: ${m.method}` };
  }
}

export async function POST(req: Request) {
  const orgId = await orgFromRequest(req);
  if (!orgId) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Send your API key as: Authorization: Bearer <key>" } }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });

  const one = async (m: Rpc) => {
    if (m.id === undefined) return null; // notifications get no reply
    try {
      return { jsonrpc: "2.0", id: m.id, result: await dispatch(orgId, m) };
    } catch (e) {
      const err = e as { code?: number; message?: string };
      return { jsonrpc: "2.0", id: m.id, error: { code: err.code ?? -32603, message: err.code ? err.message : "Internal error" } };
    }
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await one(body);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

export function GET() {
  return new Response("This MCP server answers POST requests only.", { status: 405, headers: { allow: "POST" } });
}
