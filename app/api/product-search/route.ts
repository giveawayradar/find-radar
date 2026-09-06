import { NextResponse } from "next/server";

type TavilyResult = { title?: string; url?: string; content?: string; score?: number };
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

type SearchResult = {
  title: string;
  url: string;
  source: string;
  snippet: string;
  score: number;
  price?: string;
  kind?: "listing" | "store-search";
};

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
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function clean(text: string) {
  return decodeHtml(text).slice(0, 360);
}

function normalizeDuckUrl(raw: string) {
  const decoded = decodeHtml(raw);
  try {
    const url = new URL(decoded, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    if (redirected) return decodeURIComponent(redirected);
    if (url.hostname.endsWith("duckduckgo.com") && url.pathname.startsWith("/l/")) return "";
    return url.toString();
  } catch {
    return decoded.startsWith("//") ? `https:${decoded}` : decoded;
  }
}

function parsePrice(text: string) {
  const patterns = [
    /(?:^|\s)(\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{2})?)\s?(zł|PLN)(?:\s|$)/i,
    /(?:€|EUR\s?)(\d{1,4}(?:[,.]\d{2})?)/i,
    /(?:\$|USD\s?)(\d{1,4}(?:[,.]\d{2})?)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[0].trim();
  }
  return undefined;
}

