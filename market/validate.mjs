import fs from "node:fs";
import { parseMarketIndex, marketInstallTarget } from "@deepseek-ai/dsh-plugin-market-index";

const indexPath = process.argv[2] || "market-dist/index.json";
const indexUrl = "https://zxeb.github.io/dsh-purge/index.json";
const index = parseMarketIndex(JSON.parse(fs.readFileSync(indexPath, "utf8")), indexUrl);

for (const plugin of index.plugins) {
  for (const version of plugin.versions) {
    console.log(`${plugin.name} ${version.version}: ${marketInstallTarget(plugin.name, version).spec}`);
  }
}
console.log("Official DSH format-1 validation passed");
