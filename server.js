// server.js (ESM + node-fetch v3 + raw-body + proper DER/SPKI parsing for eBay ECDSA keys)
import express from 'express';
import { createVerify, createPublicKey, createHash } from 'crypto';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { config } from 'dotenv';
import getRawBody from 'raw-body';

// Load .env (ignored on render)
config();

const app = express();
const port = process.env.PORT || 3000;

// --- Raw-body middleware for POST only ---
app.post('/api/ebay-deletion-notice', (req, res, next) => {
  getRawBody(
    req,
    {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: 'utf8',
    },
    (err, string) => {
      if (err) return next(err);
      req.rawBody = string;
      try {
        req.body = JSON.parse(string);
      } catch {
        return res.status(400).send('Invalid JSON');
      }
      next();
    }
  );
});

// --- Challenge verification (GET) ---
app.get('/api/ebay-deletion-notice', (req, res) => {
  const challengeCode = req.query.challenge_code;
  const verificationToken = 'Trak_My_Money_Verification_Token_99';
  const endpoint = 'https://trak-server.onrender.com/api/ebay-deletion-notice';

  const hash = createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  res.status(200).json({ challengeResponse: hash.digest('hex') });
});

// --- Webhook handler (POST) ---
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const rawSigHeader = req.headers['x-ebay-signature'];
  if (!rawSigHeader) {
    console.error('❌ Missing x-ebay-signature header');
    return res.status(400).send('Missing signature');
  }

  // Decode and parse the signature header
  let sigObj;
  try {
    const decoded = Buffer.from(rawSigHeader, 'base64').toString('utf8');
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
    // 1) Fetch the public key from eBay
    const keyRes = await fetch(
      `https://api.ebay.com/commerce/notification/v1/public_key/${kid}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.EBAY_APP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!keyRes.ok) {
      const errData = await keyRes.json();
      console.error('❌ Failed to fetch public key:', errData);
      return res.status(500).send('Failed to fetch public key');
    }
    const { key: rawKey } = await keyRes.json();

    // 2) Parse it correctly into a KeyObject:
    //    - if it's already PEM-wrapped, pass the string directly
    //    - otherwise, treat it as base64 DER/SPKI
    let pubKeyObj;
    if (rawKey.trim().startsWith('-----BEGIN')) {
      pubKeyObj = createPublicKey(rawKey);
    } else {
      const der = Buffer.from(rawKey, 'base64');
      pubKeyObj = createPublicKey({ key: der, format: 'der', type: 'spki' });
    }

    // 3) Verify the signature (raw r||s IEEE-P1363 format)
    const verifier = createVerify(digest.toLowerCase());
    verifier.update(req.rawBody);
    verifier.end();

    const sigBuffer = Buffer.from(signature, 'base64');
    const isValid = verifier.verify(
      { key: pubKeyObj, dsaEncoding: 'ieee-p1363' },
      sigBuffer
    );

    if (!isValid) {
      console.error('❌ Signature validation failed');
      return res.status(412).send('Invalid signature');
    }

    // 4) Success!
    console.log('✅ Signature verified');
    console.log('📨 Deletion payload:', req.body);
    const { userId, username } = req.body.notification?.data ?? {};
    console.log(`🧹 Deletion requested for userId=${userId}, username=${username}`);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Verification error:', err);
    return res.status(500).send('Internal server error');
  }
});

// --- Start the server ---
createServer(app).listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
