/*
  Warnings:

  - Made the column `gradeValue` on table `CardVariant` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CardVariant" ALTER COLUMN "gradeValue" SET NOT NULL,
ALTER COLUMN "gradeValue" SET DEFAULT -1;
