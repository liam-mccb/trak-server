/*
  Warnings:

  - You are about to drop the column `itemId` on the `PriceSnapshot` table. All the data in the column will be lost.
  - Added the required column `variantId` to the `PriceSnapshot` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PriceSnapshot" DROP CONSTRAINT "PriceSnapshot_itemId_fkey";

-- AlterTable
ALTER TABLE "PriceSnapshot" DROP COLUMN "itemId",
ADD COLUMN     "variantId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "CardVariant" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "gradeLabel" TEXT NOT NULL,
    "gradeValue" DOUBLE PRECISION,

    CONSTRAINT "CardVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardVariant_itemId_gradeLabel_gradeValue_key" ON "CardVariant"("itemId", "gradeLabel", "gradeValue");

-- AddForeignKey
ALTER TABLE "CardVariant" ADD CONSTRAINT "CardVariant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CardVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
