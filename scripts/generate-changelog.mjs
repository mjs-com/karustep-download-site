// =====================================================================
// generate-changelog.mjs
// ---------------------------------------------------------------------
// GitHub Releases から changelog/index.html を生成するスクリプト。
//
// - GitHub APIでリポジトリの全リリースを取得（ページング対応）
// - 各リリースの本文（markdown）を marked で HTML に変換
// - 行数や文字数が多い本文は <details> で折りたたみ表示
// - Tailwind CDNを使った自己完結型のHTMLを出力（VS Codeでプレビュー可）
//
// 実行方法:
//   ローカル: node scripts/generate-changelog.mjs
//   GitHub Actions: 同じく（GITHUB_TOKEN env var を自動利用）
//
// 依存:
//   - Node.js 18+ (built-in fetch)
//   - marked（package.jsonに記載）
// =====================================================================

import { marked } from 'marked';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- 設定 -----------------------------------------------------------
const REPO = 'mjs-com/karustep-download-site';
const COLLAPSE_LINE_THRESHOLD = 4;   // この行数を超えたら折りたたみ
const COLLAPSE_CHAR_THRESHOLD = 300; // この文字数を超えたら折りたたみ

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'changelog', 'index.html');

// ---- GitHub API ----------------------------------------------------
async function fetchAllReleases() {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'karustep-changelog-builder',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const all = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
    }
    const releases = await res.json();
    if (releases.length === 0) break;
    all.push(...releases);
    if (releases.length < 100) break;
    page += 1;
  }
  return all;
}

// ---- ユーティリティ -------------------------------------------------
function formatDate(isoString) {
  // JST表記。time要素のdatetime属性にはISO文字列を別途使用する
  const d = new Date(isoString);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function shouldCollapse(body) {
  if (!body) return false;
  const lines = body.split('\n').filter(l => l.trim().length > 0);
  return lines.length > COLLAPSE_LINE_THRESHOLD || body.length > COLLAPSE_CHAR_THRESHOLD;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- 1リリース分のHTML生成 ------------------------------------------
function renderRelease(r) {
  const tag = escapeHtml(r.tag_name);
  const dateDisplay = formatDate(r.published_at);
  const dateIso = r.published_at;
  const body = r.body && r.body.trim().length > 0
    ? r.body
    : '_（このリリースには変更内容の記載がありません）_';

  // GitHub上のリリースページへのリンク
  const releaseUrl = `https://github.com/${REPO}/releases/tag/${encodeURIComponent(r.tag_name)}`;

  const renderedBody = marked.parse(body);
  const collapse = shouldCollapse(body);

  const headerHtml = `
            <header class="flex flex-wrap items-baseline gap-3 mb-3 pb-3 border-b border-karu-bg">
                <h2 class="text-2xl font-bold text-karu-deep">${tag}</h2>
                <time datetime="${escapeHtml(dateIso)}" class="text-sm text-slate-500">${dateDisplay}</time>
                <a href="${escapeHtml(releaseUrl)}" target="_blank" rel="noopener" class="ml-auto text-xs text-karu-primary hover:underline">GitHub ↗</a>
            </header>`;

  const proseClasses = 'prose prose-slate max-w-none prose-headings:text-karu-deep prose-headings:font-bold prose-a:text-karu-primary prose-code:text-karu-deep prose-code:bg-karu-bg prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none';

  if (collapse) {
    return `
        <article id="${tag}" class="bg-white rounded-lg shadow-sm border border-karu-bg p-6 mb-6 scroll-mt-6">${headerHtml}
            <details class="changelog-details">
                <summary class="cursor-pointer text-karu-primary font-semibold hover:underline select-none py-1">詳細を見る</summary>
                <div class="${proseClasses} mt-4">${renderedBody}</div>
            </details>
        </article>`;
  }

  return `
        <article id="${tag}" class="bg-white rounded-lg shadow-sm border border-karu-bg p-6 mb-6 scroll-mt-6">${headerHtml}
            <div class="${proseClasses}">${renderedBody}</div>
        </article>`;
}

// ---- ページ全体のHTML生成 -------------------------------------------
function buildHtml(releases) {
  const generatedAt = new Date().toISOString();
  const generatedAtDisplay = new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });

  const articles = releases.map(renderRelease).join('\n');
  const releaseCount = releases.length;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="カルステップ バージョンごとの変更履歴。GitHub Releasesから自動生成しています。">
    <title>変更履歴 | カルステップ</title>
    <link rel="icon" href="../images/icon.png" type="image/png">
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              'karu-primary': '#0288d1',
              'karu-light':   '#4fc3f7',
              'karu-bg':      '#e1f5fe',
              'karu-deep':    '#01579b',
              'karu-soft':    '#f0f9ff',
            },
            fontFamily: {
              sans: ['"Hiragino Kaku Gothic ProN"', '"Hiragino Sans"', 'Meiryo', 'sans-serif'],
            },
            maxWidth: {
              'reading': '760px',
            },
          }
        }
      }
    </script>
    <style>
      html { scroll-behavior: smooth; }
      details > summary { list-style: none; }
      details > summary::-webkit-details-marker { display: none; }
      details > summary::before {
        content: "▶";
        display: inline-block;
        margin-right: 8px;
        font-size: 0.8em;
        color: #0288d1;
        transition: transform 0.15s ease;
      }
      details[open] > summary::before { transform: rotate(90deg); }
    </style>
