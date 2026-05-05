import path from "path";
import { createRequire } from "module";

export function loadPlaywright(pluginDir: string): typeof import("playwright") {
  const runtimeRequire = createRequire(path.join(pluginDir, "package.json"));
  return runtimeRequire("playwright") as typeof import("playwright");
}
