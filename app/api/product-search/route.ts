import { NextResponse } from "next/server";

type Body = {
  query?: string;
  budget?: string;
  currency?: string;
  country?: string;
  condition?: string;
  mustHave?: string;
  exclude?: string;
  sources?: string[];
};

type Candidate = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  searchScore?: number;
};

type ProductResult = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  score: number;
  price?: string;
  numericPrice?: number;
  currency?: string;
  availability?: string;
  condition?: string;
  image?: string;
  brand?: string;
  verified: boolean;
  reasons: string[];
};

type StoreSearch = { source: string; url: string; label: string };

type JsonRecord = Record<string, unknown>;

const MARKET_DOMAINS = ["allegro.pl", "amazon.pl", "amazon.de", "ebay.pl", "ebay.com", "ceneo.pl"];
const STORE_DOMAINS = ["mediaexpert.pl", "mediamarkt.pl", "x-kom.pl", "euro.com.pl", "zalando.pl", "aboutyou.pl", "nike.com", "adidas.pl", "lego.com"];
const SECONDHAND_DOMAINS = ["olx.pl", "vinted.pl", "ebay.pl"];

const DIRECT_SEARCHES: Record<string, (q: string) => string> = {
  "allegro.pl": (q) => `https://allegro.pl/listing?string=${encodeURIComponent(q)}`,
  "amazon.pl": (q) => `https://www.amazon.pl/s?k=${encodeURIComponent(q)}`,
  "amazon.de": (q) => `https://www.amazon.de/s?k=${encodeURIComponent(q)}`,
  "ebay.pl": (q) => `https://www.ebay.pl/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  "ebay.com": (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  "ceneo.pl": (q) => `https://www.ceneo.pl/;szukaj-${encodeURIComponent(q)}`,
  "olx.pl": (q) => `https://www.olx.pl/oferty/q-${encodeURIComponent(q)}/`,
  "vinted.pl": (q) => `https://www.vinted.pl/catalog?search_text=${encodeURIComponent(q)}`,
  "mediaexpert.pl": (q) => `https://www.mediaexpert.pl/search?query[querystring]=${encodeURIComponent(q)}`,
  "mediamarkt.pl": (q) => `https://mediamarkt.pl/pl/search.html?query=${encodeURIComponent(q)}`,
  "x-kom.pl": (q) => `https://www.x-kom.pl/szukaj?q=${encodeURIComponent(q)}`,
  "euro.com.pl": (q) => `https://www.euro.com.pl/search.bhtml?keyword=${encodeURIComponent(q)}`,
  "zalando.pl": (q) => `https://www.zalando.pl/katalog/?q=${encodeURIComponent(q)}`,
  "aboutyou.pl": (q) => `https://www.aboutyou.pl/szukaj?term=${encodeURIComponent(q)}`,
  "nike.com": (q) => `https://www.nike.com/pl/w?q=${encodeURIComponent(q)}`,
  "adidas.pl": (q) => `https://www.adidas.pl/search?q=${encodeURIComponent(q)}`,
  "lego.com": (q) => `https://www.lego.com/pl-pl/search?q=${encodeURIComponent(q)}`,
};

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Web"; }
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function clean(value: string, max = 360) { return stripHtml(value).slice(0, max); }

