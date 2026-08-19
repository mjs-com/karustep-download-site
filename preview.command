#!/bin/zsh

set -euo pipefail

PROJECT_DIRECTORY="${0:A:h}"
RUBY_DIRECTORY="/opt/homebrew/opt/ruby@3.3/bin"
RUBY_GEMS_DIRECTORY="/opt/homebrew/lib/ruby/gems/3.3.0/bin"
PREVIEW_OUTPUT_DIRECTORY="${TMPDIR:-/tmp}/karustep-download-site-preview"

export PATH="${RUBY_DIRECTORY}:${RUBY_GEMS_DIRECTORY}:${PATH}"

cd "${PROJECT_DIRECTORY}"

if ! command -v bundle >/dev/null 2>&1; then
  echo "Bundlerが見つかりません。先にセットアップを実行してください。"
  exit 1
fi

if ! bundle check >/dev/null 2>&1; then
  echo "必要なライブラリを準備しています..."
  bundle install
fi

echo ""
echo "カルステップのローカルプレビューを起動します。"
echo "ブラウザで http://127.0.0.1:4000/ を開いてください。"
echo "終了するときは、この画面で Control + C を押してください。"
echo ""

bundle exec jekyll serve \
  --livereload \
  --baseurl "" \
  --host 127.0.0.1 \
  --port 4000 \
  --destination "${PREVIEW_OUTPUT_DIRECTORY}"
