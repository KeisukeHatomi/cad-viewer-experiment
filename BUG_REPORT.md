# CAD Viewer Experiment - バグチェックレポート

**生成日**: 2026年4月4日  
**プロジェクト**: cad-viewer-experiment  
**チェック対象**: ソースコード、設定ファイル、ビルドプロセス  

## 全体的な評価

- **プロジェクト構造**: React + Vite + Three.js + occt-import-js を使用したCADビューアー。基本構造は適切。
- **コード品質**: TypeScript相当のJavaScriptで、ESLint設定あり。潜在的なバグは少ないが、設定関連の問題あり。
- **ビルド状況**: ビルドが失敗（exit code 1）するが、エラーメッセージが不明瞭。原因特定が必要。
- **テスト**: テストファイルなし。ランタイムテスト未実施。

## 特定されたバグ/問題

### 1. ESLint設定の問題（重大度: 中）

- **場所**: `eslint.config.js`
- **説明**: ESLintが `public/occt-import-js.js` をチェックし、Node.jsグローバル変数（`__filename`, `process`, `require` など）の未定義エラーを多数報告。これはEmscripten生成のWASMライブラリファイルで、ブラウザ環境では問題ないが、ESLintがブラウザグローバルしか認識していないため。
- **影響**: リント時に誤ったエラーが表示され、CI/CDで問題になる可能性。ビルド失敗の間接原因の可能性。
- **修正提案**: `eslint.config.js` の `globalIgnores` に `'public/**'` を追加。または、Node.jsグローバル（`process`, `Buffer` など）を `globals.node` として追加（ただしブラウザ環境なので推奨しない）。
- **対応**: ✅ 修正済み（`e6fdca1`） — `globalIgnores` に `'public'` を追加。

### 2. ビルド失敗（重大度: 高）

- **場所**: ビルドプロセス全体
- **説明**: `npm run build` が "22 modules transformed." の後に失敗（exit code 1）。詳細なエラーメッセージが表示されない。Vite 8.0.3を使用。
- **潜在的原因**:
  - `vite.config.js` で `optimizeDeps.exclude: ['occt-import-js']` されているが、`public/occt-import-js.js` がビルド時に処理されている可能性。
  - occt-import-js.js が巨大（数MB）で、ビルドタイムアウトやメモリ不足の可能性。
  - Viteの新しいバージョン（8.x）との互換性問題。
- **修正提案**:
  - `vite.config.js` の `build.rollupOptions.external` に `'occt-import-js'` を追加。
  - ビルドログを詳細に取得（例: `DEBUG=vite:* npm run build`）。
  - Viteバージョンを安定版（5.x）にダウングレードしてテスト。
- **対応**: ⚠️ 対応不要 — CI環境（sandbox）のメモリ制限による打ち切りが原因と判断。Vercel 上での実ビルド・デプロイは正常に完了しており、コード上の問題なし。

### 3. HTML言語属性の不一致（重大度: 低）

- **場所**: `index.html`
- **説明**: `<html lang="en">` だが、プロジェクトが日本語UIを使用（フォント: Noto Sans JP、テキスト: 日本語）。
- **影響**: SEOやアクセシビリティの軽微な問題。
- **修正提案**: `lang="ja"` に変更。
- **対応**: ✅ 修正済み（`e6fdca1`） — `lang="ja"` に変更。

### 4. 潜在的なランタイムバグ（重大度: 低〜中）

- **場所**: `src/components/StepViewer.jsx` 行615付近
- **説明**: occt-import-js を動的scriptタグでロード。ブラウザ環境では問題ないが、SSRやテスト環境で失敗する可能性。
- **影響**: 開発環境以外で動作しない。
- **修正提案**: ESMインポートに変更するか、条件付きロードを追加。
- **対応**: ⚠️ 対応不要 — Vite の ESM/WASM 処理を回避するための意図的な設計。本プロジェクトは CSR 専用（SSR なし）のため問題なし。

- **場所**: `src/App.jsx` 行101
- **説明**: `handleFileDrop` で `e.target.files?.[0]` と `e.dataTransfer?.files?.[0]` を使用。onDropイベントでは `e` がDragEventなので正しいが、型安全性が低い。
- **影響**: ランタイムエラーなしだが、TypeScript使用時に型エラー。
- **修正提案**: 型チェックを追加。
- **対応**: ⚠️ 対応見送り — JSX プロジェクトのため現状ランタイム上の問題なし。TypeScript 移行時に対応。

## 推奨事項

- ESLint設定を修正してpublic/を除外。
- ビルド失敗の根本原因を特定（Viteログ詳細化）。
- テストを追加（Jest + React Testing Library）。
- TypeScriptに移行して型安全性を向上。
- アクセシビリティ（ARIA属性など）を改善。

## 結論

主な問題は設定関連（ESLint, ビルド）。コード自体は堅牢だが、ビルド失敗がクリティカル。コード生成側は設定ファイルのテンプレートを改善し、occt-import-jsのような外部ライブラリの扱いを標準化してください。
