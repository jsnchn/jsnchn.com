import { mkdir, writeFile, readFile, copyFile, exists } from "fs/promises";
import { join, relative, dirname, extname } from "path";
import { Glob } from "bun";

const CONTENT_DIR = join(process.cwd(), "content");
const LAYOUTS_DIR = join(process.cwd(), "src/layouts");
const PUBLIC_DIR = join(process.cwd(), "public");
const DIST_DIR = join(process.cwd(), "dist");

interface Frontmatter {
  title?: string;
  date?: string;
  layout?: string;
  description?: string;
  draft?: boolean;
  extends?: string;
  [key: string]: unknown;
}

interface Page {
  url: string;
  filePath: string;
  frontmatter: Frontmatter;
  content: string;
  html: string;
}

interface CollectionItem {
  url: string;
  title: string;
  date: string;
  description: string;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; content: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content };
  }

  const yamlStr = match[1];
  const body = match[2];

  const frontmatter: Frontmatter = {};
  for (const line of yamlStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();
    if (value === "true") value = true;
    else if (value === "false") value = false;
    frontmatter[key] = value;
  }

  return { frontmatter, content: body };
}

function renderMarkdown(content: string): string {
  return Bun.markdown.html(content, {
    tables: true,
    strikethrough: true,
    tasklists: true,
    autolinks: true,
    headings: true,
  });
}

async function readLayout(layoutName: string): Promise<string> {
  const layoutPath = join(LAYOUTS_DIR, `${layoutName}.html`);
  return await readFile(layoutPath, "utf-8");
}

async function resolveLayout(frontmatter: Frontmatter): Promise<string> {
  const layoutName = frontmatter.layout || frontmatter.extends || "page";
  let template = await readLayout(layoutName);

  const extendsMatch = template.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (extendsMatch) {
    const parentLayout = extendsMatch[1].match(/extends:\s*(\w+)/);
    if (parentLayout) {
      const parentTemplate = await resolveLayout({ extends: parentLayout[1] } as Frontmatter);
      const childContent = extendsMatch[2];
      return parentTemplate.replace(/\{\{\s*content\s*\|\s*safe\s*\}\}/g, childContent);
    }
  }

  return template;
}

function applyTemplate(template: string, page: Page, collection?: CollectionItem[]): string {
  let result = template;

  result = result.replace(/\{\{\s*title\s*\}\}/g, page.frontmatter.title || "");
  result = result.replace(/\{\{\s*date\s*\}\}/g, page.frontmatter.date || "");
  result = result.replace(/\{\{\s*description\s*\}\}/g, page.frontmatter.description || "");
  result = result.replace(/\{\{\s*url\s*\}\}/g, page.url);

  if (collection) {
    const collectionHtml = collection
      .map(
        (item) =>
          `<li><a href="${item.url}">${item.title}</a>${item.date ? ` - <time>${item.date}</time>` : ""}</li>`
      )
      .join("\n");
    result = result.replace(/\{\{\s*collection\s*\}\}/g, collectionHtml);
  }

  return result;
}

async function getCollectionForPath(filePath: string): Promise<CollectionItem[] | undefined> {
  const dir = dirname(filePath);
  if (dir === "." || dir === CONTENT_DIR) return undefined;

  const contentDir = join(CONTENT_DIR, dir);
  if (!await exists(contentDir)) return undefined;

  const glob = new Glob("*.md");
  const files = Array.from(glob.scanSync({ cwd: contentDir, absolute: true }));

  const items: CollectionItem[] = [];
  for (const mdFile of files) {
    if (mdFile.endsWith("/index.md")) continue;

    const content = await readFile(mdFile, "utf-8");
    const { frontmatter } = parseFrontmatter(content);
    if (frontmatter.draft) continue;

    const relativePath = relative(CONTENT_DIR, mdFile).replace(/\.md$/, "");
    const url = relativePath === "index" ? "/" : `/${relativePath}`;

    items.push({
      url,
      title: (frontmatter.title as string) || "Untitled",
      date: (frontmatter.date as string) || "",
      description: (frontmatter.description as string) || "",
    });
  }

  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return items;
}

