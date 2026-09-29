'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateRecoveryCode, buildRecoveryDiscountInput, createRecoveryDiscount } = require('../lib/discounts');

test('generateRecoveryCode produces a prefixed, upper-case code', () => {
  const code = generateRecoveryCode({ checkoutId: 'gid://shopify/AbandonedCheckout/1' });
  assert.match(code, /^COMEBACK-[0-9A-F]{8}$/);
});

test('generateRecoveryCode is different for different checkouts', () => {
  const a = generateRecoveryCode({ checkoutId: 'gid://shopify/AbandonedCheckout/1' });
  const b = generateRecoveryCode({ checkoutId: 'gid://shopify/AbandonedCheckout/2' });
  assert.notEqual(a, b);
});

test('buildRecoveryDiscountInput builds a single-use, single-customer discount input', () => {
  const checkout = { id: 'gid://shopify/AbandonedCheckout/1', name: '#C1' };
  const input = buildRecoveryDiscountInput(checkout, { percentage: 0.15, startsAt: '2026-09-01T00:00:00Z' });

  assert.equal(input.usageLimit, 1);
  assert.equal(input.appliesOncePerCustomer, true);
  assert.deepEqual(input.customerSelection, { all: true });
  assert.deepEqual(input.customerGets, { items: { all: true }, value: { percentage: 0.15 } });
  assert.equal(input.startsAt, '2026-09-01T00:00:00.000Z');
  assert.match(input.code, /^COMEBACK-[0-9A-F]{8}$/);
  assert.match(input.title, /#C1/);
});

test('buildRecoveryDiscountInput rejects an out-of-range percentage', () => {
  const checkout = { id: '1', name: '#C1' };
  assert.throws(() => buildRecoveryDiscountInput(checkout, { percentage: 0 }));
  assert.throws(() => buildRecoveryDiscountInput(checkout, { percentage: 1 }));
  assert.throws(() => buildRecoveryDiscountInput(checkout, { percentage: 1.5 }));
});

test('createRecoveryDiscount returns the created code on success', async () => {
  const checkout = { id: 'gid://shopify/AbandonedCheckout/1', name: '#C1' };
  const fakeClient = {
    request: async () => ({
      discountCodeBasicCreate: {
        codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/1', codeDiscount: { codes: { nodes: [{ code: 'COMEBACK-ABC12345' }] } } },
        userErrors: [],
      },
    }),
  };

  const result = await createRecoveryDiscount(fakeClient, checkout);
  assert.equal(result.checkoutId, checkout.id);
  assert.equal(result.code, 'COMEBACK-ABC12345');
  assert.equal(result.discountNodeId, 'gid://shopify/DiscountCodeNode/1');
});

test('createRecoveryDiscount throws with the userErrors payload on failure', async () => {
  const checkout = { id: 'gid://shopify/AbandonedCheckout/1', name: '#C1' };
  const fakeClient = {
    request: async () => ({
      discountCodeBasicCreate: {
        codeDiscountNode: null,
        userErrors: [{ field: ['code'], message: 'Code already exists' }],
      },
    }),
  };

  await assert.rejects(() => createRecoveryDiscount(fakeClient, checkout), /Code already exists/);
});
