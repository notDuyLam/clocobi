-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('TOP', 'BOTTOM', 'OUTERWEAR', 'ONE_PIECE', 'SHOES', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('DRAFT', 'COMPLETE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clothingCategory" TEXT NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "climate" TEXT NOT NULL,
    "build" TEXT,
    "skinUndertone" TEXT,
    "preferredStyles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likedColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dislikedColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fitPreference" TEXT,
    "freeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'COMPLETE',
    "category" "ItemCategory",
    "subcategory" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "pattern" TEXT,
    "fabric" TEXT,
    "fit" TEXT,
    "seasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "formality" TEXT,
    "aiNote" TEXT,
    "size" TEXT,
    "brand" TEXT,
    "notes" TEXT,
    "liked" BOOLEAN NOT NULL DEFAULT false,
    "originalPublicId" TEXT NOT NULL,
    "cleanPublicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occasion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occasion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outfit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "occasionId" UUID NOT NULL,
    "comboKey" TEXT NOT NULL,
    "stylingTips" TEXT NOT NULL,
    "liked" BOOLEAN NOT NULL DEFAULT false,
    "imagePublicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outfit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutfitItem" (
    "id" UUID NOT NULL,
    "outfitId" UUID NOT NULL,
    "itemId" UUID,
    "slot" "ItemCategory" NOT NULL,

    CONSTRAINT "OutfitItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProfile_userId_key" ON "StyleProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_originalPublicId_key" ON "Item"("originalPublicId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_cleanPublicId_key" ON "Item"("cleanPublicId");

-- CreateIndex
CREATE INDEX "Item_userId_status_category_idx" ON "Item"("userId", "status", "category");

-- CreateIndex
CREATE INDEX "Item_userId_liked_idx" ON "Item"("userId", "liked");

-- CreateIndex
CREATE INDEX "Occasion_userId_idx" ON "Occasion"("userId");

-- CreateIndex
CREATE INDEX "Outfit_occasionId_createdAt_idx" ON "Outfit"("occasionId", "createdAt");

-- CreateIndex
CREATE INDEX "Outfit_userId_liked_idx" ON "Outfit"("userId", "liked");

-- CreateIndex
CREATE UNIQUE INDEX "Outfit_occasionId_comboKey_key" ON "Outfit"("occasionId", "comboKey");

-- CreateIndex
CREATE INDEX "OutfitItem_outfitId_idx" ON "OutfitItem"("outfitId");

-- CreateIndex
CREATE INDEX "OutfitItem_itemId_idx" ON "OutfitItem"("itemId");

-- AddForeignKey
ALTER TABLE "StyleProfile" ADD CONSTRAINT "StyleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occasion" ADD CONSTRAINT "Occasion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outfit" ADD CONSTRAINT "Outfit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outfit" ADD CONSTRAINT "Outfit_occasionId_fkey" FOREIGN KEY ("occasionId") REFERENCES "Occasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutfitItem" ADD CONSTRAINT "OutfitItem_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutfitItem" ADD CONSTRAINT "OutfitItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
