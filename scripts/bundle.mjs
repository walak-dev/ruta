// Single-file builds: ESM for Deno/Edge/Workers, IIFE (global "Ruta") for the browser playground.
import { build } from "esbuild";
await build({ entryPoints: ["src/index.ts"], bundle: true, format: "esm", platform: "neutral", target: "es2022", outfile: "dist/ruta.bundle.mjs" });
await build({ entryPoints: ["src/index.ts"], bundle: true, format: "iife", globalName: "Ruta", platform: "browser", target: "es2020", outfile: "dist/ruta.iife.js" });
console.log("bundles written to dist/");
