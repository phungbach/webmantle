-- Tags can now come with a theme (tags.json), like categories. Plain column additions: the existing
-- rows and their links to posts are left untouched.
ALTER TABLE "Tag" ADD COLUMN "themeId" TEXT;
ALTER TABLE "Tag" ADD COLUMN "translations" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Tag" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Tag_themeId_idx" ON "Tag"("themeId");
