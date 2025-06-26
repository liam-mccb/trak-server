/*
  Warnings:

  - A unique constraint covering the columns `[ebayQuery]` on the table `Item` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Item_ebayQuery_key" ON "Item"("ebayQuery");
