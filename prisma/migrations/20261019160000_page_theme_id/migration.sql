-- AlterTable
ALTER TABLE "Page" ADD COLUMN "themeId" TEXT;

-- CreateIndex
CREATE INDEX "Page_themeId_idx" ON "Page"("themeId");
