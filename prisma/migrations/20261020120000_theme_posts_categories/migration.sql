-- AlterTable
ALTER TABLE "Post" ADD COLUMN "themeId" TEXT;
ALTER TABLE "Post" ADD COLUMN "translations" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "themeId" TEXT;
ALTER TABLE "Category" ADD COLUMN "translations" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Category" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Post_themeId_idx" ON "Post"("themeId");
CREATE INDEX "Category_themeId_idx" ON "Category"("themeId");
