const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/ebay-deletion-notice', (req, res) => {
  console.log('🔔 eBay POST received');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  // Confirm the verification token if it exists
  if (req.body.verificationToken) {
    console.log('✅ Verification token received:', req.body.verificationToken);
  }

  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
