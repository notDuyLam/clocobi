-- Prisma creates list columns as nullable; DB design v0.5 requires NOT NULL. Prisma's diff ignores list nullability, so this causes no drift.
ALTER TABLE "StyleProfile" ALTER COLUMN "preferredStyles" SET NOT NULL,
  ALTER COLUMN "likedColors" SET NOT NULL,
  ALTER COLUMN "dislikedColors" SET NOT NULL;
ALTER TABLE "Item" ALTER COLUMN "seasons" SET NOT NULL;
