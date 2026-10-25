# versorium-app-landing

[![Stars](https://img.shields.io/github/stars/MAECLY/versorium-app-landing?style=flat-square)](https://github.com/MAECLY/versorium-app-landing/stargazers) [![Views](https://hits.sh/github.com/MAECLY/versorium-app-landing.svg?label=views&style=flat-square)](https://hits.sh/github.com/MAECLY/versorium-app-landing/) [![Last commit](https://img.shields.io/github/last-commit/MAECLY/versorium-app-landing?style=flat-square)](https://github.com/MAECLY/versorium-app-landing/commits/main)

The landing page of [Versorium](https://github.com/MAECLY/versorium-app), served
at **https://versorium.maecly.com**. The app's code, releases and project
documents stay in `MAECLY/versorium-app`; this repository holds only the site
and the scripts that check it.

| Path | What |
|---|---|
| `docs/` | The site, published as is: Spanish at `/`, English at `/en/` |
| `docs/vercel.json` | How Vercel serves it (static, `/en` → `/en/`; the build fails on any Markdown file) |
| `docs/bake-metrics.mjs` | Run by the Vercel build, then deleted: writes the app's GitHub downloads (and stars, when above zero) into the hero line; on any API failure nothing is shown |
| `tests/landing/` | The checks and the scripts that made the screenshots, clips and fonts |

## Deploys

Vercel project `versorium-landing-page` (team `migelangelecs-projects`), Git
connected to this repository with root directory `docs/`. A push to `main`
publishes to production; any other branch gets a preview. A push that
changes nothing under `docs/` since the last deployment is skipped
(`ignoreCommand`). The `versorium-landing-page.vercel.app` host redirects to
the domain.

DNS lives in Cloudflare: `versorium.maecly.com` is a CNAME to the host Vercel
recommends for the project, **DNS only** (not proxied), like the other
`maecly.com` sites on Vercel.

By hand, from the repository root:

```sh
vercel deploy            # preview
vercel deploy --prod     # production
```

## Checks

```sh
npm install
npm run serve                     # http://localhost:8700
node tests/landing/verify.mjs     # every gate; ONLY=links,words for some
```

The browser checks drive the system Chrome (`channel: "chrome"`).

Several checks compare the site with the app: the theme tokens in
`docs/assets/site.css` are a byte-for-byte copy of the app's
`src/styles.css` (`node tests/landing/tokens.mjs` copies them again). They read
a clone of `MAECLY/versorium-app`, by default `../versorium-app`; set
`VERSORIUM_APP_DIR` to use another one.
