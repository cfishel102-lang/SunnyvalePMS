import { requireStaff } from "@/lib/auth";
import { isDateStr } from "@/lib/dates";
import { DIMENSIONS, runReport, toCsv, type Dimension } from "@/lib/reports";

export async function GET(req: Request) {
  const { property } = await requireStaff();
  const q = new URL(req.url).searchParams;
  const from = q.get("from"), to = q.get("to"), by = q.get("by") ?? "month";
  if (!isDateStr(from) || !isDateStr(to) || !(by in DIMENSIONS)) return new Response("Bad request", { status: 400 });
  const { rows } = await runReport(property.id, from, to, by as Dimension);
  return new Response(toCsv(rows, DIMENSIONS[by as Dimension].label), {
    headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${property.slug}-${by}-${from}-to-${to}.csv"` },
  });
}
