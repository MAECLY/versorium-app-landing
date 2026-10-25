// The public reach line (docs/bake-metrics.mjs): a number shows only when
// GitHub gave it and it is above zero; a failure, a rate limit or a zero
// leaves the hero line as the HTML ships it. GitHub is never called here:
// every case answers from a fake fetch.
//
//   node tests/landing/metrics.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import { bake, fetchDownloads, fetchStars, formatCount, metricText } from "../../docs/bake-metrics.mjs";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
// The pages as the repository ships them, before any bake (DOCS_DIR may be a baked copy).
const DOCS = path.join(ROOT, "docs");
const problems = [];
let cases = 0;
const check = (what, ok) => {
  cases += 1;
  if (!ok) problems.push(what);
};

const reply = (body, { status = 200, link = "" } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (h.toLowerCase() === "link" ? link : null) },
  json: async () => body,
});
const fake = (routes) => async (url) => {
  const r = routes[url];
  if (!r) throw new Error(`unexpected ${url}`);
  return typeof r === "function" ? r() : r;
};
const quiet = (fn) => async (...a) => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn(...a);
  } finally {
    console.warn = warn;
  }
};

const RELEASES = "https://api.github.com/repos/MAECLY/versorium-app/releases?per_page=100";
const PAGE2 = "https://api.github.com/repos/MAECLY/versorium-app/releases?per_page=100&page=2";
const REPO = "https://api.github.com/repos/MAECLY/versorium-app";

// Numbers by language.
check("es groups with a dot", formatCount(1234, "es") === "1.234" && formatCount(1234567, "es") === "1.234.567");
check("en groups with a comma", formatCount(1234, "en") === "1,234");
check("small numbers are not grouped", formatCount(208, "es") === "208");
check("es label", metricText("downloads", 208, "es") === "208 descargas");
check("en label", metricText("downloads", 208, "en") === "208 downloads");
check("singular", metricText("downloads", 1, "es") === "1 descarga" && metricText("stars", 1, "en") === "1 star on GitHub");
check("zero says nothing", metricText("downloads", 0, "es") === "" && metricText("stars", 0, "en") === "");
check("unknown says nothing", metricText("downloads", null, "en") === "" && metricText("downloads", NaN, "en") === "");

// Fetching: every asset of every release, across pages.
const two = fake({
  [RELEASES]: reply([{ assets: [{ download_count: 100 }, { download_count: 50 }] }], { link: `<${PAGE2}>; rel="next", <${PAGE2}>; rel="last"` }),
  [PAGE2]: reply([{ assets: [{ download_count: 58 }] }, { assets: [] }]),
});
check("downloads add up across pages", (await fetchDownloads(two)) === 208);
check("a rate limit is unknown, not 0", (await quiet(fetchDownloads)(fake({ [RELEASES]: reply({ message: "rate limit" }, { status: 403 }) }))) === null);
check("a failing second page is unknown, not a partial sum", (await quiet(fetchDownloads)(fake({ [RELEASES]: reply([{ assets: [{ download_count: 5 }] }], { link: `<${PAGE2}>; rel="next"` }), [PAGE2]: reply({}, { status: 500 }) }))) === null);
check("a network error is unknown", (await quiet(fetchDownloads)(async () => { throw new Error("offline"); })) === null);
check("stars read", (await fetchStars(fake({ [REPO]: reply({ stargazers_count: 7 }) }))) === 7);
check("stars failure is unknown", (await quiet(fetchStars)(fake({ [REPO]: reply({}, { status: 403 }) }))) === null);

// Baking the real pages.
for (const [file, lang, words] of [["index.html", "es", "208 descargas"], ["en/index.html", "en", "208 downloads"]]) {
  const html = await readFile(path.join(DOCS, file), "utf8");
  check(`${file}: ships both markers in the hero line`, /class="assure">[^\n]*<!--metric:stars--><!--metric:downloads--><\/p>/.test(html));
  check(`${file}: ships no number`, !/data-metric=/.test(html) && !html.includes('"interactionStatistic"'));
  const shown = bake(html, { downloads: 208, stars: 0 });
  check(`${file}: downloads shown when > 0 (${lang})`, shown.includes(`<span class="metric" data-metric="downloads">${words}</span>`));
  check(`${file}: zero stars not shown`, !shown.includes('data-metric="stars"') && !shown.includes("<!--metric:"));
  check(`${file}: JSON-LD counts the downloads`, shown.includes('"interactionStatistic":{"@type":"InteractionCounter","interactionType":"https://schema.org/DownloadAction","userInteractionCount":208},"offers"'));
  check(`${file}: JSON-LD still parses`, (() => {
    try {
      for (const m of shown.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
      return true;
    } catch {
      return false;
    }
  })());
  const failed = bake(html, { downloads: null, stars: null });
  check(`${file}: on failure nothing is shown`, !failed.includes("data-metric") && !failed.includes("interactionStatistic") && failed === html.replace("<!--metric:stars--><!--metric:downloads-->", ""));
  const stars = bake(html, { downloads: 1234, stars: 3 });
  check(`${file}: stars beside the source link`, stars.includes(lang === "es" ? "Código abierto</a> · <span class=\"metric\" data-metric=\"stars\">3 estrellas en GitHub</span> · <span class=\"metric\" data-metric=\"downloads\">1.234 descargas</span>" : "Open source</a> · <span class=\"metric\" data-metric=\"stars\">3 stars on GitHub</span> · <span class=\"metric\" data-metric=\"downloads\">1,234 downloads</span>"));
}

// The build bakes, then never publishes the script.
const vercel = JSON.parse(await readFile(path.join(DOCS, "vercel.json"), "utf8"));
check("vercel.json bakes before publishing and deletes the script", /^node bake-metrics\.mjs \. ; rm -f vercel\.json bake-metrics\.mjs && /.test(vercel.buildCommand));

for (const p of problems) console.log(" -", p);
console.log(`${cases - problems.length}/${cases} metric cases pass`);
process.exitCode = problems.length ? 1 : 0;
