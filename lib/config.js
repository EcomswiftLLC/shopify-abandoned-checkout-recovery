'use strict';

/** Reads shop credentials from the environment. Throws with a clear message if missing. */
function loadConfigFromEnv(env = process.env) {
  const shop = env.SHOPIFY_SHOP;
  const accessToken = env.SHOPIFY_ACCESS_TOKEN;

  if (!shop || !accessToken) {
    throw new Error(
      'Missing SHOPIFY_SHOP and/or SHOPIFY_ACCESS_TOKEN environment variables.\n' +
      'Set them, e.g.:\n' +
      '  export SHOPIFY_SHOP=my-store.myshopify.com\n' +
      '  export SHOPIFY_ACCESS_TOKEN=shpat_xxxxx\n' +
      'The token needs read_orders + read_customers scopes for reports, and also\n' +
      'write_discounts to issue recovery codes with --create-discounts.'
    );
  }

  return { shop, accessToken, apiVersion: env.SHOPIFY_API_VERSION || undefined };
}

module.exports = { loadConfigFromEnv };
