// itemsRoutes.js ─ /items endpoints
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { searchEbay } from './ebaySearch.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /items/search?query=<text>
 *  →  { itemId, currentPrice, listings:[…] }
 */
router.get('/search', async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query missing' });

    // 1  fetch eBay listings
    const listings = await searchEbay(query);

    // 2  derive a median Buy-It-Now price
    const prices = listings
      .filter(l => l.price?.value)
      .map(l => Number(l.price.value))
      .sort((a, b) => a - b);

    if (!prices.length) {
      return res.json({ itemId: null, currentPrice: null, listings: [] });
    }
    const currentPrice = prices[Math.floor(prices.length / 2)];

    // 3  upsert the parent Item (logical card)
    const item = await prisma.item.upsert({
      where:  { ebayQuery: query },
      create: { name: query, ebayQuery: query },
      update: {}
    });

    // 4  upsert the Raw variant for this Item
    const RAW = -1;

    const variant = await prisma.cardVariant.upsert({
    where: {
        itemId_gradeLabel_gradeValue: {
        itemId: item.id,
        gradeLabel: 'Raw',
        gradeValue: RAW
        }
    },
    create: {
        itemId: item.id,
        gradeLabel: 'Raw',
        gradeValue: RAW
    },
    update: {}
    });

    // 5  store today’s price snapshot for that variant
    await prisma.priceSnapshot.create({
      data: { variantId: variant.id, priceUsd: currentPrice }
    });    

    // 6  respond
    res.json({ itemId: item.id, currentPrice, listings });
  } catch (err) {
    next(err);
  }
});

export default router;
