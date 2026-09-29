# shopify-abandoned-checkout-recovery

A zero-dependency Node.js library + CLI (`sacr`) that turns your store's abandoned checkouts into a **recovery report** and, if you want them, **single-use recovery discount codes** ready to hand to your marketing/sales team for manual or CRM-driven outreach.

**[Get a free full-store audit →](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-abandoned-checkout-recovery)** (SEO, speed, CRO and AI-shopping-readiness, one tool, no signup)

We built this because every abandoned-checkout tool we found either lived inside an expensive marketing suite or only sent generic automated emails. Sometimes you just want the numbers — how much is sitting there, who actually gave you an email address, what they almost bought — and a clean discount code you can drop into an email, a text, or a spreadsheet for your sales team to work by hand.

## Example output

```
$ sacr report --since 30

# Abandoned checkout recovery report — my-store.myshopify.com

- **214** abandoned checkouts worth **18,432.55 USD**
- Average cart value: **86.13 USD**
- Contactable (has email on file): **171** of 214 (80%)

## By age since abandoned
- under 1h: 12
- 1h - 24h: 41
- 1 - 3 days: 63
- 3 - 7 days: 58
- over 7 days: 40

## Top recoverable products
- Weighted Blanket — Queen — qty 22, 1,979.78 USD
- Ceramic Pour-Over Set — qty 34, 1,529.66 USD
- Bamboo Desk Organizer — qty 41, 1,024.59 USD

## By country
- United States: 152 checkouts, 13,110.40 USD
- Canada: 31 checkouts, 2,655.90 USD
- United Kingdom: 18 checkouts, 1,540.05 USD
```

```
$ sacr discounts --since 7 --percentage 0.12 --limit 20 --out recovery-list.csv
20 checkout(s) processed (dry run).

$ cat recovery-list.csv
email,name,cartValue,currency,checkoutUrl,code,status
jane@example.com,Jane Doe,64.5,USD,https://my-store.myshopify.com/.../recover/abc,COMEBACK-7F3A2C1B,dry-run (not created — pass --create to actually issue it)
...
```

## Features

- **Recovery report** — total abandoned value, average cart value, contactability rate (has-email vs. no-email), breakdown by day, by country, by "how long ago it was abandoned," and top recoverable products by value. Markdown or JSON output.
- **Raw CSV export** — every abandoned checkout as a flat row (email, name, value, country, item count, recovery URL) for your own spreadsheet or CRM import.
- **Recovery discount codes** — generates a unique, single-use, single-customer percentage-off code per abandoned checkout (Admin API `discountCodeBasicCreate`), and exports an outreach-ready CSV of email + name + cart value + checkout URL + code. **Dry run by default** — nothing is created in your store until you pass `--create`.
- **Cost-aware, paginated, zero dependencies.** Uses only Node's built-in `fetch`; retries on HTTP 429 and `THROTTLED` GraphQL errors using Shopify's own cost/restore-rate headroom instead of blind backoff.
- Every GraphQL query and mutation was checked field-by-field against the live 2026-07 Admin GraphQL schema before shipping (see "What it does NOT do" below for the one caveat).

## Installation

```bash
git clone https://github.com/EcomswiftLLC/shopify-abandoned-checkout-recovery.git
cd shopify-abandoned-checkout-recovery
npm install          # no runtime dependencies; installs nothing but dev/test tooling if any
npm link             # optional: makes the `sacr` command global
```

Requires Node.js 18+ (for built-in `fetch`).

### Get an access token

