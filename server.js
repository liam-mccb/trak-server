// server.js (ESM + latest node-fetch v3+ support)
import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { createServer } from 'http';
import { config } from 'dotenv';
import getRawBody from 'raw-body';
import forge from 'node-forge';

// Load .env for local dev (Render will ignore this)
config();

const app = express();
const port = process.env.PORT || 3000;

// Raw body parser middleware (POST only)
app.post('/api/ebay-deletion-notice', (req, res, next) => {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: 'utf8',
  }, (err, string) => {
    if (err) return next(err);
    req.rawBody = string;
    try {
      req.body = JSON.parse(string);
    } catch (err) {
      return res.status(400).send('Invalid JSON');
    }
    next();
  });
});

// Challenge verification route
app.get('/api/ebay-deletion-notice', (req, res) => {
  const challengeCode = req.query.challenge_code;
  const verificationToken = 'Trak_My_Money_Verification_Token_99';
  const endpoint = 'https://trak-server.onrender.com/api/ebay-deletion-notice';

  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  const challengeResponse = hash.digest('hex');
  res.status(200).json({ challengeResponse });
});

// Webhook POST handler
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const rawSignatureHeader = req.headers['x-ebay-signature'];

  if (!rawSignatureHeader) {
    console.error('❌ Missing x-ebay-signature header');
    return res.status(400).send('Missing signature');
  }

  // Decode signature
  let decodedSigHeader;
  try {
    const decoded = Buffer.from(rawSignatureHeader, 'base64').toString('utf8');
    decodedSigHeader = JSON.parse(decoded);
    console.log('📦 Decoded signature header:', decodedSigHeader);
  } catch (err) {
    console.error('❌ Failed to parse signature header:', err.message);
    return res.status(400).send('Invalid signature header');
  }

  const { signature, kid, digest } = decodedSigHeader;
  if (!signature || !kid || !digest) {
    console.error('❌ Missing fields in signature header');
    return res.status(400).send('Incomplete signature header');
  }

  try {
    // Fetch public key
    const keyRes = await fetch(`https://api.ebay.com/commerce/notification/v1/public_key/${kid}`, {
      headers: {
        'Authorization': `Bearer ${process.env.EBAY_APP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!keyRes.ok) {
      const errData = await keyRes.json();
      console.error('❌ Key fetch failed:', errData);
      return res.status(500).send('Failed to fetch public key');
    }

    let { key: rawKey } = await keyRes.json();

    // Convert DER (SEC1) to PEM using forge
    const derBuffer = forge.util.createBuffer(forge.util.decode64(rawKey));
    const asn1 = forge.asn1.fromDer(derBuffer);
    const publicKey = forge.pki.publicKeyFromAsn1(asn1);
    const publicKeyPem = forge.pki.publicKeyToPem(publicKey);

    // Verify signature
    const hashAlg = digest.toLowerCase() || 'sha256';
    const verifier = crypto.createVerify(hashAlg);
    verifier.update(req.rawBody);
    verifier.end();

    const signatureBuffer = Buffer.from(signature, 'base64');
    const isValid = verifier.verify(publicKeyPem, signatureBuffer);

    if (!isValid) {
      console.error('❌ Signature validation failed');
      return res.status(412).send('Invalid signature');
    }

    console.log('✅ Signature verified');
    console.log('📨 Deletion payload:', req.body);

    const { userId, username } = req.body.notification?.data || {};
    console.log(`🧹 Deletion requested for userId: ${userId}, username: ${username}`);

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Verification error:', err.message);
    return res.status(500).send('Internal server error');
  }
});

// Start server
createServer(app).listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
