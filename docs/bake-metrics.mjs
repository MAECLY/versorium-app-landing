/* Public reach, written into the pages when Vercel builds them.

   The site sends no request to another server (its CSP is connect-src
   'self'), so the numbers are fetched here, once per deployment, from the
   public GitHub API of MAECLY/versorium-app, and baked into the HTML like the
   version is. The pages ship two comments where the numbers go:

     <!--metric:stars-->       after the "Open source" link of the hero line
     <!--metric:downloads-->   at the end of that line

   and, in the landing's JSON-LD, the SoftwareApplication node may gain an
   interactionStatistic with the same download count.

   A number is written only when it is known and above zero. If GitHub fails,
   rate-limits or answers something unexpected, the comments stay comments:
   the reader sees the line as it was, never a 0 or a guess. This script never
   fails the build; it is deleted before the site is published.

     node bake-metrics.mjs [dir]       # bakes every .html under dir (default .)
*/

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REPO = "MAECLY/versorium-app";
const API = "https://api.github.com";

const LABELS = {
  es: { downloads: ["descarga", "descargas"], stars: ["estrella", "estrellas"], sep: "." },
  en: { downloads: ["download", "downloads"], stars: ["star", "stars"], sep: "," },
};

/** 1234 → "1.234" (es) or "1,234" (en), grouping from four digits on. */
export function formatCount(n, lang) {
  const sep = (LABELS[lang] ?? LABELS.en).sep;
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

const known = (n) => Number.isFinite(n) && n > 0;

/** The words a metric reads as, or "" when it is not known or not above zero. */
export function metricText(kind, n, lang) {
  if (!known(n)) return "";
  const words = (LABELS[lang] ?? LABELS.en)[kind];
  return `${formatCount(n, lang)} ${n === 1 ? words[0] : words[1]}`;
}

/** Replaces the metric comments in one page; unknown metrics leave the page's text as it was. */
export function bake(html, { downloads, stars } = {}) {
  const lang = (html.match(/<html[^>]*\blang="([a-z]+)/) ?? [])[1] ?? "en";
  const span = (kind, n) => {
    const text = metricText(kind, n, lang);
    return text ? ` · <span class="metric" data-metric="${kind}">${text}</span>` : "";
  };
  let out = html
    .replaceAll("<!--metric:stars-->", () => span("stars", stars))
    .replaceAll("<!--metric:downloads-->", () => span("downloads", downloads));
  if (known(downloads) && !out.includes('"interactionStatistic"')) {
    out = out.replace(
      /("@type":"SoftwareApplication",[^\n]*?)("offers":\{"@type":"Offer")/,
      (_, head, offers) =>
        `${head}"interactionStatistic":{"@type":"InteractionCounter","interactionType":"https://schema.org/DownloadAction","userInteractionCount":${Math.trunc(downloads)}},${offers}`,
    );
  }
  return out;
}

async function getJson(url, fetchImpl) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "versorium-landing-build" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return { body: await res.json(), next: (res.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/)?.[1] };
}

/** Sum of download_count over every asset of every release; null when any page fails. */
export async function fetchDownloads(fetchImpl = fetch) {
  try {
    let url = `${API}/repos/${REPO}/releases?per_page=100`;
    let total = 0;
    for (let pages = 0; url && pages < 50; pages += 1) {
      const { body, next } = await getJson(url, fetchImpl);
      if (!Array.isArray(body)) return null;
      for (const release of body) for (const asset of release.assets ?? []) {
        if (!Number.isFinite(asset.download_count)) return null;
        total += asset.download_count;
      }
      url = next;
    }
    return total;
  } catch (error) {
    console.warn(`bake-metrics: downloads unknown (${error.message})`);
    return null;
  }
}

/** stargazers_count of the app's repository; null when it fails. */
export async function fetchStars(fetchImpl = fetch) {
  try {
    const { body } = await getJson(`${API}/repos/${REPO}`, fetchImpl);
    return Number.isFinite(body?.stargazers_count) ? body.stargazers_count : null;
  } catch (error) {
    console.warn(`bake-metrics: stars unknown (${error.message})`);
    return null;
  }
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (entry.name.endsWith(".html")) out.push(p);
  }
  return out;
}

export async function main(dir = ".", fetchImpl = fetch) {
  const [downloads, stars] = await Promise.all([fetchDownloads(fetchImpl), fetchStars(fetchImpl)]);
  let changed = 0;
  for (const file of await htmlFiles(dir)) {
    const html = await readFile(file, "utf8");
    if (!html.includes("<!--metric:")) continue;
    const baked = bake(html, { downloads, stars });
    if (baked !== html) {
      await writeFile(file, baked);
      changed += 1;
    }
  }
  console.log(`bake-metrics: downloads ${downloads ?? "unknown"}, stars ${stars ?? "unknown"}; ${changed} page(s) baked`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv[2] ?? ".").catch((error) => {
    console.warn(`bake-metrics: nothing baked (${error.message})`);
  });
}
