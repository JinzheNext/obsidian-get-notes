import fs from "fs";
import path from "path";

const root = process.cwd();
const bundlePath = path.join(root, "main.js");
const bundle = fs.readFileSync(bundlePath, "utf8");

const failures = [];

if (bundle.includes("var import_playwright")) {
  failures.push("main.js 仍然包含 esbuild 注入的 import_playwright 变量，说明 playwright 被静态打进了主 bundle。");
}

if (bundle.includes('__toESM(require("playwright"))') || bundle.includes("__toESM(require('playwright'))")) {
  failures.push("main.js 仍然包含顶层 __toESM(require('playwright'))，会导致插件加载阶段失败。");
}

if (bundle.includes('require("playwright");') || bundle.includes("require('playwright');")) {
  failures.push("main.js 仍然包含裸的顶层 playwright require。");
}

if (failures.length > 0) {
  console.error("Preflight check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Preflight check passed.");