Create a [custom app](https://help.shopify.com/en/manual/apps/app-types/custom-apps) in your store's admin (Settings → Apps and sales channels → Develop apps) with these Admin API scopes:

| Command | Scopes needed |
| --- | --- |
| `report`, `export` | `read_orders`, `read_customers` |
| `discounts --create` | the above, plus `write_discounts` |

Note the abandoned-checkouts query also requires the user installing the app to have the **"View abandoned checkouts"** (`manage_abandoned_checkouts`) staff permission — this is a permission on the person, not just the app's scopes.

```bash
export SHOPIFY_SHOP=my-store.myshopify.com
export SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Usage

```bash
sacr report    [--since <days|ISO-date>] [--status open|closed] [--json <file>] [--md <file>]
sacr export    [--since <days|ISO-date>] --csv <file>
sacr discounts [--since <days|ISO-date>] [--percentage 0.1] [--limit N] --out <file> [--create]
```

- `--since 7` — last 7 days (default: 30). Or pass an ISO date: `--since 2026-08-01`.
- `--status open` / `--status closed` — filter by checkout status.
- `sacr discounts` is a **dry run unless you pass `--create`** — it always writes the CSV it *would* produce, so you can review codes before anything touches your store.

Use it as a library too:

```js
const { AdminGraphQLClient } = require('shopify-abandoned-checkout-recovery/lib/graphql-client');
const { fetchAllAbandonedCheckouts } = require('shopify-abandoned-checkout-recovery/lib/checkouts');
const { buildReport } = require('shopify-abandoned-checkout-recovery/lib/report');

const client = new AdminGraphQLClient({ shop: 'my-store.myshopify.com', accessToken: process.env.SHOPIFY_ACCESS_TOKEN });
const checkouts = await fetchAllAbandonedCheckouts(client, { query: 'created_at:>=2026-09-01' });
console.log(buildReport(checkouts));
```

Run the test suite:

```bash
npm test
```

## What it does NOT do

- **It does not send anything.** No emails, no SMS, no automated campaigns. It reports and, optionally, mints a discount code — sending it to the customer is on you (or your ESP/CRM). If you want fully automated recovery emails/flows, Shopify's own [automations](https://help.shopify.com/en/manual/promoting-marketing/create-marketing/automations) or a tool like Klaviyo already do that well; this exists for the manual/semi-manual outreach gap they leave.
- **It does not know *why* a checkout was abandoned** — shipping cost, a broken coupon, indecision. It surfaces value and volume, not root cause. Pair it with a [full store audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-abandoned-checkout-recovery) if you want the "why."
- **It does not deduplicate customers across checkouts.** Someone who abandons three times shows up as three rows. Group by `customerId` yourself if you need that.
- **It does not track marketing-channel attribution** (UTM/referrer) on the abandoned checkout itself — the Admin API's `AbandonedCheckout` object doesn't expose landing-page/referrer data the way order attribution does. If channel attribution matters to you, capture it earlier (checkout extension, page script) and store it as a note or metafield.
- **`--create` mints real discounts.** It sets `usageLimit: 1` and `appliesOncePerCustomer: true` so each code works once, but it is still real, live data written to your store the moment you pass the flag — always review the dry-run CSV first.

## FAQ

**Does this replace Shopify's built-in abandoned checkout emails?** No — those are automatic and free. This is for reporting on the opportunity size and, if you want to go further than the default emails, generating a hand-off list with unique discount codes for a human (or a script you write) to follow up with.

**Why not just build the emails in too?** Every store's email stack is different (Klaviyo, Shopify Email, Omnisend, a CRM). Rather than guess wrong, this stops at "here is a clean CSV," which imports into anything.

**Can I run this on a schedule?** Yes — it's a CLI with no interactive prompts, so cron/GitHub Actions/Task Scheduler all work. Nothing here is currently packaged as a scheduled GitHub Action; PRs welcome.

**Is my data sent anywhere?** No. Every request goes directly from your machine to `https://{your-shop}.myshopify.com`. Nothing is sent to Ecom Swift LLC or any third party.

---

**Want the full picture, not just cart recovery?** Our [free store audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-abandoned-checkout-recovery) checks SEO, speed, conversion-rate signals and AI-shopping readiness across your whole storefront in one pass — no signup required.

## Related Shopify tools

From the same accounts:

- [shopify-order-export-cli](https://github.com/Ecom-Swift-LLC/shopify-order-export-cli) — export orders + a revenue/customer-LTV report.
- [shopify-inventory-sync-cli](https://github.com/EcomswiftLLC/shopify-inventory-sync-cli) — diff and sync inventory levels from a source-of-truth CSV.
- [shopify-webhook-toolkit](https://github.com/EcomswiftLLC/shopify-webhook-toolkit) — local webhook dev server, HMAC verification, replay tool.
- [shopify-metafields-manager](https://github.com/Ecom-Swift-LLC/shopify-metafields-manager) — bulk metafield import/export + coverage audit.
- [shopify-store-audit-toolkit](https://github.com/EcomswiftLLC/shopify-store-audit-toolkit) — CLI storefront SEO/technical audit.
- [shopify-ai-shopping-readiness](https://github.com/Ecom-Swift-LLC/shopify-ai-shopping-readiness) — audits product JSON-LD against what AI shopping surfaces actually read.

## Contributing

Issues and PRs welcome — bug reports, Shopify API version bumps, additional report dimensions, or an ESP-specific export format (Klaviyo, Omnisend) are all good candidates.

## Roadmap

- [ ] `--group-by customer` to collapse repeat abandoners into one row
- [ ] Optional Klaviyo/Omnisend-shaped CSV export presets
- [ ] GitHub Action to run `sacr report` on a schedule and post the Markdown to a Slack/Discord webhook

## License

[MIT](LICENSE) © Ecom Swift LLC

## Need help?

If you'd rather have this set up and run for you — or want a full audit, a custom store build, or ongoing Shopify support — we're a Shopify Partner and take on this kind of work directly.

- 🔍 [Free full-store audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-abandoned-checkout-recovery) — SEO, speed, CRO, AI-shopping readiness
- 🧰 [More free Shopify tools](https://www.ecomswiftllc.com/free-tools)
- 🏬 [Shopify Partner Directory profile](https://www.shopify.com/partners/directory/partner/waowy) — verified Shopify Partner
- 🌐 [ecomswiftllc.com](https://www.ecomswiftllc.com)

---

*Built and maintained by [Ecom Swift LLC](https://www.ecomswiftllc.com), a Shopify Partner agency. We publish tools like this one because we build them for our own audits and client work anyway — might as well be useful to more stores than just ours.*
