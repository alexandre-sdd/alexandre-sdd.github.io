import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = buildApp(config);

app
  .listen({
    host: config.host,
    port: config.port
  })
  .then(() => {
    console.log(`Interview API listening on http://${config.host}:${config.port}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
