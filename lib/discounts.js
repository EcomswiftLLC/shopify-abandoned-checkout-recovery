'use strict';

const crypto = require('crypto');

const CREATE_DISCOUNT_MUTATION = `
mutation CreateRecoveryDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          title
          codes(first: 1) { nodes { code } }
        }
      }
    }
    userErrors { field message code }
  }
}
`;

/** Deterministic-length, collision-resistant single-use code, e.g. COMEBACK-7F3A2C1B. */
function generateRecoveryCode({ prefix = 'COMEBACK', checkoutId = '' } = {}) {
  const seed = checkoutId ? `${checkoutId}:${Date.now()}` : `${Date.now()}:${Math.random()}`;
  const suffix = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

/**
 * Builds the DiscountCodeBasicInput for a single-use, single-customer
 * recovery discount tied to one abandoned checkout. Pure function.
 */
function buildRecoveryDiscountInput(checkout, { percentage = 0.1, prefix = 'COMEBACK', startsAt = new Date() } = {}) {
  if (percentage <= 0 || percentage >= 1) {
    throw new Error('percentage must be between 0 and 1 (exclusive), e.g. 0.1 for 10%');
  }
  const code = generateRecoveryCode({ prefix, checkoutId: checkout.id });
  return {
    title: `Recovery — ${checkout.name || checkout.id}`,
    code,
    startsAt: new Date(startsAt).toISOString(),
    customerSelection: { all: true },
    customerGets: {
      items: { all: true },
      value: { percentage },
    },
    usageLimit: 1,
    appliesOncePerCustomer: true,
  };
}

/**
 * Creates one recovery discount code via the Admin API. Returns
 * { checkoutId, code, discountNodeId } on success. `client` is an
 * AdminGraphQLClient (or a compatible fake for tests).
 */
async function createRecoveryDiscount(client, checkout, options = {}) {
  const input = buildRecoveryDiscountInput(checkout, options);
  const data = await client.request(CREATE_DISCOUNT_MUTATION, { basicCodeDiscount: input });
  const result = data.discountCodeBasicCreate;

  if (result.userErrors?.length) {
    throw new Error(`discountCodeBasicCreate failed for ${checkout.id}: ${JSON.stringify(result.userErrors)}`);
  }

  return {
    checkoutId: checkout.id,
    code: result.codeDiscountNode.codeDiscount.codes.nodes[0].code,
    discountNodeId: result.codeDiscountNode.id,
  };
}

module.exports = { CREATE_DISCOUNT_MUTATION, generateRecoveryCode, buildRecoveryDiscountInput, createRecoveryDiscount };
