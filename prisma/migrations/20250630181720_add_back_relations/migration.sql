/*
  Warnings:

  - You are about to drop the column `captured` on the `PriceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `priceUsd` on the `PriceSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `deleted` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `ebayUserId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `CardVariant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Item` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[authSub]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GameCode" AS ENUM ('POKEMON', 'MAGIC', 'YUGIOH', 'SPORTS', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SEALED', 'SINGLE_CARD', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "GradingCompany" AS ENUM ('RAW', 'PSA', 'BGS', 'CGC', 'SGC');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR', 'GBP', 'JPY');

-- DropForeignKey
ALTER TABLE "CardVariant" DROP CONSTRAINT "CardVariant_itemId_fkey";

-- DropForeignKey
ALTER TABLE "PriceSnapshot" DROP CONSTRAINT "PriceSnapshot_variantId_fkey";

-- DropIndex
DROP INDEX "User_ebayUserId_key";

-- AlterTable
ALTER TABLE "PriceSnapshot" DROP COLUMN "captured",
DROP COLUMN "priceUsd",
ADD COLUMN     "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD',
ADD COLUMN     "marketPrice" DECIMAL(12,2),
ADD COLUMN     "productId" INTEGER,
ALTER COLUMN "variantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "createdAt",
DROP COLUMN "deleted",
DROP COLUMN "deletedAt",
DROP COLUMN "ebayUserId",
DROP COLUMN "updatedAt",
ADD COLUMN     "authSub" TEXT,
ADD COLUMN     "email" TEXT;

-- DropTable
DROP TABLE "CardVariant";

-- DropTable
DROP TABLE "Item";

-- CreateTable
CREATE TABLE "Game" (
    "code" "GameCode" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "externalId" INTEGER,
    "gameCode" "GameCode" NOT NULL,
    "type" "ProductType" NOT NULL,
    "name" TEXT NOT NULL,
    "setName" TEXT,
    "imageUrl" TEXT,
    "releaseDate" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "gradeCompany" "GradingCompany",
    "gradeValue" DOUBLE PRECISION,
    "language" TEXT,
    "printing" TEXT,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionItem" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "costBasis" DECIMAL(12,2),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_externalId_idx" ON "Product"("externalId");

-- CreateIndex
CREATE INDEX "Product_gameCode_type_idx" ON "Product"("gameCode", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_productId_gradeCompany_gradeValue_language_printing_key" ON "Variant"("productId", "gradeCompany", "gradeValue", "language", "printing");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionItem_userId_productId_variantId_key" ON "CollectionItem"("userId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "PriceSnapshot_productId_capturedAt_idx" ON "PriceSnapshot"("productId", "capturedAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_variantId_capturedAt_idx" ON "PriceSnapshot"("variantId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_authSub_key" ON "User"("authSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_gameCode_fkey" FOREIGN KEY ("gameCode") REFERENCES "Game"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionItem" ADD CONSTRAINT "CollectionItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
