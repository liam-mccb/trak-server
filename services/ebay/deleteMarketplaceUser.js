import { prisma } from '../../db/prisma.js';

/** Soft-delete or upsert a user who asked eBay to purge their data. */
export async function deleteMarketplaceUser({ userId, username }) {
  await prisma.user.upsert({
    where:  { ebayUserId: userId },
    update: { deleted: true, deletedAt: new Date(), username },
    create: { ebayUserId: userId, username, deleted: true, deletedAt: new Date() },
  });
}
