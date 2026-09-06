import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

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

type EvidenceLevel = "page" | "listing" | "search";

type Candidate = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  priceText?: string;
  numericPrice?: number;
  currency?: string;
  image?: string;
  discoveredBy: string[];
  evidence: EvidenceLevel;
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
  evidence: EvidenceLevel;
  evidenceLabel: string;
  reasons: string[];
  discoveredBy: string[];
};

type StoreSearch = { source: string; url: string; label: string };
type JsonRecord = Record<string, unknown>;

type StoreAdapter = {
  domain: string;
  kind: "stores" | "marketplaces" | "secondhand";
  priority: number;
  search: (q: string) => string;
};

const STORE_ADAPTERS: StoreAdapter[] = [
  { domain: "ceneo.pl", kind: "marketplaces", priority: 100, search: (q) => `https://www.ceneo.pl/;szukaj-${encodeURIComponent(q).replace(/%20/g, "+")}` },
  { domain: "allegro.pl", kind: "marketplaces", priority: 98, search: (q) => `https://allegro.pl/listing?string=${encodeURIComponent(q)}` },
  { domain: "x-kom.pl", kind: "stores", priority: 95, search: (q) => `https://www.x-kom.pl/szukaj?q=${encodeURIComponent(q)}` },
  { domain: "mediaexpert.pl", kind: "stores", priority: 94, search: (q) => `https://www.mediaexpert.pl/search?query[querystring]=${encodeURIComponent(q)}` },
  { domain: "euro.com.pl", kind: "stores", priority: 93, search: (q) => `https://www.euro.com.pl/search.bhtml?keyword=${encodeURIComponent(q)}` },
  { domain: "mediamarkt.pl", kind: "stores", priority: 92, search: (q) => `https://mediamarkt.pl/pl/search.html?query=${encodeURIComponent(q)}` },
  { domain: "amazon.pl", kind: "marketplaces", priority: 88, search: (q) => `https://www.amazon.pl/s?k=${encodeURIComponent(q)}` },
  { domain: "amazon.de", kind: "marketplaces", priority: 85, search: (q) => `https://www.amazon.de/s?k=${encodeURIComponent(q)}` },
  { domain: "ebay.pl", kind: "marketplaces", priority: 82, search: (q) => `https://www.ebay.pl/sch/i.html?_nkw=${encodeURIComponent(q)}` },
  { domain: "ebay.com", kind: "marketplaces", priority: 78, search: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}` },
  { domain: "olx.pl", kind: "secondhand", priority: 80, search: (q) => `https://www.olx.pl/oferty/q-${encodeURIComponent(q)}/` },
  { domain: "vinted.pl", kind: "secondhand", priority: 75, search: (q) => `https://www.vinted.pl/catalog?search_text=${encodeURIComponent(q)}` },
  { domain: "zalando.pl", kind: "stores", priority: 72, search: (q) => `https://www.zalando.pl/katalog/?q=${encodeURIComponent(q)}` },
  { domain: "aboutyou.pl", kind: "stores", priority: 70, search: (q) => `https://www.aboutyou.pl/szukaj?term=${encodeURIComponent(q)}` },
  { domain: "nike.com", kind: "stores", priority: 68, search: (q) => `https://www.nike.com/pl/w?q=${encodeURIComponent(q)}` },
  { domain: "adidas.pl", kind: "stores", priority: 68, search: (q) => `https://www.adidas.pl/search?q=${encodeURIComponent(q)}` },
  { domain: "lego.com", kind: "stores", priority: 70, search: (q) => `https://www.lego.com/pl-pl/search?q=${encodeURIComponent(q)}` },
];

const GENERIC_BAD_PATHS = ["/search", "/szukaj", "/listing?", "/sch/", "/catalog?", "/katalog", "/category", "/blog", "/news", "/guide", "/poradnik"];
const GENERIC_BAD_TITLES = ["search results", "wyniki wyszukiwania", "category", "kategoria", "poradnik", "review", "recenzja", "lista produktów"];

