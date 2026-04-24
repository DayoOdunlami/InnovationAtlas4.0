#!/usr/bin/env tsx
// ---------------------------------------------------------------------------
// Phase 3d — render the server-side landscape-embed + focus-card in five
// variants to individual HTML files. Used for PR screenshots on
// environments where the full app stack (Postgres, Redis, auth) isn't
// available locally.
//
// Writes: /opt/cursor/artifacts/preview-*.html
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { LANDSCAPE_SNAPSHOT } from "@/lib/landscape/snapshot";
import { LandscapeEmbedBlockRenderer } from "@/components/brief/blocks/renderers/landscape-embed.server";
import { LandscapeFocusCardRenderer } from "@/components/brief/blocks/renderers/landscape-focus-card.server";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const firstProject = LANDSCAPE_SNAPSHOT.nodes.find(
  (n) => n.type === "project",
)!;

function page(body: string, bg = "#0a0e13"): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Phase 3d preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..600&family=JetBrains+Mono:wght@300..600&display=swap"
  rel="stylesheet"
/>
<style>
  html, body { margin: 0; padding: 0; }
  body { background: ${bg}; font-family: 'JetBrains Mono', ui-monospace, monospace; padding: 32px; }
  .wrap { max-width: 1280px; margin: 0 auto; }
</style>
</head>
<body>
<div class="wrap">${body}</div>
</body>
</html>`;
}

const variants: Array<{
  slug: string;
  bg: string;
  content: unknown;
  heading: string;
}> = [
  {
    slug: "preview-landscape-embed-dark",
    bg: "#050810",
    heading: "landscape-embed · theme=dark · mode=gravity",
    content: {
      schema_version: 2,
      queryA: "rail hydrogen decarbonisation",
      mode: "gravity",
      zAxis: "score",
      display: "graph",
      cameraPreset: "topdown",
      theme: "dark",
      caption:
        "Dark theme — the POC :root palette applied to the static share-scope snapshot.",
    },
  },
  {
    slug: "preview-landscape-embed-light",
    bg: "#f1f2f4",
    heading: "landscape-embed · theme=light · mode=gravity (brief-default)",
    content: {
      schema_version: 2,
      queryA: "autonomous vehicles and connected mobility",
      mode: "gravity",
      zAxis: "score",
      display: "graph",
      cameraPreset: "topdown",
      theme: "light",
      caption:
        "Light theme — new Phase 3d default for brief embeds, legible on white paper.",
    },
  },
  {
    slug: "preview-landscape-embed-print",
    bg: "#ffffff",
    heading: "landscape-embed · theme=print (PDF-safe)",
    content: {
      schema_version: 2,
      queryA: "rail hydrogen decarbonisation",
      mode: "gravity",
      zAxis: "score",
      display: "graph",
      cameraPreset: "topdown",
      theme: "print",
      caption:
        "Print theme — flat palette, no grid, ready for the Phase 4 PDF export.",
    },
  },
  {
    slug: "preview-landscape-embed-compare",
    bg: "#050810",
    heading: "landscape-embed · mode=compare (binary-star)",
    content: {
      schema_version: 2,
      queryA: "rail hydrogen decarbonisation",
      queryB: "sustainable aviation fuel",
      mode: "compare",
      zAxis: "score",
      display: "graph",
      cameraPreset: "topdown",
      theme: "dark",
      caption:
        "Compare mode — Query A anchors on the left (green), Query B on the right (violet), weak matches fade to slate.",
    },
  },
  {
    slug: "preview-landscape-embed-focus-card",
    bg: "#f1f2f4",
    heading: "landscape-embed · display=focus-card (RSC, no WebGL)",
    content: {
      schema_version: 2,
      queryA: "rail hydrogen decarbonisation",
      mode: "gravity",
      zAxis: "score",
      display: "focus-card",
      cameraPreset: "topdown",
      theme: "light",
      focusedNodeId: firstProject.id,
      caption:
        "Server-rendered focus card. No three.js, no client hooks — renders on the share scope bundle as-is.",
    },
  },
];

for (const v of variants) {
  const markup = renderToStaticMarkup(
    <LandscapeEmbedBlockRenderer id={v.slug} content={v.content} />,
  );
  const body = `
    <h1 style="font-family: 'Fraunces', serif; font-size: 20px; margin: 0 0 16px; color:${v.bg === "#ffffff" ? "#111" : "#e8ecf1"};">${v.heading}</h1>
    ${markup}
  `;
  writeFileSync(`${OUT_DIR}/${v.slug}.html`, page(body, v.bg), "utf8");
  console.log(`wrote ${OUT_DIR}/${v.slug}.html`);
}

// Standalone focus card too (already inside the embed dispatcher above,
// but it's useful to see it without the outer figure).
{
  const html = renderToStaticMarkup(
    <LandscapeFocusCardRenderer
      id="preview-focus-card-standalone"
      content={{
        schema_version: 2,
        queryA: "rail hydrogen decarbonisation",
        mode: "gravity",
        zAxis: "score",
        display: "focus-card",
        cameraPreset: "topdown",
        theme: "light",
        focusedNodeId: firstProject.id,
        caption:
          "Standalone focus card — Phase 3d narrative block, server-rendered.",
      }}
      embedded
    />,
  );
  writeFileSync(
    `${OUT_DIR}/preview-focus-card-standalone.html`,
    page(`<div style="max-width:480px;">${html}</div>`, "#f1f2f4"),
    "utf8",
  );
  console.log(`wrote ${OUT_DIR}/preview-focus-card-standalone.html`);
}
