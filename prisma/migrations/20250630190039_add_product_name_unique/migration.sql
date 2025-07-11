/*
  Warnings:

  - A unique constraint covering the columns `[gameCode,name]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Product_gameCode_name_key" ON "Product"("gameCode", "name");
