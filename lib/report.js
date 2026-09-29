'use strict';

/** Buckets a checkout's age (now - createdAt) into a human time-to-abandon label. */
function ageBucket(createdAt, now = new Date()) {
  const hours = (now.getTime() - new Date(createdAt).getTime()) / 36e5;
  if (hours < 1) return 'under 1h';
  if (hours < 24) return '1h - 24h';
  if (hours < 72) return '1 - 3 days';
  if (hours < 168) return '3 - 7 days';
  return 'over 7 days';
}

function dayKey(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

/**
 * Builds a recovery-opportunity report from a list of normalized checkouts
 * (see lib/checkouts.js normalizeCheckout). Pure function — no network,
 * fully unit-testable.
 */
function buildReport(checkouts, { now = new Date() } = {}) {
  if (checkouts.length === 0) {
    return {
      count: 0,
      totalValue: 0,
      averageValue: 0,
      currency: 'USD',
      byDay: [],
      byCountry: [],
      byAgeBucket: [],
      topProducts: [],
      withEmail: 0,
      withoutEmail: 0,
    };
  }

  const currency = checkouts[0].currency;
  const totalValue = round2(checkouts.reduce((sum, c) => sum + c.totalPrice, 0));
  const withEmail = checkouts.filter((c) => c.customerEmail).length;

  const byDayMap = new Map();
  const byCountryMap = new Map();
  const byAgeMap = new Map();
  const productMap = new Map();

  for (const c of checkouts) {
    const day = dayKey(c.createdAt);
    byDayMap.set(day, {
      count: (byDayMap.get(day)?.count || 0) + 1,
      value: (byDayMap.get(day)?.value || 0) + c.totalPrice,
    });

    const country = c.country || 'Unknown';
    byCountryMap.set(country, {
      count: (byCountryMap.get(country)?.count || 0) + 1,
      value: (byCountryMap.get(country)?.value || 0) + c.totalPrice,
    });

    const bucket = ageBucket(c.createdAt, now);
    byAgeMap.set(bucket, (byAgeMap.get(bucket) || 0) + 1);

    for (const item of c.lineItems) {
      const key = item.title || 'Unknown item';
      productMap.set(key, {
        quantity: (productMap.get(key)?.quantity || 0) + item.quantity,
        value: (productMap.get(key)?.value || 0) + item.total,
      });
    }
  }

  const sortByValueDesc = (map) =>
    [...map.entries()].map(([key, v]) => ({ key, ...v, value: round2(v.value) })).sort((a, b) => b.value - a.value);

  return {
    count: checkouts.length,
    totalValue,
    averageValue: round2(totalValue / checkouts.length),
    currency,
    withEmail,
    withoutEmail: checkouts.length - withEmail,
    byDay: [...byDayMap.entries()].map(([day, v]) => ({ day, count: v.count, value: round2(v.value) })).sort((a, b) => a.day.localeCompare(b.day)),
    byCountry: sortByValueDesc(byCountryMap),
    byAgeBucket: ['under 1h', '1h - 24h', '1 - 3 days', '3 - 7 days', 'over 7 days']
      .map((bucket) => ({ bucket, count: byAgeMap.get(bucket) || 0 }))
      .filter((b) => b.count > 0),
    topProducts: sortByValueDesc(productMap).slice(0, 10).map((p) => ({ title: p.key, quantity: p.quantity, value: p.value })),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Renders a report object as a Markdown summary for a CLI/CI artifact. */
function reportToMarkdown(report, { shop = 'your store' } = {}) {
  if (report.count === 0) {
    return `# Abandoned checkout recovery report — ${shop}\n\nNo abandoned checkouts matched the given filters.\n`;
  }

  const lines = [
    `# Abandoned checkout recovery report — ${shop}`,
    '',
    `- **${report.count}** abandoned checkouts worth **${report.totalValue} ${report.currency}**`,
    `- Average cart value: **${report.averageValue} ${report.currency}**`,
    `- Contactable (has email on file): **${report.withEmail}** of ${report.count} (${Math.round((report.withEmail / report.count) * 100)}%)`,
    '',
    '## By age since abandoned',
    ...report.byAgeBucket.map((b) => `- ${b.bucket}: ${b.count}`),
    '',
    '## Top recoverable products',
    ...report.topProducts.map((p) => `- ${p.title} — qty ${p.quantity}, ${p.value} ${report.currency}`),
    '',
    '## By country',
    ...report.byCountry.slice(0, 10).map((c) => `- ${c.key}: ${c.count} checkouts, ${c.value} ${report.currency}`),
    '',
  ];
  return lines.join('\n');
}

module.exports = { buildReport, ageBucket, reportToMarkdown };