function normalizeDuckUrl(raw: string) {
  const decoded = stripHtml(raw);
  try {
    const url = new URL(decoded, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    if (redirected) return decodeURIComponent(redirected);
    if (url.hostname.endsWith("duckduckgo.com")) return "";
    return url.toString();
  } catch { return decoded.startsWith("//") ? `https:${decoded}` : decoded; }
}

function parseNumber(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const cleaned = String(value).replace(/\s/g, "").replace(/[^0-9,.-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function budget(body: Body) { const n = parseNumber(body.budget); return n && n > 0 ? n : null; }

function tokens(value?: string) {
  return [...new Set((value || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 2))];
}

function phrases(value?: string) {
  return (value || "").toLowerCase().split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
}

function chosenDomains(body: Body) {
  const sources = Array.isArray(body.sources) ? body.sources : [];
  const domains = [
    ...(sources.includes("marketplaces") ? MARKET_DOMAINS : []),
    ...(sources.includes("stores") ? STORE_DOMAINS : []),
    ...(sources.includes("secondhand") ? SECONDHAND_DOMAINS : []),
  ];
  return [...new Set(domains.length ? domains : [...MARKET_DOMAINS, ...STORE_DOMAINS])];
}

function buildSearchPhrase(body: Body) {
  return [body.query?.trim(), body.mustHave?.trim(), body.condition === "New only" ? "new" : body.condition === "Used only" ? "used" : ""]
    .filter(Boolean).join(" ");
}

function buildStoreSearches(body: Body, domains: string[]): StoreSearch[] {
  const q = [body.query, body.mustHave].filter(Boolean).join(" ").trim();
  return domains.filter((d) => DIRECT_SEARCHES[d]).slice(0, 12).map((source) => ({
    source,
    url: DIRECT_SEARCHES[source](q),
    label: `Search ${source}`,
  }));
}

function isLikelyNonProduct(url: string, title: string) {
  const u = url.toLowerCase();
  const t = title.toLowerCase();
  const badUrl = ["/search", "/szukaj", "/listing?", "/sch/", "/catalog?", "/katalog", "/category", "/blog", "/news", "/guide", "/poradnik"];
  const badTitle = ["search results", "wyniki wyszukiwania", "category", "kategoria", "poradnik", "review", "recenzja"];
  return badUrl.some((x) => u.includes(x)) || badTitle.some((x) => t.includes(x));
}

function parseDuckResults(html: string): Candidate[] {
  const out: Candidate[] = [];
  const links = [...html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const m of links) {
    const url = normalizeDuckUrl(m[1]);
    const title = clean(m[2], 220);
    if (!url || !title || !/^https?:\/\//i.test(url)) continue;
    const pos = html.indexOf(m[0]);
    const neighborhood = pos >= 0 ? html.slice(pos, pos + 1800) : "";
    const sm = neighborhood.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    out.push({ title, url, source: host(url), snippet: clean(sm?.[1] || "Product listing discovered on the web.") });
  }
  if (!out.length) {
    const lite = [...html.matchAll(/<a[^>]+(?:class=["']result-link["']|rel=["']nofollow["'])[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of lite) {
      const url = normalizeDuckUrl(m[1]); const title = clean(m[2], 220);
      if (url && title && /^https?:\/\//i.test(url)) out.push({ title, url, source: host(url), snippet: "Product listing discovered on the web." });
    }
  }
  return out;
}

async function duckSearch(body: Body, domains: string[]): Promise<Candidate[]> {
  const phrase = buildSearchPhrase(body);
  const groups: string[][] = [];
  for (let i = 0; i < domains.length; i += 4) groups.push(domains.slice(i, i + 4));
  const region = body.country === "Poland" ? "pl-pl" : body.country === "United Kingdom" ? "uk-en" : body.country === "United States" ? "us-en" : "wt-wt";
  const queries = groups.slice(0, 5).map((group) => `${phrase} ${group.map((d) => `site:${d}`).join(" OR ")}`);
  const settled = await Promise.allSettled(queries.map(async (query) => {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${region}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FindRadar/1.0)", Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error(String(response.status));
    return parseDuckResults(await response.text());
  }));
  return settled.flatMap((r) => r.status === "fulfilled" ? r.value : []);
}

async function tavilySearch(body: Body, domains: string[], apiKey: string): Promise<Candidate[]> {
  const constraints = [body.mustHave && `must include ${body.mustHave}`, body.budget && `under ${body.budget} ${body.currency}`, body.condition, body.country].filter(Boolean).join(", ");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ api_key: apiKey, query: `${body.query}. ${constraints}. Specific product pages for sale only.`, search_depth: "advanced", max_results: 20, include_answer: false, include_raw_content: false, include_images: false, include_domains: domains }),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const data = await response.json();
  return (Array.isArray(data.results) ? data.results : []).filter((r: JsonRecord) => r.url && r.title).map((r: JsonRecord) => ({
    title: clean(String(r.title), 220), url: String(r.url), source: host(String(r.url)), snippet: clean(String(r.content || "Product listing discovered on the web.")), searchScore: typeof r.score === "number" ? r.score : undefined,
  }));
}

function findProducts(value: unknown, found: JsonRecord[] = []): JsonRecord[] {
  if (!value) return found;
  if (Array.isArray(value)) { for (const item of value) findProducts(item, found); return found; }
  if (typeof value !== "object") return found;
  const obj = value as JsonRecord;
  const type = obj["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) found.push(obj);
  for (const child of Object.values(obj)) if (child && typeof child === "object") findProducts(child, found);
  return found;
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function offerFrom(product: JsonRecord) {
  const raw = product.offers;
  if (Array.isArray(raw)) return raw.find((x) => x && typeof x === "object") as JsonRecord | undefined;
  return raw && typeof raw === "object" ? raw as JsonRecord : undefined;
}

function imageFrom(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) return value.map(imageFrom).find(Boolean);
  if (value && typeof value === "object") return imageFrom((value as JsonRecord).url || (value as JsonRecord).contentUrl);
  return undefined;
}

function normalizeAvailability(value?: string) {
  if (!value) return undefined;
  const tail = value.split(/[\/#]/).pop() || value;
  return tail.replace(/([a-z])([A-Z])/g, "$1 $2");
}

async function enrich(candidate: Candidate, body: Body): Promise<ProductResult | null> {
  if (isLikelyNonProduct(candidate.url, candidate.title)) return null;
  let html = "";
  try {
    const response = await fetch(candidate.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FindRadar/1.0)", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return null;
    html = await response.text();
  } catch { return null; }

  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: JsonRecord[] = [];
  for (const script of scripts) {
    try { findProducts(JSON.parse(script[1]), products); } catch { /* malformed JSON-LD */ }
  }

  const product = products[0];
  const offer = product ? offerFrom(product) : undefined;
  const metaTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metaDescription = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const metaImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const itempropPrice = html.match(/(?:itemprop=["']price["'][^>]+content=["']([^"']+)|content=["']([^"']+)["'][^>]+itemprop=["']price["'])/i);
  const itempropCurrency = html.match(/(?:itemprop=["']priceCurrency["'][^>]+content=["']([^"']+)|content=["']([^"']+)["'][^>]+itemprop=["']priceCurrency["'])/i);

  const title = clean(asText(product?.name) || metaTitle || candidate.title, 220);
  const description = clean(asText(product?.description) || metaDescription || candidate.snippet, 320);
  const rawPrice = asText(offer?.price) || asText(offer?.lowPrice) || itempropPrice?.[1] || itempropPrice?.[2];
  const numericPrice = parseNumber(rawPrice);
  const currency = asText(offer?.priceCurrency) || itempropCurrency?.[1] || itempropCurrency?.[2] || body.currency || undefined;
  const availability = normalizeAvailability(asText(offer?.availability));
  const itemCondition = normalizeAvailability(asText(offer?.itemCondition));
  const brandObj = product?.brand;
  const brand = asText(brandObj) || (brandObj && typeof brandObj === "object" ? asText((brandObj as JsonRecord).name) : undefined);
  const image = imageFrom(product?.image) || (metaImage && /^https?:\/\//.test(metaImage) ? metaImage : undefined);

  const hay = `${title} ${description} ${brand || ""}`.toLowerCase();
  const queryTokens = tokens(body.query);
  const must = phrases(body.mustHave);
  const exclude = phrases(body.exclude);
  const excludedHit = exclude.find((x) => hay.includes(x));
  if (excludedHit) return null;

  const tokenHits = queryTokens.filter((x) => hay.includes(x));
  const mustHits = must.filter((x) => x.split(/\s+/).every((part) => hay.includes(part)));
  const reasons: string[] = [];
  let score = 35;

  if (queryTokens.length) {
    const ratio = tokenHits.length / queryTokens.length;
    score += Math.round(ratio * 30);
    if (ratio >= 0.75) reasons.push("Strong title/spec match");
  }
  if (must.length) {
    const ratio = mustHits.length / must.length;
    score += Math.round(ratio * 18);
    if (ratio === 1) reasons.push("All must-haves detected");
  }

  const maxBudget = budget(body);
  if (maxBudget && numericPrice !== null) {
    if (numericPrice <= maxBudget) { score += 12; reasons.push("Within budget"); }
    else { score -= 30; reasons.push("Over budget"); }
  }

  const availabilityLower = (availability || "").toLowerCase();
  if (/instock|in stock|limitedavailability/.test(availabilityLower.replace(/\s/g, "")) || /in stock/i.test(availability || "")) {
    score += 5; reasons.push("In stock");
  }

  const conditionWanted = body.condition || "Any";
  const conditionHay = `${itemCondition || ""} ${hay}`.toLowerCase();
  if (conditionWanted === "New only") {
    if (/newcondition|\bnew\b|nowy|nowa|nowe/.test(conditionHay)) { score += 5; reasons.push("New condition"); }
    else if (/usedcondition|\bused\b|używan/.test(conditionHay)) return null;
  }
  if (conditionWanted === "Used only") {
    if (/usedcondition|\bused\b|używan/.test(conditionHay)) { score += 5; reasons.push("Used condition"); }
    else if (/newcondition|\bnew\b|nowy|nowa|nowe/.test(conditionHay)) return null;
  }

  const verified = Boolean(product || (numericPrice !== null && metaTitle));
  if (!verified) return null;
  score = Math.max(1, Math.min(99, score));

  return {
    title, url: candidate.url, source: candidate.source, snippet: description || "Verified product page.", score,
    price: numericPrice !== null ? `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(numericPrice)} ${currency || ""}`.trim() : undefined,
    numericPrice: numericPrice ?? undefined, currency, availability, condition: itemCondition, image, brand, verified, reasons: reasons.slice(0, 4),
  };
}

function dedupeCandidates(candidates: Candidate[], domains: string[]) {
  const allowed = new Set(domains);
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const h = host(c.url);
    if (!allowed.has(h) && ![...allowed].some((d) => h.endsWith(`.${d}`))) return false;
    const key = c.url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid search request." }, { status: 400 }); }
  if (!body.query?.trim()) return NextResponse.json({ error: "Describe a product first." }, { status: 400 });

  const domains = chosenDomains(body);
  const candidates: Candidate[] = [];
  const providers: string[] = [];
  const apiKey = process.env.TAVILY_API_KEY;

  if (apiKey) {
    try { candidates.push(...await tavilySearch(body, domains, apiKey)); providers.push("Tavily"); } catch { /* fall through */ }
  }
  try { candidates.push(...await duckSearch(body, domains)); providers.push("web"); } catch { /* store links still available */ }

  const unique = dedupeCandidates(candidates, domains).filter((c) => !isLikelyNonProduct(c.url, c.title)).slice(0, 18);
  const enrichedSettled = await Promise.allSettled(unique.map((c) => enrich(c, body)));
  const matches = enrichedSettled
    .flatMap((r) => r.status === "fulfilled" && r.value ? [r.value] : [])
    .sort((a, b) => {
      const max = budget(body);
      if (max) {
        const aOver = a.numericPrice !== undefined && a.numericPrice > max;
        const bOver = b.numericPrice !== undefined && b.numericPrice > max;
        if (aOver !== bOver) return aOver ? 1 : -1;
      }
      return b.score - a.score;
    })
    .slice(0, 12);

  return NextResponse.json({
    results: matches,
    storeSearches: buildStoreSearches(body, domains),
    provider: providers.length ? providers.join("+") : "store-direct",
    verifiedCount: matches.length,
  });
}