async function buildPage(filePath: string, includeDrafts: boolean): Promise<Page | null> {
  const content = await readFile(filePath, "utf-8");
  const { frontmatter, content: mdContent } = parseFrontmatter(content);

  if (!includeDrafts && frontmatter.draft) {
    return null;
  }

  const html = renderMarkdown(mdContent);

  const relativePath = relative(CONTENT_DIR, filePath).replace(/\.md$/, "");
  let url = relativePath === "index" ? "/" : `/${relativePath}`;
  if (url.endsWith("/index")) {
    url = url.slice(0, -6) || "/";
  }

  return {
    url,
    filePath,
    frontmatter,
    content: mdContent,
    html,
  };
}

async function build(includeDrafts = false): Promise<void> {
  console.log(`Building${includeDrafts ? " (with drafts)" : ""}...`);

  if (await exists(DIST_DIR)) {
    const { rmSync } = await import("fs");
    rmSync(DIST_DIR, { recursive: true });
  }

  await mkdir(DIST_DIR, { recursive: true });

  const glob = new Glob("**/*.md");
  const files = Array.from(glob.scanSync({ cwd: CONTENT_DIR, absolute: true }));

  const pages: Page[] = [];
  for (const file of files) {
    const page = await buildPage(file, includeDrafts);
    if (page) {
      pages.push(page);
    }
  }

  for (const page of pages) {
    let template = await resolveLayout(page.frontmatter);
    template = template.replace(/\{\{\s*content\s*\|\s*safe\s*\}\}/g, page.html);

    let collection: CollectionItem[] | undefined;
    if (page.filePath.includes("/index.md")) {
      const dir = dirname(page.filePath);
      const contentDir = relative(CONTENT_DIR, dir);
      if (contentDir && contentDir !== ".") {
        const allPagesInDir = pages.filter((p) => {
          const pDir = dirname(p.filePath);
          return relative(CONTENT_DIR, pDir) === contentDir && !p.filePath.endsWith("/index.md");
        });
        collection = allPagesInDir
          .map((p) => ({
            url: p.url,
            title: p.frontmatter.title || "Untitled",
            date: p.frontmatter.date || "",
            description: p.frontmatter.description || "",
          }))
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      }
    }

    const outputHtml = applyTemplate(template, page, collection);

    const outputPath = join(DIST_DIR, page.url === "/" ? "index.html" : `${page.url}/index.html`);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outputHtml);
  }

  const assetGlob = new Glob("**/*");
  const assets = Array.from(assetGlob.scanSync({ cwd: CONTENT_DIR, absolute: true }));
  for (const asset of assets) {
    if (asset.endsWith(".md")) continue;
    const relPath = relative(CONTENT_DIR, asset);
    const destPath = join(DIST_DIR, relPath);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(asset, destPath);
  }

  if (await exists(PUBLIC_DIR)) {
    const publicFiles = Array.from(assetGlob.scanSync({ cwd: PUBLIC_DIR, absolute: true }));
    for (const file of publicFiles) {
      const relPath = relative(PUBLIC_DIR, file);
      const destPath = join(DIST_DIR, relPath);
      await mkdir(dirname(destPath), { recursive: true });
      await copyFile(file, destPath);
    }
  }

  if (await exists(join(CONTENT_DIR, "404.md"))) {
    const page404 = await buildPage(join(CONTENT_DIR, "404.md"), includeDrafts);
    if (page404) {
      let template = await resolveLayout(page404.frontmatter);
      template = template.replace(/\{\{\s*content\s*\|\s*safe\s*\}\}/g, page404.html);
      const outputHtml = applyTemplate(template, page404);
      await writeFile(join(DIST_DIR, "404.html"), outputHtml);
    }
  }

  console.log(`Built ${pages.length} pages to ${DIST_DIR}`);
}