</head>
<body class="bg-karu-soft text-slate-800 font-sans leading-relaxed antialiased">

    <header class="bg-karu-primary text-white shadow-md">
        <div class="max-w-reading mx-auto px-6 py-8">
            <p class="text-sm opacity-90 mb-2">
                <a href="../" class="hover:underline">← カルステップ ダウンロードページへ戻る</a>
            </p>
            <h1 class="text-3xl md:text-4xl font-bold">変更履歴</h1>
            <p class="mt-2 text-karu-bg">バージョンごとの変更内容を新しい順に掲載しています</p>
        </div>
    </header>

    <main class="max-w-reading mx-auto px-6 py-10">
        <p class="text-sm text-slate-500 mb-6">
            最終更新: <time datetime="${generatedAt}">${generatedAtDisplay}</time>
            ・ 全 ${releaseCount} バージョン
            <span class="block mt-1 text-xs">（このページは GitHub Releases から自動生成されています）</span>
        </p>

${articles}

        <p class="text-sm text-slate-500 text-center mt-10">
            最新の更新情報は <a href="https://github.com/${REPO}/releases" class="text-karu-primary hover:underline" target="_blank" rel="noopener">GitHub Releases</a> でもご確認いただけます。
        </p>
    </main>

    <footer class="bg-slate-800 text-slate-300 mt-12">
        <div class="max-w-reading mx-auto px-6 py-6 text-center text-sm">
            <p>&copy; <span id="year"></span> mjs-com. All rights reserved.</p>
            <p class="mt-2">
                <a href="../" class="text-karu-light hover:underline">ダウンロードページへ戻る</a>
                <span class="mx-2">|</span>
                <a href="../update-manual/" class="text-karu-light hover:underline">アップデートマニュアル</a>
            </p>
        </div>
    </footer>

    <script>
      document.getElementById('year').textContent = new Date().getFullYear();
    </script>
</body>
</html>
`;
}

// ---- メイン --------------------------------------------------------
async function main() {
  console.log(`[changelog] Fetching releases from ${REPO}...`);
  const releases = await fetchAllReleases();
  const filtered = releases
    .filter(r => !r.draft)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  console.log(`[changelog] Found ${filtered.length} releases (excluding drafts).`);

  const html = buildHtml(filtered);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, html, 'utf-8');
  console.log(`[changelog] Wrote ${OUTPUT_PATH} (${html.length.toLocaleString()} bytes)`);
}

main().catch(err => {
  console.error('[changelog] Failed:', err);
  process.exit(1);
});
