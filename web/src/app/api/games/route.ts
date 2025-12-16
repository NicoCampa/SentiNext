import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Query too short")
    .max(60, "Query too long"),
});

type SteamSearchItem = {
  id: number;
  name: string;
  tiny_image?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get("q") || "" });
  if (!parsed.success) {
    return NextResponse.json({ items: [] });
  }

  const q = parsed.data.q;

  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`;

  let data: { items?: SteamSearchItem[] } = {};
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) {
      return NextResponse.json({ items: [] }, { status: res.status });
    }
    data = (await res.json()) as { items?: SteamSearchItem[] };
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const items = (data.items || []).slice(0, 8).map((item) => ({
    appId: item.id,
    name: item.name,
    image: item.tiny_image || null,
  }));

  return NextResponse.json({ items });
}
