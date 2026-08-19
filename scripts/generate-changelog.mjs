// =====================================================================
// generate-changelog.mjs
// ---------------------------------------------------------------------
// GitHub ReleasesからWindows版とMac版の変更履歴を同時生成する。
//
// タグ規則:
//   Windows版: v37.3 のような「v + バージョン」
//   Mac版:     mac-v3.2 のような「mac-v + バージョン」
//
// 出力:
//   changelog/index.html       Windows版
//   mac/changelog/index.html   Mac版
// =====================================================================

import { marked } from 'marked';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'mjs-com/karustep-download-site';
const COLLAPSE_LINE_THRESHOLD = 4;
const COLLAPSE_CHAR_THRESHOLD = 300;

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLATFORM_CONFIGS = [
  {
    key: 'windows',
    label: 'Windows版',
    tagPattern: /^v\d+(?:\.\d+)*$/i,
    displayTag: tag => tag,
    outputPath: join(__dirname, '..', 'changelog', 'index.html'),
    faviconHref: '../images/icon.png',
    downloadHref: '../',
    windowsHref: './',
    macHref: '../mac/changelog/',
    updateManualHref: '../update-manual/',
  },
  {
    key: 'mac',
    label: 'Mac版',
    tagPattern: /^mac-v\d+(?:\.\d+)*$/i,
    displayTag: tag => tag.slice(4),
    outputPath: join(__dirname, '..', 'mac', 'changelog', 'index.html'),
    faviconHref: '../../images/icon.png',
    downloadHref: '../',
    windowsHref: '../../changelog/',
    macHref: './',
    updateManualHref: null,
  },
];

async function fetchAllReleases() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'karustep-changelog-builder',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
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