async function dev(): Promise<void> {
  console.log("Starting dev server...");

  const port = 3000;
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      let path = url.pathname;

      if (path === "/") {
        path = "/index";
      }

      const filePath = join(DIST_DIR, `${path}.html`);
      const indexPath = join(DIST_DIR, path, "index.html");

      let file: any;
      if (await exists(filePath)) {
        file = Bun.file(filePath);
      } else if (await exists(indexPath)) {
        file = Bun.file(indexPath);
      } else if (await exists(join(DIST_DIR, "404.html"))) {
        return new Response(Bun.file(join(DIST_DIR, "404.html")), {
          headers: { "Content-Type": "text/html" },
          status: 404,
        });
      } else {
        return new Response("Not Found", { status: 404 });
      }

      return new Response(file, {
        headers: { "Content-Type": "text/html" },
      });
    },
  });

  console.log(`Dev server running at http://localhost:${server.port}`);

  const watcher = Bun.watch([CONTENT_DIR, LAYOUTS_DIR, PUBLIC_DIR]);
  for await (const event of watcher) {
    console.log(`[${event.kind}] ${event.path} - rebuilding...`);
    await build(false);
  }
}

async function preview(): Promise<void> {
  const port = 3000;
  console.log(`Serving ${DIST_DIR} at http://localhost:${port}`);

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      let path = url.pathname;

      if (path === "/") {
        path = "/index";
      }

      const filePath = join(DIST_DIR, `${path}.html`);
      const indexPath = join(DIST_DIR, path, "index.html");
      const directPath = join(DIST_DIR, path);

      let file: any;
      if (await exists(filePath)) {
        file = Bun.file(filePath);
      } else if (await exists(indexPath)) {
        file = Bun.file(indexPath);
      } else if (await exists(directPath) && (await import("fs")).statSync(directPath).isDirectory()) {
        file = Bun.file(join(directPath, "index.html"));
      } else if (await exists(join(DIST_DIR, "404.html"))) {
        return new Response(Bun.file(join(DIST_DIR, "404.html")), {
          headers: { "Content-Type": "text/html" },
          status: 404,
        });
      } else {
        return new Response("Not Found", { status: 404 });
      }

      return new Response(file);
    },
  });
}

async function init(): Promise<void> {
  const root = process.cwd();

  const dirs = ["content/posts", "src/layouts", "public"];
  for (const dir of dirs) {
    await mkdir(join(root, dir), { recursive: true });
  }

  const baseLayout = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }}</title>
  <meta name="description" content="{{ description }}">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <nav>
      <a href="/">Home</a>
    </nav>
  </header>
  <main>
    {{ content | safe }}
  </main>
  <footer>
    <p>Built with BunPress</p>
  </footer>
</body>
</html>`;

  const pageLayout = `---
extends: base.html
---
<article class="page">
  <h1>{{ title }}</h1>
  {{ content | safe }}
</article>`;

  const indexMd = `---
title: Welcome
description: Welcome to my site
---

# Welcome

This is your new BunPress site. Start editing \`content/index.md\` to get started!
`;

  const packageJson = {
    name: "my-site",
    version: "1.0.0",
    type: "module",
    scripts: {
      build: "buntastic build",
      "build:drafts": "buntastic build --drafts",
      dev: "buntastic dev",
      preview: "buntastic preview",
    },
  };

  const styleCss = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

a { color: #0066cc; }
h1, h2, h3 { margin: 1.5rem 0 1rem; }
main { min-height: 60vh; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #eee; }
`;

  await writeFile(join(root, "src/layouts/base.html"), baseLayout);
  await writeFile(join(root, "src/layouts/page.html"), pageLayout);
  await writeFile(join(root, "content/index.md"), indexMd);
  await writeFile(join(root, "package.json"), JSON.stringify(packageJson, null, 2));
  await writeFile(join(root, "public/style.css"), styleCss);

  console.log("Initialized BunPress project!");
  console.log("Run 'buntastic dev' to start the dev server.");
}

const args = process.argv.slice(2);
const command = args[0];

if (command === "init") {
  init();
} else if (command === "build") {
  const drafts = args.includes("--drafts");
  build(drafts);
} else if (command === "dev") {
  dev();
} else if (command === "preview") {
  preview();
} else {
  console.log("Usage:");
  console.log("  buntastic init         - Initialize a new project");
  console.log("  buntastic build        - Build for production");
  console.log("  buntastic build --drafts - Build with drafts");
  console.log("  buntastic dev          - Development mode");
  console.log("  buntastic preview      - Serve dist folder");
}
