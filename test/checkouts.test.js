'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCheckout, fetchAllAbandonedCheckouts } = require('../lib/checkouts');

function makeNode(overrides = {}) {
  return {
    id: 'gid://shopify/AbandonedCheckout/1',
    name: '#C1',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T01:00:00Z',
    note: null,
    abandonedCheckoutUrl: 'https://example.myshopify.com/checkout/recover/1',
    taxesIncluded: false,
    totalPriceSet: { shopMoney: { amount: '49.99', currencyCode: 'USD' } },
    subtotalPriceSet: { shopMoney: { amount: '44.99', currencyCode: 'USD' } },
    customer: { id: 'gid://shopify/Customer/1', firstName: 'Ada', lastName: 'Lovelace', defaultEmailAddress: { emailAddress: 'ada@example.com' } },
    billingAddress: { country: 'United States', countryCodeV2: 'US', provinceCode: 'CA' },
    lineItems: { edges: [{ node: { title: 'Widget', quantity: 2, sku: 'WID-1', originalTotalPriceSet: { shopMoney: { amount: '44.99', currencyCode: 'USD' } } } }] },
    ...overrides,
  };
}

test('normalizeCheckout flattens money, customer and line items', () => {
  const result = normalizeCheckout(makeNode());
  assert.equal(result.totalPrice, 49.99);
  assert.equal(result.currency, 'USD');
  assert.equal(result.customerEmail, 'ada@example.com');
  assert.equal(result.customerName, 'Ada Lovelace');
  assert.equal(result.country, 'United States');
  assert.equal(result.lineItemCount, 2);
  assert.deepEqual(result.lineItems, [{ title: 'Widget', quantity: 2, sku: 'WID-1', total: 44.99 }]);
});

test('normalizeCheckout tolerates missing customer/address/lineItems', () => {
  const result = normalizeCheckout(makeNode({ customer: null, billingAddress: null, lineItems: null }));
  assert.equal(result.customerEmail, null);
  assert.equal(result.customerName, null);
  assert.equal(result.country, null);
  assert.deepEqual(result.lineItems, []);
  assert.equal(result.lineItemCount, 0);
});

test('fetchAllAbandonedCheckouts follows cursor pagination to completion', async () => {
  const pages = [
    { abandonedCheckouts: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, edges: [{ node: makeNode({ id: 'a' }) }] } },
    { abandonedCheckouts: { pageInfo: { hasNextPage: true, endCursor: 'c2' }, edges: [{ node: makeNode({ id: 'b' }) }] } },
    { abandonedCheckouts: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [{ node: makeNode({ id: 'c' }) }] } },
  ];
  let call = 0;
  const seenAfter = [];
  const fakeClient = {
    request: async (_query, variables) => {
      seenAfter.push(variables.after);
      return pages[call++];
    },
  };

  const results = await fetchAllAbandonedCheckouts(fakeClient, { query: 'status:open' });

  assert.equal(results.length, 3);
  assert.deepEqual(results.map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(seenAfter, [null, 'c1', 'c2']);
});

test('fetchAllAbandonedCheckouts calls onPage per page', async () => {
  const pages = [
    { abandonedCheckouts: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [{ node: makeNode() }, { node: makeNode({ id: 'x' }) }] } },
  ];
  let call = 0;
  const seenPages = [];
  const fakeClient = { request: async () => pages[call++] };

  await fetchAllAbandonedCheckouts(fakeClient, { onPage: (page) => seenPages.push(page.length) });

  assert.deepEqual(seenPages, [2]);
});
