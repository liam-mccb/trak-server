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
  const rawSignatureHeader = req.headers['x-ebay-signature'];

  if (!rawSignatureHeader) {
    console.error('❌ Missing x-ebay-signature header');
    return res.status(400).send('Missing signature');
  }

  // Step 1: Decode base64 header
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
    // Step 2: Fetch the public key
    const response = await axios.get(
      `https://api.ebay.com/commerce/notification/v1/public_key/${kid}`,
      {
        headers: {
          Authorization: 'Bearer ${process.env.EBAY_APP_TOKEN}'
        },
      }
    );
    const publicKeyPem = response.data.key;

    // Step 3: Hash the raw body using the specified digest algorithm
    const hashAlg = digest.toLowerCase(); // e.g., 'sha1'
    const bodyHash = crypto.createHash(hashAlg).update(req.rawBody).digest();

    // Step 4: Decode the signature from base64
    const signatureBuffer = Buffer.from(signature, 'base64');

    // Step 5: Verify using crypto
    const isValid = crypto.verify(
      hashAlg,
      bodyHash,
      {
        key: publicKeyPem,
        format: 'pem',
        type: 'spki',
      },
      signatureBuffer
    );

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


// Start the server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
