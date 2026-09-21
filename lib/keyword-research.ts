import "server-only";

/**
 * Keyword research engine.
 *
 * Aggregates real-world search demand signals from three free sources:
 *  1. Google Autocomplete  — what people actually type into Google
 *  2. DuckDuckGo Suggest   — secondary autocomplete corroboration
 *  3. Google Trends        — "related queries" (top + rising) via the
 *                            unofficial JSON API (token dance)
 *
 * Every source is best-effort: failures degrade gracefully so the route
 * always returns whatever signals could be gathered.
 */

const FETCH_TIMEOUT_MS = 10_000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface KeywordSuggestion {
  term: string;
  /** Composite demand score, higher = better. */
  score: number;
  /** Which sources surfaced this term. */
  sources: string[];
  /** True when Google Trends flagged it as a rising/breakout query. */
  rising: boolean;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { "User-Agent": UA, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Source 1 — Google Autocomplete                                      */
/* ------------------------------------------------------------------ */

async function googleSuggestions(seed: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(seed)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = (await res.json()) as [string, string[]];
    return Array.isArray(json?.[1]) ? json[1] : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Source 2 — DuckDuckGo Suggest                                       */
/* ------------------------------------------------------------------ */

async function duckDuckGoSuggestions(seed: string): Promise<string[]> {
  try {
    const url = `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(seed)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = (await res.json()) as
      | [string, string[]]
      | Array<{ phrase: string }>;
    if (Array.isArray(json) && Array.isArray(json[1])) {
      return json[1] as string[];
    }
    if (Array.isArray(json)) {
      return (json as Array<{ phrase?: string }>)
        .map((e) => e.phrase)
        .filter((p): p is string => typeof p === "string");
    }
    return [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Source 3 — Google Trends related queries (unofficial API)           */
/* ------------------------------------------------------------------ */

interface TrendsTerm {
  term: string;
  value: number; // 0-100 for top, can exceed for rising
  rising: boolean;
}

/** Strip Google's anti-hijacking prefix ")]}'\n" before JSON.parse. */
function parseTrendsBody(body: string): unknown {
  const idx = body.indexOf("{");
  if (idx === -1) throw new Error("no JSON in trends body");
  return JSON.parse(body.slice(idx));
}

async function trendsRelatedQueries(seed: string): Promise<TrendsTerm[]> {
  try {
    // Step 0: grab a NID cookie — the explore API 429s without one.
    let cookie = "";
    try {
      const boot = await fetchWithTimeout("https://trends.google.com/", {
        redirect: "manual",
      });
      cookie =
        boot.headers
          .get("set-cookie")
          ?.split(";")[0]
          ?.trim() ?? "";
    } catch {
      /* proceed cookieless */
    }

    // Step 1: explore → widget tokens.
    const exploreReq = {
      comparisonItem: [{ keyword: seed, geo: "", time: "today 3-m" }],
      category: 0,
      property: "",
    };
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(exploreReq))}`;
    const exploreRes = await fetchWithTimeout(exploreUrl, {
      headers: cookie ? { Cookie: cookie } : {},
    });
    if (!exploreRes.ok) return [];

    const explore = parseTrendsBody(await exploreRes.text()) as {
      widgets?: Array<{ id?: string; token?: string; request?: unknown }>;
    };
    const widget = explore.widgets?.find((w) => w.id === "RELATED_QUERIES");
    if (!widget?.token || !widget.request) return [];

    // Step 2: widgetdata → ranked keyword lists.
    const dataUrl = `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${widget.token}`;
    const dataRes = await fetchWithTimeout(dataUrl, {
      headers: cookie ? { Cookie: cookie } : {},
    });
    if (!dataRes.ok) return [];

    const data = parseTrendsBody(await dataRes.text()) as {
      default?: {
        rankedList?: Array<{
          rankedKeyword?: Array<{
            query?: string;
            value?: number;
            formattedValue?: string;
          }>;
        }>;
      };
    };

    const lists = data.default?.rankedList ?? [];
    const terms: TrendsTerm[] = [];
    lists.forEach((list, listIdx) => {
      const rising = listIdx === 1; // list 0 = top, list 1 = rising
      for (const kw of list.rankedKeyword ?? []) {
        if (!kw.query) continue;
        terms.push({
          term: kw.query,
          value: typeof kw.value === "number" ? Math.min(kw.value, 200) : 50,
          rising:
            rising || (kw.formattedValue ?? "").toLowerCase() === "breakout",
        });
      }
    });
    return terms;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Aggregation & ranking                                               */
/* ------------------------------------------------------------------ */

function normalize(term: string): string {
  return term.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface ResearchResult {
  keywords: KeywordSuggestion[];
  /** Which sources responded with at least one suggestion. */
  activeSources: string[];
}

/**
 * Expand and rank keywords for the given seeds.
 * Scoring: position-weighted autocomplete hits + Trends interest value,
 * with a multiplier for terms corroborated by multiple sources and a
 * boost for Trends "rising/breakout" queries.
 */
export async function researchKeywords(
  seeds: string[]
): Promise<ResearchResult> {
  const cleanSeeds = seeds.map(normalize).filter(Boolean).slice(0, 4);
  if (cleanSeeds.length === 0) return { keywords: [], activeSources: [] };

  // Modifier expansion widens autocomplete coverage for buyer intent.
  const modifiers = ["", "best ", "buy "];
  const autocompleteQueries = cleanSeeds.flatMap((seed) =>
    modifiers.map((m) => `${m}${seed}`)
  );

  const [googleBatches, ddgBatches, trendsBatches] = await Promise.all([
    Promise.all(autocompleteQueries.map(googleSuggestions)),
    Promise.all(cleanSeeds.map(duckDuckGoSuggestions)),
    Promise.all(cleanSeeds.slice(0, 2).map(trendsRelatedQueries)),
  ]);

  const bucket = new Map<
    string,
    { score: number; sources: Set<string>; rising: boolean; term: string }
  >();

  const upsert = (
    rawTerm: string,
    score: number,
    source: string,
    rising = false
  ) => {
    const key = normalize(rawTerm);
    if (!key || key.length < 3) return;
    const existing = bucket.get(key);
    if (existing) {
      existing.score += score;
      existing.sources.add(source);
      existing.rising = existing.rising || rising;
    } else {
      bucket.set(key, {
        term: key,
        score,
        sources: new Set([source]),
        rising,
      });
    }
  };

  googleBatches.forEach((batch) =>
    batch.forEach((term, idx) => upsert(term, Math.max(20 - idx * 2, 4), "google"))
  );
  ddgBatches.forEach((batch) =>
    batch.forEach((term, idx) => upsert(term, Math.max(14 - idx * 2, 3), "duckduckgo"))
  );
  trendsBatches.forEach((batch) =>
    batch.forEach((t) =>
      upsert(t.term, Math.round(t.value / 2) + 10, "trends", t.rising)
    )
  );

  // Seeds themselves shouldn't dominate the list.
  for (const seed of cleanSeeds) bucket.delete(seed);

  const activeSources = Array.from(
    new Set(
      Array.from(bucket.values()).flatMap((e) => Array.from(e.sources))
    )
  );

  const keywords = Array.from(bucket.values())
    .map((e) => ({
      term: e.term,
      // Multi-source corroboration multiplier + rising boost.
      score: Math.round(
        e.score * (1 + 0.35 * (e.sources.size - 1)) * (e.rising ? 1.5 : 1)
      ),
      sources: Array.from(e.sources),
      rising: e.rising,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);

  return { keywords, activeSources };
}
