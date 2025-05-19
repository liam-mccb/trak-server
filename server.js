const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/ebay-deletion-notice', (req, res) => {
  console.log('🔔 eBay Account Deletion Notice Received:');
  console.log(req.body);
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
