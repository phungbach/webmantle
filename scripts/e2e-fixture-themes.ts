/** Installs the stock "default" and "starter" themes for the Playwright run and makes "default" active. */
import path from "node:path";
import { prisma } from "../src/lib/db";
import { ACTIVE_KEY } from "../src/lib/themes/activate";
import { installThemeDirectory } from "../src/lib/themes/install";
import { setSiteSetting } from "../src/lib/settings";

(async () => {
  for (const id of ["default", "starter"]) {
    await installThemeDirectory(
      path.resolve(__dirname, "..", "tests", "fixtures", "themes", id),
      null
    );
  }
  await setSiteSetting(ACTIVE_KEY, "default");
  console.log("Installed the stock themes; active theme is default");
  await prisma.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
