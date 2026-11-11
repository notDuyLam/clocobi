-- Color preference moved from the profile to the generate request (DB v0.7).
ALTER TABLE "StyleProfile" DROP COLUMN "dislikedColors",
DROP COLUMN "likedColors";
