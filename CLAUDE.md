# CLAUDE.md

## プロジェクト概要

共著ネットワーク可視化アプリ。React + D3.js のシングルページアプリケーション。

## コマンド

```bash
npm run dev      # 開発サーバー起動
npm run build    # プロダクションビルド
npm run lint     # ESLint 実行
npm run preview  # ビルド結果プレビュー
npm run parse    # 論文データ更新（.env の設定が必要）
```

## アーキテクチャ

- `src/App.jsx`: アプリのほぼ全てのロジックを含むメインコンポーネント
- `src/data/papers.js`: 論文データ（`npm run parse` で生成）
- `src/main.jsx`: React のエントリポイント
- `scripts/parse_papers_jp.mjs`: タブ区切り形式のファイルを `papers.js` に変換するスクリプト
- D3.js の force simulation でグラフを描画し、React の state で UI を管理する構成
- スタイルはインラインスタイルで記述（ダークテーマ、背景色: #0a0f1a）
- 環境依存のパス設定は `.env` で管理（テンプレート: `.env.example`）

## 環境変数

`.env.example` を `.env` にコピーして、個人の設定に合わせて編集してください：

```bash
# .env.example を .env にコピー
cp .env.example .env
```

`.env` ファイルには個人情報やローカルパスが含まれるため、`.gitignore` で除外されています。GitHubにはアップロードされません。

## コーディング規約

- JavaScript (JSX) を使用（TypeScript 不使用）
- ESLint 9 のフラットコンフィグ形式（`eslint.config.js`）
- React Hooks ベース（クラスコンポーネント不使用）
- Vite をビルドツールとして使用
