# Cloudflare Pages handoff

Prepared for Git integration; nothing has been connected or published.

After the GitHub push, create a Pages project and connect that repository. Choose framework None, production branch main, repository root as the root directory, build command `npm run build`, and build output directory `public`. No environment secrets are required for this static site. Enable branch previews so each teammate can review a pull request before merging. Do not add a single-page-app catch-all: each card has its own real index.html, and public/404.html handles missing paths.

wrangler.toml records the Pages output directory. It contains no account IDs or tokens. The GitHub workflow validates only; Cloudflare's Git integration can handle deployment separately.

Official references: https://developers.cloudflare.com/pages/get-started/git-integration/ and https://developers.cloudflare.com/pages/configuration/build-configuration/
