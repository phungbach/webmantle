/**
 * Entry point for hosts that start Node apps through Passenger, such as cPanel "Setup Node.js App".
 * Set the application startup file to app.js. For Docker or a plain server, use `npm start` instead.
 *
 * The site must already be built (`npm run build`, or use the prebuilt release package).
 */
process.env.NODE_ENV = process.env.NODE_ENV || "production";

const { createServer } = require("node:http");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();
const port = Number(process.env.PORT) || 3000;

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`Webmantle is ready on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Webmantle failed to start:", error);
    process.exit(1);
  });