function host(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Web"; }
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(value: string) {
  return htmlDecode(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
}

function clean(value: string, max = 360) { return stripHtml(value).slice(0, max); }

function parseNumber(value?: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  let text = String(value).replace(/\u00a0/g, " ").trim();
  const matches = text.match(/\d[\d\s.,]*/g);
  if (!matches?.length) return null;
  text = matches[0].replace(/\s/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
  else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
  else if (comma >= 0) text = text.replace(",", ".");
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function detectCurrency(text?: string) {
  if (!text) return undefined;
  if (/\bPLN\b|\bzł\b|zlot/i.test(text)) return "PLN";
  if (/€|\bEUR\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  return undefined;
}

function extractPrice(text?: string) {
  if (!text) return {} as { priceText?: string; numericPrice?: number; currency?: string };
  const patterns = [
    /(\d[\d\s.,]{0,12})\s*(zł|PLN)\b/i,
    /(\d[\d\s.,]{0,12})\s*(€|EUR)\b/i,
    /(\d[\d\s.,]{0,12})\s*(\$|USD)\b/i,
    /(\d[\d\s.,]{0,12})\s*(£|GBP)\b/i,
    /(zł|PLN|€|EUR|\$|USD|£|GBP)\s*(\d[\d\s.,]{0,12})/i,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    const raw = /^\d/.test(m[1]) ? `${m[1]} ${m[2]}` : `${m[2]} ${m[1]}`;
    const n = parseNumber(raw);
    if (n !== null) return { priceText: raw.replace(/\s+/g, " ").trim(), numericPrice: n, currency: detectCurrency(raw) };
  }
  return {};
}

function budget(body: Body) { const n = parseNumber(body.budget); return n && n > 0 ? n : null; }

function tokens(value?: string) {
  const stop = new Set(["the","and","with","under","new","only","preferably","for","from","black","white","used","condition","zł","pln","eur","usd","nowy","nowa","nowe","do","pod"]);
  return [...new Set((value || "").toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((x) => x.length > 2 && !stop.has(x)))];
}

function phrases(value?: string) {
  return (value || "").toLowerCase().split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
}

function canonicalQuery(body: Body) {
  let q = (body.query || "").trim();
  q = q
    .replace(/\b(?:under|below|max(?:imum)?|do|poniżej)\s*\d[\d\s.,]*\s*(?:zł|pln|eur|€|usd|\$|gbp|£)?\b/gi, " ")
    .replace(/\b(?:new only|used only|new|used|nowy|nowa|nowe|używany|używana|używane)\b/gi, " ")
    .replace(/\s+/g, " ").replace(/^[,;\s]+|[,;\s]+$/g, "");
  const must = phrases(body.mustHave).filter((p) => !q.toLowerCase().includes(p));
  return [q, ...must].filter(Boolean).join(" ").trim();
}

function chosenAdapters(body: Body) {
  const selected = new Set(Array.isArray(body.sources) && body.sources.length ? body.sources : ["stores", "marketplaces"]);
  return STORE_ADAPTERS.filter((adapter) => selected.has(adapter.kind)).sort((a, b) => b.priority - a.priority);
}

function buildStoreSearches(body: Body, adapters: StoreAdapter[]): StoreSearch[] {
  const q = canonicalQuery(body);
  return adapters.slice(0, 12).map((adapter) => ({ source: adapter.domain, url: adapter.search(q), label: `Search ${adapter.domain}` }));
}

function normalizeUrl(raw: string, base?: string) {
  try {
    const decoded = htmlDecode(raw);
    const url = new URL(decoded, base);
    const redirected = url.searchParams.get("uddg") || url.searchParams.get("u") || url.searchParams.get("url");
    if (redirected && /duckduckgo|bing/i.test(url.hostname)) {
      try { return decodeURIComponent(redirected); } catch { return redirected; }
    }
    url.hash = "";
    ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","fbclid"].forEach((k) => url.searchParams.delete(k));
    return url.toString();
  } catch { return ""; }
}

function isAllowedHost(url: string, adapters: StoreAdapter[]) {
  const h = host(url);
  return adapters.some((a) => h === a.domain || h.endsWith(`.${a.domain}`));
}

function isLikelyNonProduct(url: string, title: string) {
  const u = url.toLowerCase();
  const t = title.toLowerCase();
  return GENERIC_BAD_PATHS.some((x) => u.includes(x)) || GENERIC_BAD_TITLES.some((x) => t.includes(x));
}

function queryFit(title: string, snippet: string, body: Body) {
  const hay = `${title} ${snippet}`.toLowerCase();
  const qTokens = tokens(canonicalQuery(body));
  if (!qTokens.length) return 0;
  return qTokens.filter((t) => hay.includes(t)).length / qTokens.length;
}

async function fetchHtml(url: string, timeoutMs = 5000) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.7",
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html") && !type.includes("application/xhtml")) throw new Error("not-html");
  return { html: await response.text(), url: response.url || url };
}

function parseDuckResults(html: string, body: Body): Candidate[] {
  const out: Candidate[] = [];
  const links = [...html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const m of links) {
    const url = normalizeUrl(m[1], "https://duckduckgo.com");
    const title = clean(m[2], 220);
    if (!url || !title || !/^https?:\/\//i.test(url)) continue;
    const pos = html.indexOf(m[0]);
    const neighborhood = pos >= 0 ? html.slice(pos, pos + 2200) : "";
    const sm = neighborhood.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    const snippet = clean(sm?.[1] || "Product listing discovered in search.");
    const price = extractPrice(`${title} ${snippet}`);
    out.push({ title, url, source: host(url), snippet, ...price, discoveredBy: ["DuckDuckGo"], evidence: "search" });
  }
  return out.filter((c) => queryFit(c.title, c.snippet, body) >= 0.34);
}

function parseBingResults(html: string, body: Body): Candidate[] {
  const out: Candidate[] = [];
  const blocks = [...html.matchAll(/<li class=["']b_algo["'][\s\S]*?<h2><a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<\/li>/gi)];
  for (const m of blocks) {
    const url = normalizeUrl(m[1]);
    const title = clean(m[2], 220);
    const snippetMatch = m[3].match(/<p>([\s\S]*?)<\/p>/i);
    const snippet = clean(snippetMatch?.[1] || m[3], 340);
    if (!url || !title) continue;
    const price = extractPrice(`${title} ${snippet}`);
    out.push({ title, url, source: host(url), snippet, ...price, discoveredBy: ["Bing"], evidence: "search" });
  }
  return out.filter((c) => queryFit(c.title, c.snippet, body) >= 0.34);
}

function parseMojeekResults(html: string, body: Body): Candidate[] {
  const out: Candidate[] = [];
  const blocks = [...html.matchAll(/<li[^>]+class=["'][^"']*result[^"']*["'][\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/li>/gi)];
  for (const m of blocks) {
    const url = normalizeUrl(m[1]);
    const title = clean(m[2], 220);
    const snippet = clean(m[3], 340);
    if (!url || !title || !/^https?:\/\//i.test(url)) continue;
    const price = extractPrice(`${title} ${snippet}`);
    out.push({ title, url, source: host(url), snippet, ...price, discoveredBy: ["Mojeek"], evidence: "search" });
  }
  return out.filter((c) => queryFit(c.title, c.snippet, body) >= 0.34);
}

async function webDiscovery(body: Body, adapters: StoreAdapter[]) {
  const q = canonicalQuery(body);
  const domains = adapters.map((a) => a.domain);
  const siteClause = domains.slice(0, 12).map((d) => `site:${d}`).join(" OR ");
  const query = `${q} ${siteClause}`;
  const locale = body.country === "Poland" ? "pl-PL" : "en-US";
  const searches = [
    (async () => { const { html } = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${body.country === "Poland" ? "pl-pl" : "wt-wt"}`, 5200); return parseDuckResults(html, body); })(),
    (async () => { const { html } = await fetchHtml(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=${locale}&count=25`, 5200); return parseBingResults(html, body); })(),
    (async () => { const { html } = await fetchHtml(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, 5200); return parseMojeekResults(html, body); })(),
  ];
  const settled = await Promise.allSettled(searches);
  return settled.flatMap((r) => r.status === "fulfilled" ? r.value : []).filter((c) => isAllowedHost(c.url, adapters));
}

function anchorCandidates(html: string, searchUrl: string, adapter: StoreAdapter, body: Body): Candidate[] {
  const out: Candidate[] = [];
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const url = normalizeUrl(match[1], searchUrl);
    if (!url || host(url) !== adapter.domain && !host(url).endsWith(`.${adapter.domain}`)) continue;
    const title = clean(match[2], 220);
    if (title.length < 5 || isLikelyNonProduct(url, title)) continue;
    const fit = queryFit(title, "", body);
    if (fit < 0.34) continue;
    const idx = html.indexOf(match[0]);
    const nearby = idx >= 0 ? clean(html.slice(Math.max(0, idx - 650), idx + match[0].length + 1000), 520) : "";
    const price = extractPrice(`${title} ${nearby}`);
    out.push({ title, url, source: adapter.domain, snippet: nearby || "Listing found directly on the store search page.", ...price, discoveredBy: [`${adapter.domain} search`], evidence: "listing" });
  }
  return out.slice(0, 8);
}

function jsonLdListingCandidates(html: string, searchUrl: string, adapter: StoreAdapter, body: Body): Candidate[] {
  const out: Candidate[] = [];
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const script of scripts) {
    try {
      const data = JSON.parse(script[1]);
      const queue: unknown[] = [data];
      while (queue.length) {
        const current = queue.pop();
        if (Array.isArray(current)) { queue.push(...current); continue; }
        if (!current || typeof current !== "object") continue;
        const obj = current as JsonRecord;
        const type = obj["@type"];
        const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
        const isListItem = type === "ListItem" || (Array.isArray(type) && type.includes("ListItem"));
        if (isProduct || isListItem) {
          const item = (obj.item && typeof obj.item === "object" ? obj.item as JsonRecord : obj);
          const title = asText(item.name) || asText(obj.name);
          const rawUrl = asText(item.url) || asText(obj.url);
          if (title && rawUrl) {
            const url = normalizeUrl(rawUrl, searchUrl);
            if (url && isAllowedHost(url, [adapter]) && queryFit(title, "", body) >= 0.3) {
              const offer = offerFrom(item);
              const rawPrice = asText(offer?.price) || asText(offer?.lowPrice);
              const numericPrice = parseNumber(rawPrice);
              const currency = asText(offer?.priceCurrency) || detectCurrency(rawPrice);
              out.push({ title: clean(title, 220), url, source: adapter.domain, snippet: "Listing discovered from structured store data.", priceText: rawPrice, numericPrice: numericPrice ?? undefined, currency, image: imageFrom(item.image), discoveredBy: [`${adapter.domain} structured search`], evidence: "listing" });
            }
          }
        }
        for (const child of Object.values(obj)) if (child && typeof child === "object") queue.push(child);
      }
    } catch { /* malformed JSON-LD */ }
  }
  return out.slice(0, 8);
}

async function directStoreDiscovery(body: Body, adapters: StoreAdapter[]) {
  const q = canonicalQuery(body);
  // High-value adapters first; enough coverage without turning a scan into a 30-second crawl.
  const selected = adapters.slice(0, 8);
  const settled = await Promise.allSettled(selected.map(async (adapter) => {
    const searchUrl = adapter.search(q);
    const { html } = await fetchHtml(searchUrl, 4800);
    const json = jsonLdListingCandidates(html, searchUrl, adapter, body);
    const anchors = anchorCandidates(html, searchUrl, adapter, body);
    return [...json, ...anchors];
  }));
  return settled.flatMap((r) => r.status === "fulfilled" ? r.value : []);
}

async function tavilySearch(body: Body, adapters: StoreAdapter[], apiKey: string): Promise<Candidate[]> {
  const domains = adapters.map((a) => a.domain);
  const constraints = [body.mustHave && `must include ${body.mustHave}`, body.budget && `under ${body.budget} ${body.currency}`, body.condition, body.country].filter(Boolean).join(", ");
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ api_key: apiKey, query: `${canonicalQuery(body)}. ${constraints}. Actual purchasable product listing pages only.`, search_depth: "advanced", max_results: 24, include_answer: false, include_raw_content: false, include_images: false, include_domains: domains }),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const data = await response.json();
  return (Array.isArray(data.results) ? data.results : []).filter((r: JsonRecord) => r.url && r.title).map((r: JsonRecord) => {
    const title = clean(String(r.title), 220);
    const snippet = clean(String(r.content || "Product listing discovered on the web."));
    return { title, url: String(r.url), source: host(String(r.url)), snippet, ...extractPrice(`${title} ${snippet}`), discoveredBy: ["Tavily"], evidence: "search" as EvidenceLevel };
  }).filter((c: Candidate) => isAllowedHost(c.url, adapters));
}

function mergeCandidates(candidates: Candidate[], adapters: StoreAdapter[]) {
  const map = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!candidate.url || !candidate.title || !isAllowedHost(candidate.url, adapters)) continue;
    const key = candidate.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    const current = map.get(key);
    if (!current) { map.set(key, candidate); continue; }
    const evidenceRank = { search: 1, listing: 2, page: 3 };
    map.set(key, {
      ...(evidenceRank[candidate.evidence] > evidenceRank[current.evidence] ? candidate : current),
      discoveredBy: [...new Set([...current.discoveredBy, ...candidate.discoveredBy])],
      priceText: candidate.priceText || current.priceText,
      numericPrice: candidate.numericPrice ?? current.numericPrice,
      currency: candidate.currency || current.currency,
      image: candidate.image || current.image,
      snippet: current.snippet.length >= candidate.snippet.length ? current.snippet : candidate.snippet,
    });
  }
  return [...map.values()]
    .filter((c) => !isLikelyNonProduct(c.url, c.title))
    .sort((a, b) => (b.discoveredBy.length - a.discoveredBy.length) || ((b.numericPrice !== undefined ? 1 : 0) - (a.numericPrice !== undefined ? 1 : 0)))
    .slice(0, 28);
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

function offerFrom(product?: JsonRecord) {
  if (!product) return undefined;
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

function metaContent(html: string, keys: string[]) {
  for (const key of keys) {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`, "i"));
    if (a?.[1]) return htmlDecode(a[1]);
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i"));
    if (b?.[1]) return htmlDecode(b[1]);
  }
  return undefined;
}

function scoreProduct(base: Candidate, body: Body, details: { title:string; description:string; numericPrice?:number; currency?:string; availability?:string; condition?:string; brand?:string }, evidence: EvidenceLevel) {
  const hay = `${details.title} ${details.description} ${details.brand || ""}`.toLowerCase();
  const queryTokens = tokens(canonicalQuery(body));
  const must = phrases(body.mustHave);
  const exclude = phrases(body.exclude);
  const excludedHit = exclude.find((x) => x.split(/\s+/).every((part) => hay.includes(part)));
  if (excludedHit) return null;

  const tokenHits = queryTokens.filter((x) => hay.includes(x));
  const mustHits = must.filter((x) => x.split(/\s+/).every((part) => hay.includes(part)));
  const reasons: string[] = [];
  let score = evidence === "page" ? 42 : evidence === "listing" ? 34 : 25;

  if (queryTokens.length) {
    const ratio = tokenHits.length / queryTokens.length;
    if (ratio < 0.34) return null;
    score += Math.round(ratio * 28);
    if (ratio >= 0.8) reasons.push("Strong product match");
    else if (ratio >= 0.55) reasons.push("Good product match");
  }
  if (must.length) {
    const ratio = mustHits.length / must.length;
    score += Math.round(ratio * 16);
    if (ratio === 1) reasons.push("All must-haves detected");
    else if (ratio === 0 && evidence !== "page") score -= 8;
  }

  const maxBudget = budget(body);
  if (maxBudget && details.numericPrice !== undefined && (!details.currency || details.currency === body.currency)) {
    if (details.numericPrice <= maxBudget) { score += 12; reasons.push("Within budget"); }
    else { score -= 28; reasons.push("Over budget"); }
  }

  const availabilityLower = (details.availability || "").toLowerCase().replace(/\s/g, "");
  if (/instock|limitedavailability|dostępny|available/.test(availabilityLower)) { score += 5; reasons.push("Available now"); }
  if (/outofstock|soldout|niedostępny/.test(availabilityLower)) { score -= 18; reasons.push("Currently unavailable"); }

  const conditionWanted = body.condition || "Any";
  const conditionHay = `${details.condition || ""} ${hay}`.toLowerCase();
  if (conditionWanted === "New only") {
    if (/newcondition|\bnew\b|nowy|nowa|nowe|fabrycznie/.test(conditionHay)) { score += 5; reasons.push("New condition"); }
    else if (/usedcondition|\bused\b|używan|pre-owned|refurbished|odnowion/.test(conditionHay)) return null;
  }
  if (conditionWanted === "Used only") {
    if (/usedcondition|\bused\b|używan|pre-owned/.test(conditionHay)) { score += 5; reasons.push("Used condition"); }
    else if (/newcondition|\bnew\b|nowy|nowa|nowe/.test(conditionHay)) return null;
  }

  if (base.discoveredBy.length >= 2) { score += 4; reasons.push("Found by multiple scanners"); }
  return { score: Math.max(1, Math.min(99, score)), reasons: reasons.slice(0, 5) };
}

async function enrich(candidate: Candidate, body: Body): Promise<ProductResult | null> {
  let html = "";
  let finalUrl = candidate.url;
  try {
    const fetched = await fetchHtml(candidate.url, 5200);
    html = fetched.html;
    finalUrl = fetched.url;
  } catch {
    // A blocked retailer can still be a useful real listing if store/search discovery
    // gave us a product-like URL and concrete listing evidence such as a price.
    if (candidate.evidence === "search" && candidate.discoveredBy.length < 2 && candidate.numericPrice === undefined) return null;
    const scored = scoreProduct(candidate, body, {
      title: candidate.title,
      description: candidate.snippet,
      numericPrice: candidate.numericPrice,
      currency: candidate.currency,
    }, candidate.evidence);
    if (!scored) return null;
    return {
      title: candidate.title, url: candidate.url, source: candidate.source, snippet: candidate.snippet,
      score: scored.score, price: candidate.numericPrice !== undefined ? `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(candidate.numericPrice)} ${candidate.currency || body.currency || ""}`.trim() : candidate.priceText,
      numericPrice: candidate.numericPrice, currency: candidate.currency, image: candidate.image,
      verified: candidate.evidence !== "search" || candidate.discoveredBy.length >= 2,
      evidence: candidate.evidence,
      evidenceLabel: candidate.evidence === "listing" ? "STORE LISTING" : candidate.discoveredBy.length >= 2 ? "CROSS-CHECKED" : "SEARCH DISCOVERY",
      reasons: scored.reasons, discoveredBy: candidate.discoveredBy,
    };
  }

  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: JsonRecord[] = [];
  for (const script of scripts) {
    try { findProducts(JSON.parse(script[1]), products); } catch { /* malformed JSON-LD */ }
  }

  const product = products[0];
  const offer = offerFrom(product);
  const metaTitle = metaContent(html, ["og:title", "twitter:title"]) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metaDescription = metaContent(html, ["description", "og:description", "twitter:description"]);
  const metaImage = metaContent(html, ["og:image", "twitter:image"]);
  const metaPrice = metaContent(html, ["product:price:amount", "og:price:amount"]);
  const metaCurrency = metaContent(html, ["product:price:currency", "og:price:currency"]);
  const itempropPrice = html.match(/(?:itemprop=["']price["'][^>]+content=["']([^"']+)|content=["']([^"']+)["'][^>]+itemprop=["']price["'])/i);
  const itempropCurrency = html.match(/(?:itemprop=["']priceCurrency["'][^>]+content=["']([^"']+)|content=["']([^"']+)["'][^>]+itemprop=["']priceCurrency["'])/i);

  const title = clean(asText(product?.name) || metaTitle || candidate.title, 220);
  const description = clean(asText(product?.description) || metaDescription || candidate.snippet, 360);
  const rawPrice = asText(offer?.price) || asText(offer?.lowPrice) || metaPrice || itempropPrice?.[1] || itempropPrice?.[2] || candidate.priceText;
  const numericPrice = parseNumber(rawPrice) ?? candidate.numericPrice ?? null;
  const currency = asText(offer?.priceCurrency) || metaCurrency || itempropCurrency?.[1] || itempropCurrency?.[2] || candidate.currency || detectCurrency(rawPrice) || body.currency || undefined;
  const availability = normalizeAvailability(asText(offer?.availability) || metaContent(html, ["product:availability"]));
  const itemCondition = normalizeAvailability(asText(offer?.itemCondition));
  const brandObj = product?.brand;
  const brand = asText(brandObj) || (brandObj && typeof brandObj === "object" ? asText((brandObj as JsonRecord).name) : undefined);
  const image = imageFrom(product?.image) || (metaImage && /^https?:\/\//.test(metaImage) ? metaImage : candidate.image);

  // Page-level verification is allowed when we have Product JSON-LD, or when the
  // page itself exposes a product title plus a concrete price.
  const pageVerified = Boolean(product || (numericPrice !== null && title && !isLikelyNonProduct(finalUrl, title)));
  if (!pageVerified) {
    if (candidate.evidence === "search" && candidate.discoveredBy.length < 2 && candidate.numericPrice === undefined) return null;
  }

  const evidence: EvidenceLevel = pageVerified ? "page" : candidate.evidence;
  const scored = scoreProduct(candidate, body, { title, description, numericPrice: numericPrice ?? undefined, currency, availability, condition: itemCondition, brand }, evidence);
  if (!scored) return null;

  return {
    title, url: finalUrl, source: host(finalUrl), snippet: description || "Verified product listing.", score: scored.score,
    price: numericPrice !== null ? `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(numericPrice)} ${currency || ""}`.trim() : candidate.priceText,
    numericPrice: numericPrice ?? undefined, currency, availability, condition: itemCondition, image, brand,
    verified: pageVerified || candidate.evidence === "listing" || candidate.discoveredBy.length >= 2,
    evidence,
    evidenceLabel: pageVerified ? "VERIFIED PAGE" : candidate.evidence === "listing" ? "STORE LISTING" : "CROSS-CHECKED",
    reasons: scored.reasons,
    discoveredBy: candidate.discoveredBy,
  };
}

function resultIdentity(result: ProductResult) {
  const modelish = tokens(result.title).slice(0, 7).join("|");
  return `${result.source}|${modelish}|${Math.round((result.numericPrice || 0) * 100)}`;
}

function dedupeResults(results: ProductResult[]) {
  const seenUrls = new Set<string>();
  const seenIdentities = new Set<string>();
  const out: ProductResult[] = [];
  for (const result of results) {
    const urlKey = result.url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
    const identity = resultIdentity(result);
    if (seenUrls.has(urlKey) || seenIdentities.has(identity)) continue;
    seenUrls.add(urlKey); seenIdentities.add(identity); out.push(result);
  }
  return out;
}

export async function POST(request: Request) {
  const started = Date.now();
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid search request." }, { status: 400 }); }
  if (!body.query?.trim()) return NextResponse.json({ error: "Describe a product first." }, { status: 400 });

  const adapters = chosenAdapters(body);
  if (!adapters.length) return NextResponse.json({ error: "Choose at least one search source." }, { status: 400 });

  const providers: string[] = [];
  const discoveryTasks: Promise<Candidate[]>[] = [];
  const apiKey = process.env.TAVILY_API_KEY;

  if (apiKey) {
    discoveryTasks.push(tavilySearch(body, adapters, apiKey).then((r) => { providers.push("Tavily"); return r; }).catch(() => []));
  }
  discoveryTasks.push(webDiscovery(body, adapters).then((r) => { if (r.length) providers.push("Web meta-search"); return r; }).catch(() => []));
  discoveryTasks.push(directStoreDiscovery(body, adapters).then((r) => { if (r.length) providers.push("Store scanners"); return r; }).catch(() => []));

  const discovered = (await Promise.all(discoveryTasks)).flat();
  const candidates = mergeCandidates(discovered, adapters);

  // Enrich the strongest candidates in two waves. This gets quick wins first and
  // still gives tougher retailer pages a chance without making every scan crawl forever.
  const firstWave = candidates.slice(0, 16);
  const secondWave = candidates.slice(16, 28);
  const first = await Promise.allSettled(firstWave.map((c) => enrich(c, body)));
  let matches = first.flatMap((r) => r.status === "fulfilled" && r.value ? [r.value] : []);
  if (matches.length < 6 && secondWave.length) {
    const second = await Promise.allSettled(secondWave.map((c) => enrich(c, body)));
    matches.push(...second.flatMap((r) => r.status === "fulfilled" && r.value ? [r.value] : []));
  }

  matches = dedupeResults(matches).sort((a, b) => {
    const max = budget(body);
    if (max) {
      const aComparable = !a.currency || a.currency === body.currency;
      const bComparable = !b.currency || b.currency === body.currency;
      const aOver = aComparable && a.numericPrice !== undefined && a.numericPrice > max;
      const bOver = bComparable && b.numericPrice !== undefined && b.numericPrice > max;
      if (aOver !== bOver) return aOver ? 1 : -1;
    }
    const evidenceRank = { page: 3, listing: 2, search: 1 };
    if (evidenceRank[a.evidence] !== evidenceRank[b.evidence]) return evidenceRank[b.evidence] - evidenceRank[a.evidence];
    return b.score - a.score;
  }).slice(0, 14);

  return NextResponse.json({
    results: matches,
    storeSearches: buildStoreSearches(body, adapters),
    provider: providers.length ? [...new Set(providers)].join(" + ") : "Direct store searches",
    verifiedCount: matches.filter((m) => m.verified).length,
    meta: {
      query: canonicalQuery(body),
      candidatesDiscovered: candidates.length,
      storesScanned: Math.min(adapters.length, 8),
      providers: [...new Set(providers)],
      elapsedMs: Date.now() - started,
      pageVerified: matches.filter((m) => m.evidence === "page").length,
      listingVerified: matches.filter((m) => m.evidence === "listing").length,
      crossChecked: matches.filter((m) => m.evidence === "search" && m.discoveredBy.length >= 2).length,
    },
  });
}
