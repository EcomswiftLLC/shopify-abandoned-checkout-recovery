'use strict';

const DEFAULT_API_VERSION = '2026-07';

/**
 * Minimal Admin GraphQL client: cost-aware throttle pacing plus retry on
 * HTTP 429 and THROTTLED errors. No dependencies — uses the global fetch
 * available in Node 18+.
 */
class AdminGraphQLClient {
  constructor({ shop, accessToken, apiVersion = DEFAULT_API_VERSION, fetchImpl = fetch, maxRetries = 5 } = {}) {
    if (!shop) throw new Error('shop is required (e.g. my-store.myshopify.com)');
    if (!accessToken) throw new Error('accessToken is required');
    this.endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
    this.maxRetries = maxRetries;
  }

  async request(query, variables = {}, { attempt = 1 } = {}) {
    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429) {
      return this._retryAfter(res, query, variables, attempt);
    }

    const body = await res.json();

    if (!res.ok) {
      throw new Error(`Admin GraphQL HTTP ${res.status}: ${JSON.stringify(body)}`);
    }

    const throttled = (body.errors || []).some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled) {
      return this._retryAfter(res, query, variables, attempt, body);
    }

    if (body.errors?.length) {
      throw new Error(`Admin GraphQL errors: ${JSON.stringify(body.errors)}`);
    }

    return body.data;
  }

  async _retryAfter(res, query, variables, attempt, body) {
    if (attempt > this.maxRetries) {
      throw new Error(`Admin GraphQL throttled after ${this.maxRetries} retries: ${JSON.stringify(body || {})}`);
    }
    const cost = body?.extensions?.cost;
    const restore = cost?.throttleStatus?.restoreRate;
    const requested = cost?.requestedQueryCost;
    let waitMs;
    if (restore && requested) {
      waitMs = Math.max(500, Math.ceil((requested / restore) * 1000));
    } else {
      const retryAfterHeader = Number(res.headers?.get?.('Retry-After'));
      waitMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : 500 * attempt;
    }
    await sleep(waitMs);
    return this.request(query, variables, { attempt: attempt + 1 });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { AdminGraphQLClient, DEFAULT_API_VERSION };
