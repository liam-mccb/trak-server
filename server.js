// server.js (ESM + node-fetch v3 + raw-body + DER/SPKI key parsing + DER ECDSA signatures)
import express from 'express';
import { createVerify, createPublicKey, createHash } from 'crypto';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { config } from 'dotenv';
import getRawBody from 'raw-body';

// Load environment variables from .env (ignored on Render)
config();

const app = express();
const port = process.env.PORT || 3000;

// ─── Raw‐body middleware (POST only) ───────────────────────────────────────────
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

// ─── Challenge verification (GET) ─────────────────────────────────────────────
app.get('/api/ebay-deletion-notice', (req, res) => {
  const challengeCode     = req.query.challenge_code;
  const verificationToken = 'Trak_My_Money_Verification_Token_99';       // ← change to your token
  const endpoint          = 'https://trak-server.onrender.com/api/ebay-deletion-notice'; // ← change to your URL

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

  // Decode the base64‐encoded JSON header
  let sigObj;
  try {
    const decoded = Buffer.from(rawHeader, 'base64').toString('utf8');
    sigObj = JSON.parse(decoded);
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
    // 1) Fetch eBay’s public key for this `kid`
    const keyRes = await fetch(
      `https://api.ebay.com/commerce/notification/v1/public_key/${kid}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.EBAY_APP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    if (!keyRes.ok) {
      const errTxt = await keyRes.text();
      console.error('❌ Failed to fetch public key:', errTxt);
      return res.status(500).send('Failed to fetch public key');
    }
    const { key: rawKey } = await keyRes.json();

    // 2) Strip PEM markers (if any), clean whitespace, and base64-decode to DER
    const b64 = rawKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');
    const der = Buffer.from(b64, 'base64');

    // 3) Build a KeyObject from the DER/SPKI buffer
    const pubKeyObj = createPublicKey({ key: der, format: 'der', type: 'spki' });

    // 4) Verify the payload signature (DER‐encoded ECDSA)
    const verifier = createVerify(digest.toLowerCase());
    verifier.update(req.rawBody);
    verifier.end();

    const sigBuf = Buffer.from(signature, 'base64');
    const isValid = verifier.verify(pubKeyObj, sigBuf);
    if (!isValid) {
      console.error('❌ Signature validation failed');
      return res.status(412).send('Invalid signature');
    }

    // ─── Success ────────────────────────────────────────────────────────────────
    console.log('✅ Signature verified');
    console.log('📨 Payload:', req.body);

    const { userId, username } = req.body.notification?.data || {};
    console.log(`🧹 Delete userId=${userId}, username=${username}`);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Verification error:', err);
    return res.status(500).send('Internal server error');
  }
});

// ─── Start HTTP server ────────────────────────────────────────────────────────
createServer(app).listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
