# CAD Viewer

STEP / STP / DXF 形式の CAD ファイルをブラウザ上で表示する軽量ビューアです。  
単体のウェブアプリとして動作するほか、**iFrame 組み込み + postMessage API** によって親アプリからファイルデータを受け取ることもできます。

---

## 機能

### 共通

| 機能 | 説明 |
|------|------|
| ファイル読み込み | ファイルピッカー・ドラッグ&ドロップ・postMessage |
| 自動判別 | 拡張子で STEP / DXF を自動判別してビューアを切り替え |
| デバッグパネル | 色・照明をリアルタイム調整（Ctrl+Shift+D、STEP のみ） |

### STEP ビューア（.step / .stp）

| 機能 | 説明 |
|------|------|
| 3D 表示 | occt-import-js による高精度 STEP パーサ + Three.js レンダリング |
| 表示モード切替 | シェード / シェード+エッジ / 陰線 / ワイヤーフレーム |
| エッジ描画 | 鋭角エッジ・稜線・シルエット輪郭線の個別表示 |
| 操作 | 回転（左ドラッグ）・パン（右ドラッグ）・ズーム（ホイール） |
| 寸法計測 | 2 点クリックで距離を計測・3D 表示 |
| コメント | クリック位置に 3D ピンコメントを配置 |
| ViewCube | 標準ビューへのスナップ・ビュー方向インジケータ |

### DXF ビューア（.dxf）

| 機能 | 説明 |
|------|------|
| 2D 表示 | dxf-parser + Three.js（OrthographicCamera）による 2D 図面表示 |
| 対応エンティティ | LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC / SPLINE / INSERT / TEXT / MTEXT |
| レイヤーカラー | DXF カラーインデックス（ACI）→ RGB 変換（白は黒に変換） |
| 複数レイアウト | Model 空間 + Paper 空間のタブ切り替え |
| 操作 | パン（右/中ドラッグ）・ズーム（ホイール）・ダブルクリックで全体フィット |
| レイヤーパネル | レイヤー一覧の表示/非表示トグル |

---

## 技術スタック

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| React | 19 | UI |
| Vite | 8 | ビルド |
| Three.js | 0.183 | 3D / 2D レンダリング |
| occt-import-js | 0.0.23 | STEP パーサ（WebAssembly） |
| dxf-parser | 1.x | DXF パーサ |
| TailwindCSS | 4 | スタイリング |

---

## セットアップ

```bash
npm install
npm run dev        # 開発サーバ起動 (http://localhost:5173)
npm run build      # プロダクションビルド → dist/
npm run preview    # ビルド成果物のプレビュー
```

---

## 使い方

### スタンドアロン

1. ブラウザでアプリを開く
2. STEP / STP / DXF ファイルをドロップ、またはヘッダの「ファイルを開く」をクリック
3. マウス操作でモデル・図面を確認

---

### STEP ビューア

#### 表示モード

ツールバー右グループのアイコンボタンで切り替えます。

| モード | 説明 |
|--------|------|
| シェード | シェードのみ（エッジなし） |
| ＋エッジ | シェード＋全エッジ表示（デフォルト） |
| 陰線 | 陰線消去（背景色でマスク） |
| ワイヤー | ワイヤーフレームのみ |

#### マウス操作

| 操作 | 動作 |
|------|------|
| 左ドラッグ | 回転（ピボット中心） |
| 右ドラッグ | パン（平行移動） |
| ホイール | ズーム（カーソル位置を中心に拡縮） |

#### ツールバーアイコン

##### 操作モード（左グループ）

| アイコン | モード | 説明 |
| --- | --- | --- |
| カーソル | ナビゲート | 通常の回転・パン・ズーム操作 |
| 寸法線 | 寸法測定 | 2 点クリックで距離を計測・3D 表示 |
| 吹き出し | コメント | クリック位置に 3D ピンコメントを配置 |

##### 表示モード（右グループ）

| アイコン | モード | 説明 |
| --- | --- | --- |
| 塗り潰し正方形 | シェード | シェードのみ（エッジなし） |
| 枠付き正方形 | ＋エッジ | シェード＋全エッジ表示（デフォルト） |
| 破線グリッド | 陰線 | 陰線消去（背景色でマスク） |
| 格子 | ワイヤー | ワイヤーフレームのみ |

#### ViewCube

ビューア右下に 3D キューブが表示され、現在のカメラ方向と連動して回転します。

| 操作 | 動作 |
|------|------|
| キューブの面をクリック | 上面 / 下面 / 正面 / 背面 / 右面 / 左面へスナップ（350ms アニメーション） |
| ▲ / ▼ / ◀ / ▶ 矢印 | 上面 / 下面 / 左面 / 右面へスナップ |
| 全体表示ボタン | 等角投影ビュー（1,1,1 方向）にリセット |

スナップ・リセット時はモデルのバウンディングボックスを基準に**自動フィット**します。

#### デバッグパネル（Ctrl+Shift+D）

色と照明をリアルタイムで調整できます（開発・確認用）。

