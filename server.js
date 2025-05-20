const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const getRawBody = require('raw-body');
require('dotenv').config(); // Loads .env

const app = express();
const port = process.env.PORT || 3000;

// Middleware to get raw body (needed for digest hash)
app.use('/api/ebay-deletion-notice', (req, res, next) => {
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

// GET route for eBay challenge verification
app.get('/api/ebay-deletion-notice', (req, res) => {
  const challengeCode = req.query.challenge_code;
  const verificationToken = 'Trak_My_Money_Verification_Token_99';
  const endpoint = 'https://trak-server.onrender.com/api/ebay-deletion-notice';

  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  const challengeResponse = hash.digest('hex');

  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({ challengeResponse }));
});

// POST route to handle signed eBay deletion notices
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const rawSignatureHeader = req.headers['x-ebay-signature'];

  if (!rawSignatureHeader) {
    console.error('❌ Missing x-ebay-signature header');
    return res.status(400).send('Missing signature');
  }

  // Step 1: Decode the signature header
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
    console.error('❌ Missing required fields in signature header');
    return res.status(400).send('Incomplete signature header');
  }

  try {
    // Step 2: Fetch the public key using eBay API
    const keyRes = await fetch(`https://api.ebay.com/commerce/notification/v1/public_key/${kid}`, {
      headers: {
        'Authorization': `Bearer ${process.env.EBAY_APP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!keyRes.ok) {
      const errData = await keyRes.json();
      console.error('❌ eBay Key Fetch Failed:', errData);
      return res.status(500).send('Failed to fetch public key');
    }

    let { key: rawKey } = await keyRes.json();

    // Step 3: Normalize PEM format if needed
    let publicKeyPem = rawKey.includes('BEGIN PUBLIC KEY')
      ? rawKey
      : `-----BEGIN PUBLIC KEY-----\n${rawKey.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;

    // Step 4: Verify signature
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

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Verification error:', err.message);
    return res.status(500).send('Server error during signature verification');
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
