-- Short facts about a post (for a project: type, area, schedule, price). Plain column addition: the
-- existing rows are left untouched.
ALTER TABLE "Post" ADD COLUMN "fields" TEXT NOT NULL DEFAULT '';
