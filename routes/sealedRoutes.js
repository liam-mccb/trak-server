// itemsRoutes.js ─ /items endpoints
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { searchEbay } from '../services/ebay/ebaySearch.js';

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
      return res.json({ productId: null, variantId: null, currentPrice: null, listings: [] });
    }

    const currentPrice = prices[Math.floor(prices.length / 2)];

    // 3  upsert the parent Item (logical card)
    const product = await prisma.product.upsert({
      where:  { gameCode_name: { gameCode: 'POKEMON', name: query } },
      create: { gameCode: 'POKEMON', name: query, type: 'SINGLE_CARD' },
      update: {}
    });

    const RAW_GRADE = -1;
    const RAW_LANG = 'EN';
    const RAW_PRINT = 'UNL';

    // 4  upsert the Raw variant
    const variant = await prisma.variant.upsert({
      where: {
        productId_gradeCompany_gradeValue: {
          productId:   product.id,
          gradeCompany:'RAW',
          gradeValue:  RAW_GRADE,
        },
      },
      create: {
        productId:   product.id,
        gradeCompany:'RAW',
        gradeValue:  RAW_GRADE,
        language:    RAW_LANG,
        printing:    RAW_PRINT,
      },
      update: {},
    });

    // 5  store today’s price snapshot
    await prisma.priceSnapshot.create({
      data: {
        productId: product.id,
        variantId: variant.id,
        currency: 'USD',
        marketPrice: currentPrice
      }
    });

    // 6  respond
    res.json({
      productId: product.id,
      variantId: variant.id,
      currentPrice,
      listings
    });

  } catch (err) {
    console.error('Error in /search:', err);
    next(err);
  }
});

export default router;
