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

    // 3  upsert Item and save snapshot
    const item = await prisma.item.upsert({
      where:  { ebayQuery: query },
      create: { name: query, ebayQuery: query },
      update: {}
    });

    await prisma.priceSnapshot.create({
      data: { itemId: item.id, priceUsd: currentPrice }
    });

    // 4  respond
    res.json({ itemId: item.id, currentPrice, listings });
  } catch (err) {
    next(err);
  }
});

export default router;
