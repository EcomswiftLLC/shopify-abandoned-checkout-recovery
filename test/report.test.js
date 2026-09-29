'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport, ageBucket, reportToMarkdown } = require('../lib/report');

function checkout(overrides = {}) {
  return {
    id: '1',
    createdAt: '2026-09-01T00:00:00Z',
    currency: 'USD',
    totalPrice: 50,
    customerEmail: 'a@example.com',
    country: 'United States',
    lineItems: [{ title: 'Widget', quantity: 1, total: 50 }],
    ...overrides,
  };
}

test('buildReport handles an empty list without dividing by zero', () => {
  const report = buildReport([]);
  assert.equal(report.count, 0);
  assert.equal(report.totalValue, 0);
  assert.equal(report.averageValue, 0);
});

test('buildReport aggregates total, average, and email contactability', () => {
  const report = buildReport([
    checkout({ totalPrice: 30 }),
    checkout({ totalPrice: 70, customerEmail: null }),
  ]);
  assert.equal(report.count, 2);
  assert.equal(report.totalValue, 100);
  assert.equal(report.averageValue, 50);
  assert.equal(report.withEmail, 1);
  assert.equal(report.withoutEmail, 1);
});

test('buildReport groups by day and by country with rounded values', () => {
  const report = buildReport([
    checkout({ createdAt: '2026-09-01T00:00:00Z', totalPrice: 10.005, country: 'US' }),
    checkout({ createdAt: '2026-09-01T12:00:00Z', totalPrice: 10.005, country: 'US' }),
    checkout({ createdAt: '2026-09-02T00:00:00Z', totalPrice: 5, country: 'Canada' }),
  ]);
  assert.deepEqual(report.byDay, [
    { day: '2026-09-01', count: 2, value: 20.01 },
    { day: '2026-09-02', count: 1, value: 5 },
  ]);
  assert.equal(report.byCountry[0].key, 'US');
  assert.equal(report.byCountry[0].count, 2);
});

test('buildReport ranks top products by recoverable value', () => {
  const report = buildReport([
    checkout({ lineItems: [{ title: 'A', quantity: 1, total: 100 }] }),
    checkout({ lineItems: [{ title: 'B', quantity: 5, total: 20 }] }),
  ]);
  assert.equal(report.topProducts[0].title, 'A');
  assert.equal(report.topProducts[0].value, 100);
});

test('ageBucket classifies checkout age into human buckets', () => {
  const now = new Date('2026-09-10T00:00:00Z');
  assert.equal(ageBucket('2026-09-09T23:30:00Z', now), 'under 1h');
  assert.equal(ageBucket('2026-09-09T01:00:00Z', now), '1h - 24h');
  assert.equal(ageBucket('2026-09-07T01:00:00Z', now), '1 - 3 days');
  assert.equal(ageBucket('2026-09-04T01:00:00Z', now), '3 - 7 days');
  assert.equal(ageBucket('2026-08-01T00:00:00Z', now), 'over 7 days');
});

test('reportToMarkdown renders a readable summary and handles the empty case', () => {
  const empty = reportToMarkdown(buildReport([]), { shop: 'test-shop' });
  assert.match(empty, /No abandoned checkouts/);

  const md = reportToMarkdown(buildReport([checkout()]), { shop: 'test-shop' });
  assert.match(md, /test-shop/);
  assert.match(md, /\*\*1\*\* abandoned checkouts worth \*\*50 USD\*\*/);
});
