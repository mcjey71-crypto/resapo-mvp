import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
const worker = await readFile(
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
  "utf8",
);
const licenses = (
  await Promise.all(
    ["node_modules/pdfjs-dist/LICENSE", "node_modules/diff/LICENSE"].map((p) =>
      readFile(p, "utf8"),
    ),
  )
).join("\n\n");
await writeFile("LAB_LICENSES.txt", licenses);
await build({
  entryPoints: ["src/lab-app.js"],
  outfile: "web/lab-app.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  define: { __LAB_PDF_WORKER__: JSON.stringify(worker) },
  legalComments: "inline",
});
const js =
  "/*! Re-SAPO local tools. Includes pdf-lib (MIT), PDF.js (Apache-2.0), jsdiff (BSD-3-Clause). See THIRD_PARTY_NOTICES.md and LAB_LICENSES.txt.\n" +
  licenses.replaceAll("*/", "* /") +
  "\n*/\n" +
  (await readFile("web/lab-app.js", "utf8"));
await writeFile("web/lab-app.js", js);
const logo = await readFile("web/logo.svg", "utf8");
let html = (await readFile("src/lab-template.html", "utf8")).replace(
  "{{LOGO}}",
  logo,
);
await writeFile("web/lab.html", html);
let portable = html
  .replace(/<!-- SERVER-NAV -->.*?<!-- \/SERVER-NAV -->/s, "")
  .replace(
    /<link rel="icon"[^>]+>/,
    `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(logo)}" type="image/svg+xml">`,
  );
for (const css of ["styles.css", "studio.css", "lab.css"])
  portable = portable.replace(
    `<link rel="stylesheet" href="/static/${css}" />`,
    `<style>${await readFile("web/" + css, "utf8")}</style>`,
  );
portable = portable
  .replace('<script src="/static/lab-app.js" defer></script>', "")
  .replace(
    "</body>",
    () => `<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body>`,
  );
if (/\b(?:src|href)="\/static\//.test(portable)) {
  throw new Error("The portable tools still reference server assets.");
}
await writeFile("docs/herramientas.html", portable);
console.log("Herramientas creativas: web y HTML autónomo generados.");
