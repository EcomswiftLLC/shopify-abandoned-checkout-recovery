'use strict';

const ABANDONED_CHECKOUTS_QUERY = `
query AbandonedCheckouts($first: Int!, $after: String, $query: String, $sortKey: AbandonedCheckoutSortKeys, $reverse: Boolean) {
  abandonedCheckouts(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        createdAt
        updatedAt
        note
        abandonedCheckoutUrl
        taxesIncluded
        totalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        customer { id firstName lastName defaultEmailAddress { emailAddress } }
        billingAddress { country countryCodeV2 provinceCode }
        lineItems(first: 50) {
          edges {
            node {
              title
              quantity
              sku
              originalTotalPriceSet { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    }
  }
}
`;

/** Flattens one raw GraphQL edge.node into a plain, easy-to-consume record. */
function normalizeCheckout(node) {
  const money = (set) => (set ? Number(set.shopMoney.amount) : 0);
  const currency = node.totalPriceSet?.shopMoney?.currencyCode || 'USD';

  return {
    id: node.id,
    name: node.name || null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    note: node.note || null,
    checkoutUrl: node.abandonedCheckoutUrl || null,
    currency,
    totalPrice: money(node.totalPriceSet),
    subtotalPrice: money(node.subtotalPriceSet),
    taxesIncluded: !!node.taxesIncluded,
    customerId: node.customer?.id || null,
    customerName: [node.customer?.firstName, node.customer?.lastName].filter(Boolean).join(' ') || null,
    customerEmail: node.customer?.defaultEmailAddress?.emailAddress || null,
    country: node.billingAddress?.country || null,
    countryCode: node.billingAddress?.countryCodeV2 || null,
    lineItemCount: (node.lineItems?.edges || []).reduce((sum, e) => sum + (e.node.quantity || 0), 0),
    lineItems: (node.lineItems?.edges || []).map((e) => ({
      title: e.node.title,
      quantity: e.node.quantity,
      sku: e.node.sku || null,
      total: Number(e.node.originalTotalPriceSet?.shopMoney?.amount || 0),
    })),
  };
}

/**
 * Fetches every abandoned checkout matching `query` (Shopify search syntax,
 * e.g. "created_at:>=2026-09-01") by following cursor pagination.
 * `client` is an AdminGraphQLClient instance (or anything with a compatible
 * `.request(query, variables)` method — swap in a fake for tests).
 */
async function fetchAllAbandonedCheckouts(client, { query = null, sortKey = 'CREATED_AT', reverse = true, pageSize = 50, onPage } = {}) {
  const results = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await client.request(ABANDONED_CHECKOUTS_QUERY, {
      first: pageSize,
      after,
      query,
      sortKey,
      reverse,
    });

    const connection = data.abandonedCheckouts;
    const page = connection.edges.map((e) => normalizeCheckout(e.node));
    results.push(...page);
    if (typeof onPage === 'function') onPage(page);

    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }

  return results;
}

module.exports = { ABANDONED_CHECKOUTS_QUERY, normalizeCheckout, fetchAllAbandonedCheckouts };