| 項目 | 内容 |
|------|------|
| 背景色 | ビューポート背景 |
| モデル色 | モデルのシェード色 |
| 鋭角エッジ色 | 面角度の鋭いエッジ |
| 稜線色 | 面間の緩い稜線・タンジェント接続部 |
| シルエット色 | 視点依存の輪郭線 |
| 環境光強度 | HemisphereLight（デフォルト: 1.0） |
| キーライト強度 | 主照明 DirectionalLight（デフォルト: 2.0） |
| フィルライト強度 | 補助照明 DirectionalLight（デフォルト: 1.0） |

---

### DXF ビューア

#### DXF マウス操作

| 操作 | 動作 |
| --- | --- |
| 右ドラッグ / 中ボタンドラッグ | パン（平行移動） |
| ホイール | ズーム |
| ダブルクリック | 全体フィット |

#### DXF ツールバー

| ボタン | 説明 |
| --- | --- |
| フィット | 図面全体が収まるように表示をリセット |
| レイヤー | レイヤーパネルを開き、個別に表示/非表示を切り替え |

#### レイアウトタブ

Paper Space（印刷レイアウト）が含まれている場合、ビューア上部にタブが表示されます。  
`Model`（モデル空間）と各レイアウト名をクリックして切り替えられます。  
Model のみの場合はタブは非表示です。

---

## iFrame 組み込み / postMessage API

CAD Viewer を iFrame として親アプリに埋め込み、postMessage でファイルデータを送ることができます。

### 基本的な組み込み

```html
<iframe id="cadViewer" src="https://your-deployed-url/" style="width:100%;height:600px;border:none;"></iframe>
```

### URL パラメータ

| パラメータ | 値 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `fileOpen` | `true` / `false` | `true` | `false` にすると「ファイルを開く」ボタンとドロップゾーンを非表示にする |

```html
<!-- ファイルを開くボタンを非表示（postMessage 専用モード） -->
<iframe src="https://your-deployed-url/?fileOpen=false" style="width:100%;height:600px;border:none;"></iframe>
```

### STEP ファイルの送信

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `type` | `string` | 必須 | `"loadStep"` |
| `buffer` | `ArrayBuffer` | 必須 | STEP ファイルのバイナリデータ |
| `name` | `string` | 任意 | ファイル名（省略時: `"model.stp"`） |

```javascript
const response = await fetch('/path/to/model.step')
const buffer = await response.arrayBuffer()

document.getElementById('cadViewer').contentWindow.postMessage(
  { type: 'loadStep', buffer, name: 'model.step' },
  '*'
)
```

### DXF ファイルの送信

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `type` | `string` | 必須 | `"loadDxf"` |
| `buffer` | `ArrayBuffer` | 必須 | DXF ファイルのバイナリデータ |
| `name` | `string` | 任意 | ファイル名（省略時: `"drawing.dxf"`） |

```javascript
const response = await fetch('/path/to/drawing.dxf')
const buffer = await response.arrayBuffer()

document.getElementById('cadViewer').contentWindow.postMessage(
  { type: 'loadDxf', buffer, name: 'drawing.dxf' },
  '*'
)
```

### postMessage API 一覧

| type | 内容 | ステータス |
|------|------|----------|
| `loadStep` | STEP ファイルのロード | 実装済み |
| `loadDxf` | DXF ファイルのロード | 実装済み |
| `setDisplayMode` | 表示モードの切替（STEP） | 予定 |
| `setColors` | 色設定の変更（STEP） | 予定 |
| `setCamera` | カメラ位置・方向の指定 | 予定 |
| `resetCamera` | カメラをホームに戻す | 予定 |
| `measure` | 計測モードの切替（STEP） | 予定 |

---

## プロジェクト構成

```
cad-viewer-experiment/
├── index.html              # エントリポイント（フォント読み込みを含む）
├── src/
│   ├── main.jsx            # React マウント
│   ├── index.css           # グローバルスタイル
│   ├── App.jsx             # ルートコンポーネント・ファイル判別・状態管理
│   └── components/
│       ├── StepViewer.jsx  # STEP 3D ビューアコア
│       └── DxfViewer.jsx   # DXF 2D ビューアコア
├── public/
│   └── favicon.svg
├── vite.config.js
└── package.json
```

---

## デフォルト設定

### STEP ビューア（デフォルト）

| 設定 | 値 |
| --- | --- |
| 背景色 | `#f0f0f0` |
| モデル色 | `#d7d7d7` |
| 鋭角エッジ色 | `#111111` |
| 稜線色 | `#888888` |
| シルエット色 | `#888888` |
| 表示モード | Shaded + Edges |
| カメラ | 等角投影（1, 1, 1 方向から） |
| 環境光 | 1.0 |
| キーライト | 2.0 |
| フィルライト | 1.0 |

### DXF ビューア（デフォルト）

| 設定 | 値 |
| --- | --- |
| 背景色 | `#ffffff` |
| 線色 | DXF レイヤーカラー（ACI）に従う。白(7番)は `#111111` |
| カメラ | OrthographicCamera（全体フィット） |
