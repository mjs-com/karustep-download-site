# ローカルプレビュー

GitHub Pagesへpushする前に、MarkdownとCSSをMacBook上で確認できます。

## 起動方法

Finderでリポジトリを開き、`preview.command`をダブルクリックしてください。

ターミナルから起動する場合は、リポジトリのルートで次を実行します。

```shell
./preview.command
```

起動後、ブラウザで以下を開きます。

- トップページ: <http://127.0.0.1:4000/>
- Windows版トライアルマニュアル: <http://127.0.0.1:4000/trial-manual/>
- 正式版マニュアル: <http://127.0.0.1:4000/manual/>
- トライアル終了後の案内: <http://127.0.0.1:4000/after-trial/>
- Mac版ページ（作成後）: <http://127.0.0.1:4000/mac/>
- Mac版トライアルマニュアル（作成後）: <http://127.0.0.1:4000/mac/trial-manual/>

ファイルを保存するとブラウザが自動更新されます。

終了するときは、プレビューを実行しているターミナルで `Control + C` を押してください。

## CSSの指定

JekyllのレイアウトからCSSを読み込む場合は、サブディレクトリでも正しく動くように`relative_url`を使用します。

```liquid
<link rel="stylesheet" href="{{ '/assets/css/manual.css' | relative_url }}">
```

ローカルでは`/assets/css/manual.css`、GitHub Pagesでは`/karustep-download-site/assets/css/manual.css`として解決されます。
