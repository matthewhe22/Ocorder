// build.mjs — esbuild bundler for TOCS OC Portal
import * as esbuild from "esbuild";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

mkdirSync(resolve(__dirname, "dist"), { recursive: true });

// index.html is generated after each build so it can reference the
// content-hashed bundle filename (cache-busts only when content changes).
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap";
function writeIndexHtml(bundleSrc) {
  writeFileSync(
    resolve(__dirname, "dist/index.html"),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>TOCS Order Portal</title>
  <meta name="description" content="Top Owners Corporation Solution — OC Certificate Purchase Portal"/>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link rel="stylesheet" href="${FONTS_HREF}"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #ffffff; }
    #root { min-height: 100vh; }
    #app-loading { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; color: #4a7255; font-size: 0.9rem; letter-spacing: 0.08em; text-transform: uppercase; }
  </style>
</head>
<body>
  <div id="root"><div id="app-loading">Loading…</div></div>
  <script type="module" src="${bundleSrc}"></script>
</body>
</html>`
  );
}

// Write TOCS favicon SVG
writeFileSync(
  resolve(__dirname, "dist/favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="4" fill="#1c3326"/>
  <text x="50%" y="62%" text-anchor="middle" font-family="serif" font-size="14" font-weight="bold" fill="white">T</text>
</svg>`
);

const htmlPlugin = {
  name: "index-html",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0 || !result.metafile) return;
      const entry = Object.keys(result.metafile.outputs).find(
        (f) => result.metafile.outputs[f].entryPoint?.endsWith("src/main.jsx")
      );
      if (entry) writeIndexHtml("/" + basename(entry));
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: [resolve(__dirname, "src/main.jsx")],
  bundle: true,
  jsx: "automatic",
  loader: { ".jsx": "jsx", ".js": "js" },
  // ESM output + splitting keeps `await import("xlsx")` (admin-only, ~46% of
  // the old single bundle) out of the main chunk every visitor downloads.
  outdir: resolve(__dirname, "dist"),
  format: "esm",
  splitting: true,
  entryNames: isWatch ? "[name]" : "[name]-[hash]",
  chunkNames: "[name]-[hash]",
  metafile: true,
  minify: !isWatch,
  sourcemap: isWatch,
  // safari14.1 minimum: esbuild 0.27 refuses safari<=14.0 (engine bug needs a
  // destructuring lowering it doesn't implement) and the build fails outright.
  target: ["es2020", "chrome87", "firefox78", "safari14.1"],
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
    "__BUILD_DATE__": JSON.stringify(new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne" })),
  },
  logLevel: "info",
  plugins: [htmlPlugin],
});

if (isWatch) {
  await ctx.watch();
  console.log("\n  👀  Watching for changes...\n");
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log("\n  ✅  Build complete → dist/\n");
}
