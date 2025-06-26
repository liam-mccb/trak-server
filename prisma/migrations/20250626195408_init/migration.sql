-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "ebayUserId" TEXT NOT NULL,
    "username" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_ebayUserId_key" ON "User"("ebayUserId");
