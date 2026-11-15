import { redirect } from "next/navigation";
import { extractText, getDocumentProxy } from "unpdf";
import { requireStaff } from "@/lib/auth";
import { suggestFromDeck } from "@/lib/brand";

/** Read a brand deck (PDF) and suggest colours and fonts from it. Nothing is saved here. */
export async function POST(req: Request) {
  await requireStaff();
  const fail = (m: string): never => redirect(`/admin/brand?error=${encodeURIComponent(m)}`);
  const file = (await req.formData()).get("deck");
  if (!(file instanceof File) || file.size === 0) return fail("Choose your brand guidelines file.");
  if (file.type !== "application/pdf") return fail("Upload the brand deck as a PDF. For other formats, set the colours and fonts below by hand.");
  if (file.size > 4_500_000) return fail("That PDF is over 4.5 MB. Save a smaller copy, or set the colours and fonts below by hand.");

  let text = "";
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    return fail("That PDF could not be opened.");
  }
  const s = suggestFromDeck(text);
  if (!s.hexes.length && !s.fontsFound.length) return fail("No colour codes or font names were found as text in that PDF. Set them below by hand.");
  const q = new URLSearchParams({ deck: file.name, hexes: s.hexes.join(","), fontsFound: s.fontsFound.join(","), ...s.colors, ...s.fonts });
  redirect(`/admin/brand?${q}`);
}
