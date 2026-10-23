-- CreateIndex
CREATE INDEX "Post_updatedAt_idx" ON "Post"("updatedAt");

-- CreateIndex
CREATE INDEX "Post_status_updatedAt_idx" ON "Post"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PageView_source_createdAt_idx" ON "PageView"("source", "createdAt");
