const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const getRawBody = require('raw-body');

const app = express();
const port = process.env.PORT || 3000;

// Middleware to capture raw JSON body
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

// POST route for eBay deletion notice with full signature verification
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const signature = req.headers['x-ebay-signature'];
  if (!signature) {
    console.error('❌ Missing x-ebay-signature header');
    return res.status(400).send('Missing signature');
  }

  const parts = signature.split('.');
  if (parts.length !== 3) {
    console.error('❌ Invalid JWT format in x-ebay-signature');
    return res.status(400).send('Malformed signature');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let decodedHeader;
  try {
    decodedHeader = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    console.log('📦 Decoded JWT header:', decodedHeader);
  } catch (err) {
    console.error('❌ Could not decode JWT header');
    return res.status(400).send('Bad JWT header');
  }

  const keyId = decodedHeader.kid;
  if (!keyId) {
    console.error('❌ Missing key ID (kid) in JWT header');
    return res.status(400).send('Missing key ID');
  }

  try {
    const pubKeyRes = await axios.get(`https://api.ebay.com/commerce/notification/v1/public_key/${keyId}`);
    const publicKeyPem = pubKeyRes.data.key;

    // ✅ Full JWT verification against public key
    jwt.verify(signature, publicKeyPem, {
      algorithms: ['RS256']
    });

    console.log('✅ Signature verified');
    console.log('📨 Received deletion payload:', req.body);

    const { userId, username } = req.body.notification?.data || {};
    console.log(`🧹 Deletion requested for userId: ${userId}, username: ${username}`);

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Signature verification failed:', err.message);
    res.status(412).send('Invalid signature');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
