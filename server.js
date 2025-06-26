// server.js (ESM + node-fetch v3 + raw-body + auto-refreshing eBay OAuth token)
import express from 'express';
import { createVerify, createPublicKey, createHash } from 'crypto';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { config } from 'dotenv';
import getRawBody from 'raw-body';

// ─── Load environment variables from .env ───────────────────────────────────────
config();

// ─── eBay OAuth2 CONFIG & TOKEN CACHE ──────────────────────────────────────────
const EBAY_TOKEN_URL    = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_CLIENT_ID     = process.env.EBAY_CLIENT_ID;     // ← set in .env / Render
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET; // ← set in .env / Render
const EBAY_SCOPES        = process.env.EBAY_SCOPES;        // ← e.g. "https://api.ebay.com/oauth/api_scope/commerce.notification"

let _cachedToken  = null;
let _tokenExpires = 0;

/**
 * Fetches a fresh OAuth token from eBay and caches it in memory.
 */
async function refreshEbayToken() {
  const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope:      EBAY_SCOPES
  });

  const resp = await fetch(EBAY_TOKEN_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    throw new Error('eBay OAuth refresh failed: ' + await resp.text());
  }

  const { access_token, expires_in } = await resp.json();
  _cachedToken  = access_token;
  // expire 60 seconds before to avoid races
  _tokenExpires = Date.now() + (expires_in * 1000) - (60 * 1000);
  console.log(`🔄 eBay token refreshed, expires in ${expires_in}s`);
}

/**
 * Returns a valid OAuth token, refreshing it if necessary.
 */
async function getEbayToken() {
  if (!_cachedToken || Date.now() >= _tokenExpires) {
    await refreshEbayToken();
  }
  return _cachedToken;
}

// ─── EXPRESS SETUP ─────────────────────────────────────────────────────────────
const app = express();
const port = process.env.PORT || 3000;

// ─── Raw-body parser for webhook POSTs ─────────────────────────────────────────
app.post('/api/ebay-deletion-notice', (req, res, next) => {
  getRawBody(
    req,
    { length: req.headers['content-length'], limit: '1mb', encoding: 'utf8' },
    (err, raw) => {
      if (err) return next(err);
      req.rawBody = raw;
      try {
        req.body = JSON.parse(raw);
      } catch {
        return res.status(400).send('Invalid JSON');
      }
      next();
    }
  );
});

// ─── Challenge-response (GET) ─────────────────────────────────────────────────
app.get('/api/ebay-deletion-notice', (req, res) => {
  const challengeCode     = req.query.challenge_code;
  const verificationToken = 'Trak_My_Money_Verification_Token_99';      // ← match your eBay setting
  const endpoint          = 'https://trak-server.onrender.com/api/ebay-deletion-notice'; // ← your endpoint

  const hash = createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  res.status(200).json({ challengeResponse: hash.digest('hex') });
});

// ─── Webhook handler (POST) ───────────────────────────────────────────────────
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const rawHeader = req.headers['x-ebay-signature'];
  if (!rawHeader) {
    console.error('❌ Missing x-ebay-signature header');
    return res.status(400).send('Missing signature');
  }

  // 1) decode signature header
  let sigObj;
  try {
    sigObj = JSON.parse(Buffer.from(rawHeader, 'base64').toString('utf8'));
  } catch (err) {
    console.error('❌ Invalid signature header:', err.message);
    return res.status(400).send('Invalid signature header');
  }
  const { signature, kid, digest } = sigObj;
  if (!signature || !kid || !digest) {
    console.error('❌ Incomplete signature header fields');
    return res.status(400).send('Incomplete signature header');
  }

  try {
    // 2) get a fresh eBay OAuth token
    const token = await getEbayToken();

    // 3) fetch eBay’s public key
    const keyRes = await fetch(
      `https://api.ebay.com/commerce/notification/v1/public_key/${kid}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json'
        }
      }
    );
    if (!keyRes.ok) {
      console.error('❌ Failed to fetch public key:', await keyRes.text());
      return res.status(500).send('Failed to fetch public key');
    }
    const { key: rawKey } = await keyRes.json();

    // 4) strip PEM markers & whitespace, then decode to DER/SPKI
    const b64 = rawKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');
    const der = Buffer.from(b64, 'base64');
    const pubKeyObj = createPublicKey({ key: der, format: 'der', type: 'spki' });

    // 5) verify the payload signature (DER-encoded ECDSA)
    const verifier = createVerify(digest.toLowerCase());
    verifier.update(req.rawBody);
    verifier.end();

    const sigBuf = Buffer.from(signature, 'base64');
    if (!verifier.verify(pubKeyObj, sigBuf)) {
      console.error('❌ Signature validation failed');
      return res.status(412).send('Invalid signature');
    }

    // 6) success!
    console.log('✅ Signature verified, payload:', req.body);
    const { userId, username } = req.body.notification?.data || {};
    try {
      await deleteMarketplaceUser({ userId, username });
    } catch (dbErr) {
      console.error('❌ DB cleanup failed:', dbErr);
      return res.status(202).send('Received but internal cleanup failed');
    }
    console.log(`🧹 Delete userId=${userId}, username=${username}`);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Verification error:', err);
    return res.status(500).send('Internal server error');
  }
});

// ─── Start server ───────────────────────────────────────────────────────────────
createServer(app).listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
