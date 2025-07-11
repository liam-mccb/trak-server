// ebayAuth.js ─ gets + caches an eBay OAuth token
import fetch from 'node-fetch';

let cache = { access_token: null, expires_at: 0 };

export async function getEbayToken() {
  const now = Date.now() / 1000;
  if (cache.access_token && now < cache.expires_at - 60) {
    return cache.access_token;          // still valid
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: process.env.EBAY_SCOPES          // one long scope string
  });

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(
          `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
        ).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay OAuth ${res.status} → ${text}`);
  }
  const data = await res.json();

  cache = {
    access_token: data.access_token,
    expires_at:   now + data.expires_in
  };
  return data.access_token;
}