function numericBudget(value?: string) {
  if (!value) return null;
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function numericPrice(value?: string) {
  if (!value) return null;
  const match = value.replace(/\s/g, "").match(/\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function rank(result: { title?: string; content?: string; score?: number; price?: string }, body: Body) {
  const hay = `${result.title || ""} ${result.content || ""}`.toLowerCase();
  const wanted = `${body.query || ""} ${body.mustHave || ""}`
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((x) => x.length > 2);
  const excluded = (body.exclude || "")
    .toLowerCase()
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  let points = Math.round((result.score ?? 0.52) * 45) + 35;
  const unique = [...new Set(wanted)];
  if (unique.length) points += Math.round((unique.filter((w) => hay.includes(w)).length / unique.length) * 24);
  if (excluded.some((x) => hay.includes(x))) points -= 28;

  const budget = numericBudget(body.budget);
  const price = numericPrice(result.price);
  if (budget && price) points += price <= budget ? 8 : -18;

  return Math.max(1, Math.min(99, points));
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

function buildBrief(body: Body) {
  return [
    body.query?.trim(),
    body.mustHave?.trim(),
    body.condition && body.condition !== "Any" ? body.condition : "",
    body.budget ? `under ${body.budget} ${body.currency || ""}` : "",
    body.country ? `buy ${body.country}` : "",
    body.exclude
      ? body.exclude
          .split(/[,;]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => `-${x.replace(/\s+/g, "-")}`)
          .join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function tavilySearch(body: Body, domains: string[], apiKey: string): Promise<SearchResult[]> {
  const constraints = [
    body.budget ? `maximum price ${body.budget} ${body.currency || ""}` : "",
    body.country ? `available to buy in ${body.country}` : "",
    body.condition && body.condition !== "Any" ? body.condition : "",
    body.mustHave ? `must have: ${body.mustHave}` : "",
    body.exclude ? `exclude: ${body.exclude}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const query = `shopping product ${body.query}. ${constraints}. Find specific product listing pages currently for sale, not articles, reviews or category pages.`;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 18,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      ...(domains.length ? { include_domains: domains } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Tavily returned ${response.status}`);
  const data = await response.json();
  return ((data.results || []) as TavilyResult[])
    .filter((r) => r.url && r.title)
    .map((r) => {
      const snippet = clean(r.content || "Open this listing to verify current price, stock and specifications.");
      const price = parsePrice(`${r.title || ""} ${snippet}`);
      return {
        title: clean(r.title || "Product match"),
        url: r.url!,
        source: host(r.url!),
        snippet,
        price,
        score: rank({ ...r, price }, body),
        kind: "listing" as const,
      };
    });
}

function parseDuckResults(html: string, body: Body): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML result blocks.
  const blocks = html.match(/<div[^>]+class="[^"]*result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi) || [];
  for (const block of blocks) {
    const link = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = normalizeDuckUrl(link[1]);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const snippetMatch = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = clean(snippetMatch?.[1] || snippetMatch?.[2] || "Open the result to verify live price and stock.");
    const title = clean(link[2]);
    const price = parsePrice(`${title} ${snippet}`);
    results.push({ title, url, source: host(url), snippet, price, score: rank({ title, content: snippet, price }, body), kind: "listing" });
  }

  // DuckDuckGo Lite fallback.
  if (!results.length) {
    const liteLinks = [...html.matchAll(/<a[^>]+(?:class=['"]result-link['"]|rel=['"]nofollow['"])[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const match of liteLinks) {
      const url = normalizeDuckUrl(match[1]);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const title = clean(match[2]);
      if (!title) continue;
      results.push({ title, url, source: host(url), snippet: "Open this result to verify the live listing, current price and availability.", score: rank({ title }, body), kind: "listing" });
    }
  }

  return results;
}

async function duckSearch(body: Body, domains: string[]): Promise<SearchResult[]> {
  const brief = buildBrief(body);
  const groups: string[][] = [];
  for (let i = 0; i < domains.length; i += 5) groups.push(domains.slice(i, i + 5));

  const queries = groups.slice(0, 4).map((group) => `${brief} (${group.map((d) => `site:${d}`).join(" OR ")})`);
  const region = body.country === "Poland" ? "pl-pl" : body.country === "United Kingdom" ? "uk-en" : body.country === "United States" ? "us-en" : "wt-wt";

  const settled = await Promise.allSettled(
    queries.map(async (query) => {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(region)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FindRadar/1.0; +https://find-radar.vercel.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Search returned ${response.status}`);
      return parseDuckResults(await response.text(), body);
    }),
  );

  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

function directFallback(body: Body, domains: string[]): SearchResult[] {
  const q = [body.query, body.mustHave].filter(Boolean).join(" ").trim();
  return domains
    .filter((domain) => DIRECT_SEARCHES[domain])
    .slice(0, 10)
    .map((domain, index) => ({
      title: `Search ${domain} for “${body.query?.trim()}”`,
      url: DIRECT_SEARCHES[domain](q),
      source: domain,
      snippet: "Live web search was temporarily unavailable. This opens the retailer's own current search results with your product target already filled in.",
      score: Math.max(58, 78 - index * 2),
      kind: "store-search" as const,
    }));
}

function dedupeAndSort(results: SearchResult[], domains: string[]) {
  const allowed = new Set(domains);
  const seen = new Set<string>();
  return results
    .filter((r) => {
      const h = host(r.url);
      if (!allowed.has(h) && ![...allowed].some((d) => h.endsWith(`.${d}`))) return false;
      const key = r.url.replace(/[?#].*$/, "").replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid search request." }, { status: 400 });
  }

  if (!body.query?.trim()) return NextResponse.json({ error: "Describe a product first." }, { status: 400 });

  const domains = chosenDomains(body);
  let results: SearchResult[] = [];
  const providerNotes: string[] = [];

  // If a Tavily key is present, use it as the high-quality first pass. It is optional.
  const apiKey = process.env.TAVILY_API_KEY;
  if (apiKey) {
    try {
      results.push(...(await tavilySearch(body, domains, apiKey)));
      providerNotes.push("Tavily");
    } catch {
      // Keep going: Product Finder must still work without the paid provider.
    }
  }

  // Keyless live-web fallback. This makes Product Finder usable on a fresh Find Radar deployment.
  if (results.length < 8) {
    try {
      results.push(...(await duckSearch(body, domains)));
      providerNotes.push("web");
    } catch {
      // Final fallback below still gives the user useful live retailer searches.
    }
  }

  results = dedupeAndSort(results, domains);
  if (!results.length) results = directFallback(body, domains);

  return NextResponse.json({
    results,
    provider: providerNotes.length ? providerNotes.join("+") : "retailer-direct",
    fallback: results.some((r) => r.kind === "store-search"),
  });
}
