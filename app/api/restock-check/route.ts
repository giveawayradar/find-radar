import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

type Json = Record<string, unknown>;

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Web"; }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const raw = value.replace(/\u00a0/g, " ").match(/\d[\d\s.,]*/)?.[0];
  if (!raw) return undefined;
  let clean = raw.replace(/\s/g, "");
  const comma = clean.lastIndexOf(","), dot = clean.lastIndexOf(".");
  if (comma > dot) clean = clean.replace(/\./g, "").replace(",", ".");
  else if (dot > comma && comma >= 0) clean = clean.replace(/,/g, "");
  else if (comma >= 0) clean = clean.replace(",", ".");
  const n = Number(clean.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function currency(value: unknown) {
  const v = text(value).toUpperCase();
  if (v.includes("PLN") || v.includes("ZŁ")) return "PLN";
  if (v.includes("EUR") || v.includes("€")) return "EUR";
  if (v.includes("USD") || v.includes("$")) return "USD";
  if (v.includes("GBP") || v.includes("£")) return "GBP";
  return undefined;
}

function normalizeAvailability(value: unknown) {
  const v = text(value).toLowerCase();
  if (!v) return undefined;
  if (/outofstock|out_of_stock|out of stock|soldout|sold out|unavailable|brak w magazynie|niedostepn/.test(v)) return "Out of Stock";
  if (/instock|in_stock|in stock|available|dostepn|w magazynie/.test(v)) return "In Stock";
  return text(value).slice(0, 60) || undefined;
}

function collectJsonLd(html: string) {
  const blocks: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed); else blocks.push(parsed);
    } catch { /* malformed retailer metadata */ }
  }
  return blocks;
}

function flatten(nodes: unknown[]): Json[] {
  const out: Json[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const obj = node as Json;
    out.push(obj);
    if (Array.isArray(obj["@graph"])) (obj["@graph"] as unknown[]).forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) { const m = html.match(pattern); if (m) return m[1]; }
  return undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string };
    if (!body.url || !/^https?:\/\//i.test(body.url)) return NextResponse.json({ error: "Paste a valid product URL." }, { status: 400 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    try {
      response = await fetch(body.url, {
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FindRadar/1.0; +https://find-radar.vercel.app)",
          "accept-language": "pl-PL,pl;q=0.9,en;q=0.8",
        },
      });
    } finally { clearTimeout(timeout); }

    if (!response.ok) return NextResponse.json({ error: `Store returned ${response.status}. Try the exact product URL from another retailer.` }, { status: 422 });
    const html = await response.text();
    const nodes = flatten(collectJsonLd(html));
    const product = nodes.find((obj) => {
      const t = obj["@type"];
      return t === "Product" || (Array.isArray(t) && t.includes("Product"));
    });

    const offersRaw = product?.offers;
    const offer = Array.isArray(offersRaw) ? offersRaw.find((x) => x && typeof x === "object") as Json | undefined : (offersRaw && typeof offersRaw === "object" ? offersRaw as Json : undefined);

    const title = text(product?.name) || meta(html, "og:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const imageRaw = product?.image;
    const image = typeof imageRaw === "string" ? imageRaw : Array.isArray(imageRaw) ? text(imageRaw[0]) : meta(html, "og:image");
    const priceRaw = offer?.price ?? offer?.lowPrice ?? meta(html, "product:price:amount");
    const numericPrice = parseNumber(priceRaw);
    const curr = text(offer?.priceCurrency) || currency(meta(html, "product:price:currency")) || currency(String(priceRaw ?? ""));
    const availabilityRaw = offer?.availability ?? meta(html, "product:availability");
    let availability = normalizeAvailability(availabilityRaw);

    if (!availability) {
      const visible = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
      if (/out of stock|sold out|currently unavailable|brak w magazynie|produkt niedostepny|niedostępny/.test(visible)) availability = "Out of Stock";
      else if (/in stock|add to cart|dodaj do koszyka|w magazynie|dostępny|dostepny/.test(visible)) availability = "In Stock";
    }

    if (!title) return NextResponse.json({ error: "Radar could open this page but could not verify a product identity." }, { status: 422 });

    const price = numericPrice != null ? `${numericPrice.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} ${curr || ""}`.trim() : undefined;
    return NextResponse.json({ product: { title, url: response.url || body.url, source: host(response.url || body.url), price, numericPrice, currency: curr, availability: availability || "Unknown", image, verified: Boolean(product || meta(html, "og:title")) } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "The store took too long to respond." : error instanceof Error ? error.message : "Restock scan failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
