import { spawn } from "node:child_process";
import { createReadStream, existsSync, watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const HOST = "127.0.0.1";
const PORT = 4000;
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_URL = `http://${HOST}:${PORT}/`;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

const liveReloadClients = new Set();
let reloadTimer;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontMatter(source) {
  if (!source.startsWith("---")) {
    return { data: {}, body: source };
  }

  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, body: source };
  }

  const data = {};
  let currentList = null;
  let currentItem = null;

  for (const line of match[1].split(/\r?\n/)) {
    const topLevel = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (topLevel) {
      const [, key, rawValue] = topLevel;
      if (rawValue === "") {
        data[key] = [];
        currentList = data[key];
      } else {
        data[key] = unquote(rawValue);
        currentList = null;
      }
      currentItem = null;
      continue;
    }

    const listItem = line.match(/^\s{2}-\s+([A-Za-z0-9_]+):\s*(.*)$/);
    if (listItem && currentList) {
      currentItem = { [listItem[1]]: unquote(listItem[2]) };
      currentList.push(currentItem);
      continue;
    }

    const itemProperty = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (itemProperty && currentItem) {
      currentItem[itemProperty[1]] = unquote(itemProperty[2]);
    }
  }

  return { data, body: source.slice(match[0].length) };
}

function stripTags(value) {
  return value.replace(/<[^>]*>/g, "").replaceAll("&amp;", "&");
}

function slugify(value) {
  return stripTags(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function addHeadingIds(html) {
  const used = new Map();
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (full, level, inner) => {
    const base = slugify(inner) || "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    return `<h${level} id="${escapeHtml(id)}">${inner}</h${level}>`;
  });
}

function renderMarkdown(markdown) {
  const expandedCallouts = markdown.replace(
    /<div class="([^"]+)" markdown="1">\s*([\s\S]*?)\s*<\/div>/g,
    (_full, className, inner) =>
      `<div class="${escapeHtml(className)}">\n${marked.parse(inner)}\n</div>`,
  );
  return addHeadingIds(marked.parse(expandedCallouts));
}

function renderManualLayout(data, content) {
  const toc = Array.isArray(data.toc)
    ? `<details class="manual-toc" open>
        <summary>このマニュアルの内容</summary>
        <ol>${data.toc
          .map(
            (item) =>
              `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`,
          )
          .join("")}</ol>
      </details>`
    : "";

  const manualLinks = [
    ["trial", "/trial-manual/", "トライアル"],
    ["azure", "/after-trial/", "正式版Azure設定"],
    ["update", "/update-manual/", "アップデート"],
  ];

  return `<!DOCTYPE html>
<html lang="ja-JP">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#075d9c">
    <title>${escapeHtml(data.title || "カルステップ")}</title>
    <meta name="description" content="${escapeHtml(data.description || "")}">
    <link rel="icon" href="/images/icon.png" type="image/png">
    <link rel="stylesheet" href="/assets/css/manual.css">
  </head>
  <body id="top" class="manual-page">
    <header class="manual-hero">
      <div class="manual-hero__inner">
        <nav class="manual-breadcrumb" aria-label="パンくずリスト">
          <a href="/">カルステップ ダウンロード</a><span aria-hidden="true">/</span><span>Windows版マニュアル</span>
        </nav>
        <div class="manual-badges" aria-label="マニュアル種別">
          <span class="manual-badge manual-badge--windows">Windows版</span>
          ${data.manual_label ? `<span class="manual-badge">${escapeHtml(data.manual_label)}</span>` : ""}
        </div>
        <h1>${escapeHtml(data.title || "カルステップ")}</h1>
        ${data.description ? `<p class="manual-hero__lead">${escapeHtml(data.description)}</p>` : ""}
        ${data.last_updated ? `<p class="manual-hero__meta">最終更新日：${escapeHtml(data.last_updated)}</p>` : ""}
      </div>
    </header>
    <nav class="manual-switcher" aria-label="Windows版マニュアル一覧">
      <div class="manual-switcher__inner">
        ${manualLinks
          .map(
            ([key, href, label]) =>
              `<a href="${href}"${data.manual_key === key ? ' aria-current="page"' : ""}>${label}</a>`,
          )
          .join("")}
        <a href="/changelog/">変更履歴</a>
      </div>
    </nav>
    <main class="manual-shell">
      ${toc}
      <article class="manual-content">${content}</article>
      <nav class="manual-footer-nav" aria-label="ページ末尾のナビゲーション">
        <a href="#top">ページ上部へ戻る</a><a href="/">ダウンロードページへ戻る</a>
      </nav>
    </main>
    <footer class="manual-site-footer">
      <p>&copy; ${new Date().getFullYear()} mjs-com. All rights reserved.</p>
      <p><a href="mailto:karustep@mjs-company.net">お問い合わせ：karustep@mjs-company.net</a></p>
    </footer>
    <a class="manual-back-to-top" href="#top" aria-label="ページ上部へ戻る">↑</a>
    <script>const events = new EventSource('/__events'); events.onmessage = () => location.reload();</script>
  </body>
</html>`;
}

function isInsideProject(candidate) {
  const relative = path.relative(PROJECT_ROOT, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, "");
  const candidate = path.resolve(PROJECT_ROOT, normalized);
  if (candidate !== PROJECT_ROOT && !isInsideProject(candidate)) return null;

  let info;
  try {
    info = await stat(candidate);
  } catch {
    return null;
  }

  if (info.isDirectory()) {
    const markdownIndex = path.join(candidate, "index.md");
    const htmlIndex = path.join(candidate, "index.html");
    if (existsSync(markdownIndex)) return { file: markdownIndex, markdown: true };
    if (existsSync(htmlIndex)) return { file: htmlIndex, markdown: false };
    return null;
  }

  return { file: candidate, markdown: candidate.endsWith(".md") };
}

function sendText(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, PREVIEW_URL);

    if (requestUrl.pathname === "/__events") {
      response.writeHead(200, {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write("retry: 500\n\n");
      liveReloadClients.add(response);
      request.on("close", () => liveReloadClients.delete(response));
      return;
    }

    const resolved = await resolveRequestPath(requestUrl.pathname);
    if (!resolved) {
      sendText(response, 404, "Not found");
      return;
    }

    if (resolved.markdown) {
      const source = await readFile(resolved.file, "utf8");
      const { data, body } = parseFrontMatter(source);
      const content = renderMarkdown(body);
      sendText(response, 200, renderManualLayout(data, content), "text/html; charset=utf-8");
      return;
    }

    const extension = path.extname(resolved.file).toLowerCase();
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    createReadStream(resolved.file).pipe(response);
  } catch (error) {
    console.error(error);
    sendText(response, 500, "Preview server error");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Close the other preview server and try again.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Karustep preview: ${PREVIEW_URL}`);
  console.log(`Formal manual: ${PREVIEW_URL}manual/`);
  console.log(`Trial manual:  ${PREVIEW_URL}trial-manual/`);

  if (process.platform === "win32") {
    const browser = spawn("cmd.exe", ["/c", "start", "", PREVIEW_URL], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    browser.unref();
  }
});

try {
  watch(PROJECT_ROOT, { recursive: true }, (_eventType, filename) => {
    if (!filename || /(^|[\\/])(\.git|node_modules)([\\/]|$)/.test(filename)) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      for (const client of liveReloadClients) client.write("data: reload\n\n");
    }, 150);
  });
} catch (error) {
  console.warn(`Live reload is unavailable: ${error.message}`);
}

function shutdown() {
  for (const client of liveReloadClients) client.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
