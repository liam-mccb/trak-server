// server.js
import express from 'express';
import { createVerify, createPublicKey, createHash } from 'crypto';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { config } from 'dotenv';
import getRawBody from 'raw-body';

config(); // load .env

const app = express();
const port = process.env.PORT || 3000;

// --- raw-body middleware ---
app.post('/api/ebay-deletion-notice', (req, res, next) => {
  getRawBody(
    req,
    { length: req.headers['content-length'], limit: '1mb', encoding: 'utf8' },
    (err, string) => {
      if (err) return next(err);
      req.rawBody = string;
      try { req.body = JSON.parse(string); }
      catch { return res.status(400).send('Invalid JSON'); }
      next();
    }
  );
});

// --- challenge-response (GET) ---
app.get('/api/ebay-deletion-notice', (req, res) => {
  const challengeCode = req.query.challenge_code;
  const verificationToken = 'Trak_My_Money_Verification_Token_99';
  const endpoint = 'https://trak-server.onrender.com/api/ebay-deletion-notice';

  const hash = createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  res.json({ challengeResponse: hash.digest('hex') });
});

// --- webhook (POST) ---
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const rawHeader = req.headers['x-ebay-signature'];
  if (!rawHeader) return res.status(400).send('Missing signature');

  let sigObj;
  try {
    sigObj = JSON.parse(Buffer.from(rawHeader, 'base64').toString('utf8'));
  } catch {
    return res.status(400).send('Invalid signature header');
  }

  const { signature, kid, digest } = sigObj;
  if (!signature || !kid || !digest) {
    return res.status(400).send('Incomplete signature header');
  }

  try {
    // fetch eBay public key
    const keyRes = await fetch(
      `https://api.ebay.com/commerce/notification/v1/public_key/${kid}`,
      { headers: {
          'Authorization': `Bearer ${process.env.EBAY_APP_TOKEN}`,
          'Content-Type': 'application/json'
      }}
    );
    if (!keyRes.ok) {
      console.error('Key fetch failed:', await keyRes.text());
      return res.status(500).send('Failed to fetch public key');
    }
    const { key: rawKey } = await keyRes.json();

    // STRIP header/footer & decode to DER
    const b64 = rawKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');
    const der = Buffer.from(b64, 'base64');

    // create a clean KeyObject
    const pubKeyObj = createPublicKey({ key: der, format: 'der', type: 'spki' });

    // verify ECDSA (r||s) signature
    const verifier = createVerify(digest.toLowerCase());
    verifier.update(req.rawBody);
    verifier.end();

    const sigBuf = Buffer.from(signature, 'base64');
    if (!verifier.verify({ key: pubKeyObj, dsaEncoding: 'ieee-p1363' }, sigBuf)) {
      console.error('Signature validation failed');
      return res.status(412).send('Invalid signature');
    }

    console.log('✅ Signature verified, payload:', req.body);
    const { userId, username } = req.body.notification?.data || {};
    console.log(`🧹 Delete userId=${userId}, username=${username}`);
    return res.send('OK');
  } catch (err) {
    console.error('❌ Verification error:', err);
    return res.status(500).send('Internal server error');
  }
});

// start listening
createServer(app).listen(port, () => {
  console.log(`🚀 Listening on port ${port}`);
});
