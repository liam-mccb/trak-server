const express = require('express');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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
app.post('/api/ebay-deletion-notice', (req, res) => {
  console.log('🔔 eBay POST received');
  console.log('✅ Headers:', req.headers);
  console.log('✅ Body:', req.body);
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
