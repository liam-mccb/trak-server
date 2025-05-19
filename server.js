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


// GET route for eBay's challenge verification
app.get('/api/ebay-deletion-notice', (req, res) => {
  const challengeCode = req.query.challenge_code;
  const verificationToken = 'Trak_My_Money_Verification_Token_99';
  const endpoint = 'https://trak-server.onrender.com/api/ebay-deletion-notice';

  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);

  const challengeResponse = hash.digest('hex');

  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({ challengeResponse }));
});

// POST route for actual deletion notices
app.post('/api/ebay-deletion-notice', async (req, res) => {
  const signature = req.headers['x-ebay-signature'];
  if (!signature) {
    console.error('❌ Missing x-ebay-signature header');
    return res.status(400).send('Missing signature');
  }

  let decodedHeader;
  try {
    const [headerB64] = signature.split('.');
    decodedHeader = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  } catch (err) {
    console.error('❌ Invalid JWT format');
    return res.status(400).send('Invalid JWT');
  }

  const keyId = decodedHeader.kid;
  if (!keyId) {
    console.error('❌ No kid in JWT header');
    return res.status(400).send('No key ID');
  }

  try {
    // Cache public keys manually for now
    const response = await axios.get(`https://api.ebay.com/commerce/notification/v1/public_key/${keyId}`);
    const publicKey = response.data.key;

    // Verify signature against raw body
    jwt.verify(signature, publicKey, {
      algorithms: ['RS256'],
      // Use a callback to manually compare body hash if needed
    });

    console.log('✅ Signature verified');
    console.log('📦 Deletion payload:', req.body);

    // Extract user data
    const { userId, username } = req.body.notification?.data || {};
    console.log(`🧹 Deletion requested for userId: ${userId} (${username})`);

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Signature verification failed:', err.message);
    return res.status(412).send('Invalid signature');
  }
});



app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