function formatDate(isoString) {
  const d = new Date(isoString);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function shouldCollapse(body) {
  if (!body) return false;
  const lines = body.split('\n').filter(line => line.trim().length > 0);
  return lines.length > COLLAPSE_LINE_THRESHOLD || body.length > COLLAPSE_CHAR_THRESHOLD;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLegacyContacts(body) {
  return body
    .replaceAll('info@mjs-company.net', 'karustep@mjs-company.net')
    .replaceAll('mjsc0mpa2@gmail.com', 'karustep@mjs-company.net');
}

function renderRelease(release, config) {
  const rawTag = release.tag_name;
  const tag = escapeHtml(config.displayTag(rawTag));
  const articleId = escapeHtml(rawTag);
  const dateDisplay = formatDate(release.published_at);
  const dateIso = escapeHtml(release.published_at);
  const body = release.body && release.body.trim().length > 0
    ? normalizeLegacyContacts(release.body)
    : '_（このリリースには変更内容の記載がありません）_';
  const renderedBody = marked.parse(body);
  const collapse = shouldCollapse(body);

  const headerHtml = `
            <header class="flex flex-wrap items-baseline gap-3 mb-3 pb-3 border-b border-karu-bg">
                <h2 class="text-2xl font-bold text-karu-deep">${tag}</h2>
                <time datetime="${dateIso}" class="text-sm text-slate-500">${dateDisplay}</time>
            </header>`;

  const proseClasses = 'prose prose-slate max-w-none prose-headings:text-karu-deep prose-headings:font-bold prose-a:text-karu-primary prose-code:text-karu-deep prose-code:bg-karu-bg prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none';

  if (collapse) {
    return `
        <article id="${articleId}" class="bg-white rounded-lg shadow-sm border border-karu-bg p-6 mb-6 scroll-mt-6">${headerHtml}
            <details class="changelog-details">
                <summary class="cursor-pointer text-karu-primary font-semibold hover:underline select-none py-1">詳細を見る</summary>
                <div class="${proseClasses} mt-4">${renderedBody}</div>
            </details>
        </article>`;
  }

  return `
        <article id="${articleId}" class="bg-white rounded-lg shadow-sm border border-karu-bg p-6 mb-6 scroll-mt-6">${headerHtml}
            <div class="${proseClasses}">${renderedBody}</div>
        </article>`;
}

function renderPlatformTabs(config) {
  const windowsTab = config.key === 'windows'
    ? '<span aria-current="page" class="flex-1 max-w-52 rounded-md bg-karu-deep px-4 py-2 text-center font-bold text-white">Windows版</span>'
    : `<a href="${config.windowsHref}" class="flex-1 max-w-52 rounded-md bg-white px-4 py-2 text-center font-bold text-karu-deep hover:bg-karu-bg">Windows版</a>`;
  const macTab = config.key === 'mac'
    ? '<span aria-current="page" class="flex-1 max-w-52 rounded-md bg-karu-deep px-4 py-2 text-center font-bold text-white">Mac版</span>'
    : `<a href="${config.macHref}" class="flex-1 max-w-52 rounded-md bg-white px-4 py-2 text-center font-bold text-karu-deep hover:bg-karu-bg">Mac版</a>`;

  return `
    <nav aria-label="OS版の切り替え" class="max-w-reading mx-auto px-6 pt-6">
        <div class="flex justify-center gap-2 rounded-lg border border-sky-200 bg-white p-1.5 shadow-sm">
            ${windowsTab}
            ${macTab}
        </div>
    </nav>`;
}

function buildHtml(releases, config) {
  const newestRelease = releases[0];
  const lastReleaseHtml = newestRelease
    ? `<p class="text-sm text-slate-500 mb-6">最終リリース公開日: <time datetime="${escapeHtml(newestRelease.published_at)}">${formatDate(newestRelease.published_at)}</time></p>`
    : '';
  const articles = releases.length > 0
    ? releases.map(release => renderRelease(release, config)).join('\n')
    : `<section class="rounded-lg border border-karu-bg bg-white p-8 text-center shadow-sm">
            <h2 class="text-xl font-bold text-karu-deep">公開済みの変更履歴はまだありません</h2>
            <p class="mt-3 text-slate-600">${config.label}のリリース公開後、このページへ自動的に追加されます。</p>
        </section>`;
  const updateManualLink = config.updateManualHref
    ? `<span class="mx-2">|</span><a href="${config.updateManualHref}" class="text-karu-light hover:underline">アップデートマニュアル</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="カルステップ ${config.label}のバージョンごとの変更履歴。GitHub Releasesから自動生成しています。">
    <title>${config.label} 変更履歴 | カルステップ</title>
    <link rel="icon" href="${config.faviconHref}" type="image/png">
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              'karu-primary': '#0288d1',
              'karu-light': '#4fc3f7',
              'karu-bg': '#e1f5fe',
              'karu-deep': '#01579b',
              'karu-soft': '#f0f9ff'
            },
            fontFamily: {
              sans: ['"Hiragino Kaku Gothic ProN"', '"Hiragino Sans"', 'Meiryo', 'sans-serif']
            },
            maxWidth: { reading: '760px' }
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
            <p class="text-sm opacity-90 mb-2"><a href="${config.downloadHref}" class="hover:underline">← ${config.label}ダウンロードページへ戻る</a></p>
            <h1 class="text-3xl md:text-4xl font-bold">${config.label} 変更履歴</h1>
            <p class="mt-2 text-karu-bg">${config.label}の変更内容を新しい順に掲載しています</p>
        </div>
    </header>
${renderPlatformTabs(config)}
    <main class="max-w-reading mx-auto px-6 py-10">
        ${lastReleaseHtml}
${articles}
    </main>
    <footer class="bg-slate-800 text-slate-300 mt-12">
        <div class="max-w-reading mx-auto px-6 py-6 text-center text-sm">
            <p>&copy; <span id="year"></span> mjs-com. All rights reserved.</p>
            <p class="mt-2"><a href="${config.downloadHref}" class="text-karu-light hover:underline">${config.label}ダウンロードページへ戻る</a>${updateManualLink}</p>
        </div>
    </footer>
    <script>document.getElementById('year').textContent = new Date().getFullYear();</script>
</body>
</html>
`;
}

async function main() {
  console.log(`[changelog] Fetching releases from ${REPO}...`);
  const releases = (await fetchAllReleases())
    .filter(release => !release.draft)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

  const knownTagPatterns = PLATFORM_CONFIGS.map(config => config.tagPattern);
  const unknownTags = releases
    .map(release => release.tag_name)
    .filter(tag => !knownTagPatterns.some(pattern => pattern.test(tag)));
  if (unknownTags.length > 0) {
    console.warn(`[changelog] Ignoring releases with unrecognized tags: ${unknownTags.join(', ')}`);
  }

  for (const config of PLATFORM_CONFIGS) {
    const platformReleases = releases.filter(release => config.tagPattern.test(release.tag_name));
    const html = buildHtml(platformReleases, config);
    mkdirSync(dirname(config.outputPath), { recursive: true });
    writeFileSync(config.outputPath, html, 'utf-8');
    console.log(`[changelog] ${config.label}: ${platformReleases.length} releases -> ${config.outputPath}`);
  }
}

main().catch(error => {
  console.error('[changelog] Failed:', error);
  process.exit(1);
});
