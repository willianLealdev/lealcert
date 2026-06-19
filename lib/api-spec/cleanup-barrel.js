#!/usr/bin/env node
// Removes re-exports from types/index.ts that conflict with names already exported by api.ts
const fs = require("fs");
const path = require("path");

const apiTsPath = path.resolve(__dirname, "../api-zod/src/generated/api.ts");
const barrelPath = path.resolve(__dirname, "../api-zod/src/generated/types/index.ts");

const apiContent = fs.readFileSync(apiTsPath, "utf8");
const apiExports = new Set();
const re = /^export (?:const|type|interface|enum|function|class) (\w+)/gm;
let m;
while ((m = re.exec(apiContent)) !== null) apiExports.add(m[1]);

const typesDir = path.dirname(barrelPath);
const lines = fs.readFileSync(barrelPath, "utf8").split("\n");
const kept = lines.filter((line) => {
  const match = line.match(/^export \* from '\.\/(.+?)(?:\.js)?'/);
  if (!match) return true;
  const file = path.join(typesDir, match[1] + ".ts");
  try {
    const src = fs.readFileSync(file, "utf8");
    const names = [...src.matchAll(/^export (?:type )?\w+ (\w+)/gm)].map((x) => x[1]);
    return !names.some((n) => apiExports.has(n));
  } catch {
    return true;
  }
});

fs.writeFileSync(barrelPath, kept.join("\n"));
console.log("cleanup-barrel: done, removed conflicting re-exports from types/index.ts");
