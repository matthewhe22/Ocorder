// build.mjs — esbuild bundler for TOCS OC Portal
import * as esbuild from "esbuild";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

mkdirSync(resolve(__dirname, "dist"), { recursive: true });

// Write static index.html
writeFileSync(
  resolve(__dirname, "dist/index.html"),
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>TOCS Order Portal</title>
  <meta name="description" content="Top Owners Corporation Solutions — OC Certificate Purchase Portal"/>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #ffffff; }
    #root { min-height: 100vh; }
    #app-loading { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; color: #4a7255; font-size: 0.9rem; letter-spacing: 0.08em; text-transform: uppercase; }
  </style>
</head>
<body>
  <div id="root"><div id="app-loading">Loading…</div></div>
  <script src="/bundle.js?v=${Date.now()}"></script>
</body>
</html>`
);

// Write TOCS favicon SVG
writeFileSync(
  resolve(__dirname, "dist/favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#1c3326"/>
  <text x="50%" y="62%" text-anchor="middle" font-family="serif" font-size="14" font-weight="bold" fill="white">T</text>
</svg>`
);

const ctx = await esbuild.context({
  entryPoints: [resolve(__dirname, "src/main.jsx")],
  bundle: true,
  jsx: "automatic",
  loader: { ".jsx": "jsx", ".js": "js" },
  outfile: resolve(__dirname, "dist/bundle.js"),
  minify: !isWatch,
  sourcemap: isWatch,
  target: ["es2017", "chrome87", "firefox78", "safari13"],
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"'
  },
  logLevel: "info",
});

if (isWatch) {
  await ctx.watch();
  console.log("\n  👀  Watching for changes...\n");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("\n  ✅  Build complete → dist/\n");
}
