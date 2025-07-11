/*
  Warnings:

  - A unique constraint covering the columns `[productId,gradeCompany,gradeValue]` on the table `Variant` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Variant_productId_gradeCompany_gradeValue_language_printing_key";

-- CreateIndex
CREATE UNIQUE INDEX "Variant_productId_gradeCompany_gradeValue_key" ON "Variant"("productId", "gradeCompany", "gradeValue");
