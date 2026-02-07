# Co-authorship Network Visualization

学術論文の共著関係をインタラクティブな力学グラフとして可視化するWebアプリケーションです。2008年から2025年末を対象として，336本の会計・ファイナンス分野の論文について、著者間の共著ネットワークを探索できます。（スマートフォンからアクセスした場合には、正しく表示がされない可能性があります。PCからのアクセスを推奨します。）

https://shimi-toshi.github.io/coauthor-network/

## 機能

- **力学グラフ（Force-directed Graph）**: D3.js による共著ネットワークのインタラクティブな可視化
- **ノード操作**: クリックで著者の詳細情報を表示、ドラッグでノードを移動
- **ノードサイズの切り替え**: 論文数・被引用数・共著者数でノードサイズを変更可能
- **論文一覧**: 著者ごとの論文リスト（タイトル・ジャーナル・年・DOI・被引用数）を閲覧
- **共著者ナビゲーション**: 共著者をクリックしてネットワークを辿れる
- **著者検索**: 著者名で検索してネットワーク上のノードを特定
- **ランキング表示**: 論文数・共著者数による上位10名の著者ランキング
- **ズーム・パン**: マウスホイールやドラッグでグラフを自在に操作

## 対象ジャーナル

本アプリケーションでは、以下の22誌に掲載された論文を対象としています。なお、これらは会計・ファイナンス分野のジャーナルの一部であり、網羅的なリストではありません。また、ジャーナルの選択について特定の意図や優劣の評価を含むものではありません。
（今後，必要があれば拡充します。）

- Abacus: A Journal of Accounting, Finance and Business Studies
- Accounting and Business Research
- Accounting & Finance
- Accounting Horizons
- Accounting, Organizations and Society
- Asia-Pacific Journal of Financial Studies
- Asian Review of Accounting
- Auditing: A Journal of Practice & Theory
- Contemporary Accounting Research
- European Accounting Review
- European Financial Management
- Finance Research Letters
- Journal of Accounting and Public Policy
- Journal of Accounting, Auditing & Finance
- Journal of Business Finance & Accounting
- Journal of Corporate Finance
- Journal of International Accounting Research
- Journal of Management Accounting Research
- Pacific-Basin Finance Journal
- The Accounting Review
- The British Accounting Review
- The International Journal of Accounting

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| UI | React 19 |
| 可視化 | D3.js 7 |
| ビルドツール | Vite 7 |
| Lint | ESLint 9 |

## セットアップ

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定（論文データを更新する場合のみ必要）
cp .env.example .env
# .env ファイルを編集して、INPUT_FILE と OUTPUT_FILE のパスを設定
```

## 開発

```bash
# 開発サーバー起動（HMR対応）
npm run dev

# プロダクションビルド
npm run build

# ビルド結果のプレビュー
npm run preview

# Lint
npm run lint

# 論文データの更新（詳細は doc/data-update-guide.md を参照）
npm run parse
```

## プロジェクト構成

```
src/
├── App.jsx              # メインコンポーネント（グラフ描画・UI）
├── main.jsx             # エントリポイント
└── data/
    └── papers.js        # 論文データ（parse スクリプトで生成）
scripts/
└── parse_papers_jp.mjs  # 論文データ変換スクリプト
doc/
└── data-update-guide.md # データ更新手順ガイド
```
