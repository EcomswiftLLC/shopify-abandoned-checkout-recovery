#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { AdminGraphQLClient } = require('../lib/graphql-client');
const { fetchAllAbandonedCheckouts } = require('../lib/checkouts');
const { buildReport, reportToMarkdown } = require('../lib/report');
const { buildRecoveryDiscountInput, createRecoveryDiscount } = require('../lib/discounts');
const { toCsv } = require('../lib/csv');
const { loadConfigFromEnv } = require('../lib/config');

const USAGE = `
sacr — Shopify Abandoned Checkout Recovery CLI

Usage:
  sacr report    [--since <days|ISO-date>] [--status open|closed] [--json <file>] [--md <file>]
  sacr export    [--since <days|ISO-date>] --csv <file>
  sacr discounts [--since <days|ISO-date>] [--percentage 0.1] [--limit N] --out <file> [--create]

Options:
  --since <n|date>   Only checkouts created in the last <n> days, or since an ISO date. Default: 30 days.
  --status <s>       Filter: open | closed.
  --percentage <p>   Recovery discount size, 0-1. Default 0.1 (10%). Only for "discounts".
  --limit <n>        Cap the number of checkouts processed by "discounts". Default: no cap.
  --create           Actually create discount codes via the Admin API (write_discounts scope).
                      Without this flag, "discounts" is a dry run: it prints/exports the codes it
                      *would* create, but calls no mutation and writes no data to your store.
  --json/--md/--csv/--out <file>   Output file. Omit to print to stdout.

Environment:
  SHOPIFY_SHOP           my-store.myshopify.com
  SHOPIFY_ACCESS_TOKEN   Admin API access token (read_orders, read_customers; write_discounts for --create)
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i++;
      }
    }
  }
  return { command, opts };
}

function resolveSince(since) {
  if (!since) since = '30';
  if (/^\d+$/.test(since)) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - Number(since));
    return d.toISOString().slice(0, 10);
  }
  return since;
}

function buildQueryString({ since, status }) {
  const terms = [`created_at:>=${resolveSince(since)}`];
  if (status) terms.push(`status:${status}`);
  return terms.join(' ');
}

function writeOutput(file, content) {
  if (!file || file === true) {
    process.stdout.write(content.endsWith('\n') ? content : content + '\n');
  } else {
    fs.writeFileSync(path.resolve(process.cwd(), file), content);
    console.error(`Wrote ${file}`);
  }
}

async function cmdReport(client, opts) {
  const query = buildQueryString(opts);
  const checkouts = await fetchAllAbandonedCheckouts(client, { query });
  const report = buildReport(checkouts);

  if (opts.json) {
    writeOutput(opts.json === true ? null : opts.json, JSON.stringify(report, null, 2));
  }
  if (opts.md || (!opts.json && !opts.md)) {
    writeOutput(opts.md, reportToMarkdown(report, { shop: process.env.SHOPIFY_SHOP }));
  }
}

async function cmdExport(client, opts) {
  const query = buildQueryString(opts);
  const checkouts = await fetchAllAbandonedCheckouts(client, { query });
  const columns = [
    'id', 'name', 'createdAt', 'customerEmail', 'customerName',
    'totalPrice', 'currency', 'country', 'lineItemCount', 'checkoutUrl',
  ];
  writeOutput(opts.csv, toCsv(checkouts, columns));
}

async function cmdDiscounts(client, opts) {
  const query = buildQueryString(opts);
  let checkouts = await fetchAllAbandonedCheckouts(client, { query });
  checkouts = checkouts.filter((c) => c.customerEmail);
  if (opts.limit) checkouts = checkouts.slice(0, Number(opts.limit));

  const percentage = opts.percentage ? Number(opts.percentage) : 0.1;
  const rows = [];

  for (const checkout of checkouts) {
    if (opts.create) {
      const created = await createRecoveryDiscount(client, checkout, { percentage });
      rows.push({
        email: checkout.customerEmail,
        name: checkout.customerName,
        cartValue: checkout.totalPrice,
        currency: checkout.currency,
        checkoutUrl: checkout.checkoutUrl,
        code: created.code,
        status: 'created',
      });
    } else {
      const input = buildRecoveryDiscountInput(checkout, { percentage });
      rows.push({
        email: checkout.customerEmail,
        name: checkout.customerName,
        cartValue: checkout.totalPrice,
        currency: checkout.currency,
        checkoutUrl: checkout.checkoutUrl,
        code: input.code,
        status: 'dry-run (not created — pass --create to actually issue it)',
      });
    }
  }

  writeOutput(opts.out, toCsv(rows, ['email', 'name', 'cartValue', 'currency', 'checkoutUrl', 'code', 'status']));
  console.error(`${rows.length} checkout(s) processed${opts.create ? '' : ' (dry run)'}.`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    console.log(USAGE);
    process.exit(1);
  }
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
    console.log(USAGE);
    process.exit(0);
  }

  const { command, opts } = parseArgs(argv);

  const config = loadConfigFromEnv();
  const client = new AdminGraphQLClient(config);

  switch (command) {
    case 'report':
      await cmdReport(client, opts);
      break;
    case 'export':
      if (!opts.csv) throw new Error('export requires --csv <file>');
      await cmdExport(client, opts);
      break;
    case 'discounts':
      if (!opts.out) throw new Error('discounts requires --out <file>');
      await cmdDiscounts(client, opts);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
