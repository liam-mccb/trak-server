// ebaySearch.js  ─ query the eBay Browse API with an auto-refreshed OAuth token
import fetch from 'node-fetch';
import { getEbayToken } from './ebayAuth.js';   // ← step-1 gave you this helper

const EBAY_ENDPOINT =
  'https://api.ebay.com/buy/browse/v1/item_summary/search';

/**
 * Returns up to `limit` listings that match `query`.
 * Each element is the raw object eBay returns (itemSummaries).
 *
 * @param {string} query   – user search text (“charizard holo 1st gen”)
 * @param {number} limit   – number of listings to pull (default 20, max 200)
 */
export async function searchEbay(query, limit = 20) {
  const token = await getEbayToken();

  const res = await fetch(
    `${EBAY_ENDPOINT}?q=${encodeURIComponent(query)}&limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json'
      }
    }
  );

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`eBay search failed (${res.status}): ${msg}`);
  }

  const data = await res.json();
  return data.itemSummaries ?? [];        // return an empty array on “no matches”
}
