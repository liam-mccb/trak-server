// server.js (ESM + node-fetch v3 + raw-body + ECDSA-ieee-p1363 support)
import express from 'express';
import { createVerify, createPublicKey, createHash } from 'crypto';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { config } from 'dotenv';
import getRawBody from 'raw-body';

// Load .env (ignored on Render)
config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware: capture raw JSON body for POSTs
app.post('/api/ebay-deletion-notice', (req, res, next) => {
  getRawBody(
    req,
    { length: req.headers['content-length'], limit: '1mb', encoding: 'utf8' },
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

// Challenge verification (GET)
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

// Webhook POST handler
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const rawSigHeader = req.headers['x-ebay-signature'];
  if (!rawSigHeader) return res.status(400).send('Missing signature');

  // decode signature header
  let sigObj;
  try {
    sigObj = JSON.parse(Buffer.from(rawSigHeader, 'base64').toString('utf8'));
  } catch {
    return res.status(400).send('Invalid signature header');
  }

  const { signature, kid, digest } = sigObj;
  if (!signature || !kid || !digest) {
    return res.status(400).send('Incomplete signature header');
  }

  try {
    // fetch public key
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
      const errData = await keyRes.json();
      console.error('Key fetch failed:', errData);
      return res.status(500).send('Failed to fetch public key');
    }

    const { key: kib } = await keyRes.json();

    // use eBay's PEM if present, otherwise wrap raw base64
    const publicKeyPem = kib.startsWith('-----BEGIN ')
      ? kib
      : `-----BEGIN PUBLIC KEY-----\n${kib.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;

    // create a KeyObject
    const pubKeyObj = createPublicKey(publicKeyPem);

    // verify signature (r||s IEEE-P1363 format)
    const verifier = createVerify(digest.toLowerCase());
    verifier.update(req.rawBody);
    verifier.end();

    const sigBuf = Buffer.from(signature, 'base64');
    const isValid = verifier.verify(
      { key: pubKeyObj, dsaEncoding: 'ieee-p1363' },
      sigBuf
    );

    if (!isValid) {
      console.error('Signature validation failed');
      return res.status(412).send('Invalid signature');
    }

    console.log('Signature verified');
    console.log('Deletion payload:', req.body);

    const { userId, username } = req.body.notification?.data ?? {};
    console.log(`Deletion requested for userId=${userId}, username=${username}`);

    return res.send('OK');
  } catch (err) {
    console.error('Verification error:', err);
    return res.status(500).send('Internal server error');
  }
});

// start server
createServer(app).listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
