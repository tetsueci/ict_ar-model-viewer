# 3D モデル AR ビューア（Google model-viewer + GitHub Pages）

スマートフォンのブラウザで 3D モデルを表示し、「AR で置く」ボタンで現実の床に置けるページです。
アプリのインストールは要りません。

| 端末 | AR の仕組み | 備考 |
|---|---|---|
| Android（Chrome） | Scene Viewer / WebXR | ARCore 対応機種 |
| iPhone / iPad（Safari） | Quick Look | USDZ は GLB から自動で作られる（`usdz` を書けばそれを使う） |
| PC | AR なし（3D 表示のみ） | 右下の QR をスマホで読むと同じモデルが開く |

AR は **HTTPS でないと動きません**。GitHub Pages は HTTPS なのでそのまま使えます。

> **★ページの中身（`common/`）と道具（`tools/`）は ict_ar-viewer にある**（2026-10-03。正は 1 か所）。
> 各フォルダの `index.html` は `https://tetsueci.github.io/ict_ar-viewer/common/` を読む。直すのは ict_ar-viewer の `common/` で、
> 直すとこのリポジトリの全フォルダにも効く。道具はこのリポジトリの直下で
> `python ../ict_ar-viewer/tools/<道具>.py … --out ../ar-model-viewer/<フォルダ>` と打つ
> （`--out` はこの形で書く。新しいフォルダの `index.html` は自動で上の URL を読む形になる）。
> 暗号化する現場は ict_ar-viewer に置く（このリポジトリには置かない）。

## 中身

```
index.html        表示ページ（モデルの一覧・AR ボタン・PC 用の QR）
models.json       表示するモデルの一覧 ← モデルを足すときはここに 1 行
models/           GLB を置く
align/ TEST-E/    現場合わせのフォルダ（index.html・config.json・model.glb・plan.png）
（道具 tools/ と common/ は ict_ar-viewer にある）
.nojekyll         GitHub Pages に Jekyll の加工をさせない
```

## 1. GitHub で公開する

1. GitHub で新しいリポジトリを作る（例 `ar-model-viewer`、**Public**）。
   README などは付けずに空で作る
2. このフォルダから送る

   ```bash
   git remote add origin https://github.com/<アカウント>/ar-model-viewer.git
   git push -u origin main
   ```

3. リポジトリの **Settings → Pages** で
   Source = **Deploy from a branch**、Branch = **main** / **/(root)** にして Save
4. 1〜2 分で公開される

   `https://<アカウント>.github.io/ar-model-viewer/`

   モデルを指定して開くときは `?m=<id>` を付ける（例 `…/ar-model-viewer/?m=sample_box`）。

> **Public リポジトリのモデルは誰でもダウンロードできます。** 公開してよいモデルだけを置いてください。
> 限られた人にだけ見せたい場合、GitHub Pages では制限できません（有料プランの Private Pages を除く）。

## 2. モデルを足す

1. GLB を `models/` に置く
2. `models.json` に 1 件足す

   ```json
   {
     "id": "kumakigawa",
     "title": "熊木川橋 補修",
     "description": "実寸",
     "src": "models/kumakigawa.glb",
     "arScale": "fixed"
   }
   ```

   | 項目 | 意味 |
   |---|---|
   | `id` | URL の `?m=` に使う名前（英数字） |
   | `src` | GLB のパス |
   | `arScale` | `fixed` = 実寸のまま置く（指で拡大縮小できない）／ `auto` = 指で拡大縮小できる |
   | `usdz` | （任意）iPhone 用に自分で作った USDZ。無ければ自動で作る |
   | `poster` | （任意）読み込み中に出す画像 |
   | `cameraOrbit` | （任意）最初の視点。例 `"45deg 65deg 20m"` |

3. `git add` → `git commit` → `git push`。1〜2 分で反映される

### IFC から作る

```bash
python ../ict_ar-viewer/tools/ifc_to_glb.py 入力.ifc models/kumakigawa.glb
```

- IfcOpenShell が要る（`pip install ifcopenshell numpy`）
- 実寸・メートルで出す。平面直角座標のままだと形が崩れるので、**水平は中心・高さは底を 0** に寄せる
- 大きい構造物（橋など）を机の上で見たいときは縮尺をかける

  ```bash
  python ../ict_ar-viewer/tools/ifc_to_glb.py 入力.ifc models/bridge_1-100.glb --scale 0.01
  ```

  縮尺をかけたものは `arScale` を `auto` にすると、置いてから指で大きさを変えられる
- `IfcSpace` `IfcOpeningElement` などは出さない（`--skip` で変えられる）

### ほかの形式から作る

- **Blender**（OBJ / FBX / STL / DAE など）：読み込み → ファイル → エクスポート → glTF 2.0 → 形式 **glTF バイナリ (.glb)**
- **Revit / SketchUp / Rhino**：それぞれの glTF 書き出し（アドイン）で .glb にする
- 気をつけること
  - **単位はメートル**（mm のまま出すと 1000 倍になる）
  - **Y が上**（Blender の glTF 書き出しは「+Y 上」が既定で ON）
  - 原点が遠いと AR で見つからない。原点の近くへ寄せる

## AR の置き方（位置合わせ）

- **GPS や座標で現地の位置に合わせる仕組みはありません。**
  カメラが床を見つけると、**画面の中央に映っている床の上**にモデルを置きます
- 置いたあとは指で動かして合わせる：**1 本指でドラッグ＝床の上で移動**、**2 本指でひねる＝回転**、
  `arScale` が `auto` のときだけ **2 本指で広げる・つまむ＝拡大縮小**
- Android の WebXR で開いたときは、画面の下に操作の案内が出る
  （Scene Viewer・iPhone の Quick Look は Google・Apple の画面なので出ない）

## 現場の位置に合わせる（align/）★今後はこちらを更新する

`https://<アカウント>.github.io/ict_ar-model-viewer/align/`（Android の Chrome・ARCore 対応機）

- ★**ページの中身と動きは ict_ar-viewer の `common/` にあり、どのフォルダも同じものを使う。そこを直すと全フォルダに効く**
  - `common/align.js`（画面の部品と動き）・`common/align.css`（見た目）・`common/vlaunch.js`（iPhone 用）
  - 各フォルダには `index.html`（`common/page.html` の写し。直さない）・`config.json`（基準点とモデル）・`model.glb`・`plan.png` だけ
  - **新しいモデルは新しいフォルダで作る**：`python ../ict_ar-viewer/tools/dxf_to_site.py <DXF> --out ../ar-model-viewer/<フォルダ> --title "名前"`
    （`index.html` が無ければ写す）。URL は `…/ict_ar-model-viewer/<フォルダ>/`
- **位置合わせモード**（橙）のときだけモデルが動く。「固定する」で固定中（緑）になり、触っても動かない
- ★**基準点は何点でもよい**（`config.json` の `points` を全部使う）。◀ ▶ で固定点（青）と向ける点（橙）を選び、
  3 点目からは十字を当てて「＋ 足す」。**記録した全部の点で最小二乗**（水平は回転＋移動〔拡大ありなら＋拡大〕・高さは平均）で置き直し、
  点ごとのずれ（水平/高さ cm）が出る。20 cm を超える点があれば赤で出る。「近い点」で十字にいちばん近い点を選べる
- 基準点にはすべて**旗**が立つ（高さ 1.5 m の竿＋玉・足もとの輪と中心の点・名前の札）。固定点は青、向ける点は橙、ほかは白
- 固定する点（P1 / P2）を選び、その点を中心に回転・拡大する
  - 「◎ P1 をここへ」：固定点を十字の位置へ
  - 「→ P2 へ向ける」：固定点を中心に回して、もう一方の点を十字の方向へ（拡大ありなら距離も合わせる）
  - 画面をなぞる・ひねる＝回転、2 本指で広げる＝拡大（拡大ありのとき）、⟲⟳ ▲▼ ボタンで微調整
- 中身（model.glb・config.json・plan.png）は道路モデルの DXF から作る

  ```bash
  python ../ict_ar-viewer/tools/dxf_to_site.py <model.dxf> --out ../ar-model-viewer/align --title "名前"
  ```

  - 読む図形：ポリゴンメッシュ・ポリフェースメッシュ・3DFACE。3DSOLID は DXF から形が読めないので、
    同じフォルダの `road_box.lsp`（ボックスカルバートの寸法）から作り直す
  - **基準点＝Z 方向に立てた LINE の下の端**（2 本。見つけた順に P1・P2）
- 試験用の一式（2 点 5 m・ボックス 10 m）は `python ../ict_ar-viewer/tools/make_site_test.py`（`sites/` に出る）
- **IFC から作る**：`python ../ict_ar-viewer/tools/ifc_to_site.py <IFC> --out ../ar-model-viewer/<フォルダ> --title "名前" --points-csv 基準点.csv`
  - IFC には基準点の目印が無いので、**CSV（番号,X,Y,Z。1 行目は見出し）で何点でも渡す**。
    2 点だけなら `"--points=X,Y,Z;X,Y,Z"` でもよい（座標が負なら `--points=` の形で）。
    平面図は全体図＋延長 110 m ごとの拡大図（点の番号つき）
    Z は**現地で十字を当てる面（路面など）の標高**にする。埋設物の天端を書くとその深さぶん浮く
  - 平面直角座標のままだと float32 で 1 cm 近く丸まるので、`config.json` の `origin` を引いて
    `model.glb` に入れる（`common/align.js` が足し戻す。`origin` が無いフォルダは今まで通り）
  - 軽くする：頂点をまとめて書き（31 MB → 9.7 MB）、最後に ict_ar-viewer の `tools/compress.mjs` で
    16bit 量子化＋meshopt に詰める（→ 1.25 MB。電線共同溝 延長 370 m の例）。`DAM\ifcviewer\viewer2_src` と同じ処理。
    **初回だけ ict_ar-viewer の直下で `npm install`**（Node.js が要る。無ければ詰めずに 9.7 MB のまま出る）。
    座標の刻みは「モデルの箱の長い辺 / 65535」（300 m で 4.6 mm）。詰めないときは `--no-compress`

### 点群を重ねる（config.json の pointcloud）

- `python ../ict_ar-viewer/tools/las_to_points.py <点群.las> --out ../ar-model-viewer/<フォルダ> --crop=xmin,ymin,xmax,ymax --voxel 0.2`
  - 範囲で切り、格子ごとに 1 点残して `pointcloud.glb`（点・色つき）にし、config.json に `pointcloud` を書く。
    座標は config.json の `origin` を引く（**先に ifc_to_site.py / dxf_to_site.py でフォルダを作っておく**）
  - 目安：熊木川橋 8,263 万点 → 橋の周り 193×173 m・20 cm 格子で 141 万点・10.7 MB（10 cm 格子だと 507 万点・81 MB で重すぎる）
- AR の中：モデルと一緒に点群が出る。「点群：小/大/なし」で切り替え
- 十字の下に「**点群まで ◯ cm**」（十字＝現実の地面から、いちばん近い点群の点まで）。20 cm を超えると赤＝合わせ直す目安
- 「**点群の点を拾う**」→ 画面で点群の目印をタップ → その点が基準点 Q1, Q2 … になる（向ける点に選ばれる）。
  十字を現実の同じ場所へ当てて「→ 向ける」か「＋ 足す」。拾った点はその回だけ（閉じると消える）

### 暗号化して置く

暗号化する現場は **ict_ar-viewer** に置く（手順もあちらの README）。

## 現場の位置に合わせる・旧版（site.html）

現地の 2 点を登録して、モデルを現場の座標どおりに出すページ。
Android の Chrome（ARCore 対応機）専用。

- 開き方：`https://<アカウント>.github.io/ict_ar-model-viewer/site.html`
  （設定を変えるときは `site.html?cfg=sites/<設定>.json`）
- 流れ：地面を映す → 1 点目に十字を合わせて「登録」→ 2 点目も「登録」→ モデルが出る
- 画面に「2 点の距離（現地／図面）」が出る。差が大きければ点の取り違え
- 合わせたあとは、十字の位置の現場座標が出る（ボックスの角などで確かめる）

設定（`sites/*.json`）にはモデルと基準点を書く。モデルは**原点へ寄せず、基準点と同じ座標で**作る。

| 項目 | 意味 |
|---|---|
| `model` | GLB（設定ファイルからの相対パス） |
| `points` | 基準点。先頭の 2 点を使う。`x`=東 `y`=北 `z`=標高（m） |
| `plan` | （任意）平面図の画像 |

試験用の一式（2 点が 5 m・ボックス延長 10 m）は `python ../ict_ar-viewer/tools/make_site_test.py` で作り直せる。

## 3. 手元で確かめる

`index.html` をダブルクリックで開くと `models.json` を読めません（ブラウザの制限）。
簡易サーバーを立てて開きます。

```bash
python -m http.server 8000
```

→ `http://localhost:8000/` を開く。PC では 3D 表示と QR まで確かめられます
（AR はスマホで GitHub Pages の URL を開いて確かめる）。

## 重いとき

- スマホで待てるのは **10〜15 MB くらいまで** が目安（GitHub の上限は 1 ファイル 100 MB）
- Node.js があれば gltf-transform で小さくできる（形を間引く・Draco 圧縮）

  ```bash
  npx @gltf-transform/cli optimize models/in.glb models/out.glb --compress draco
  ```

- IFC の鉄筋のような細かい部材は三角形が多い。必要な部材だけに絞る

## うまくいかないとき

| 症状 | 見るところ |
|---|---|
| 「AR で置く」ボタンが出ない | PC か、AR 非対応の端末。Android は ARCore 対応機種か、iPhone は Safari で開いているか |
| AR で何も出ない・遠くにある | 原点から離れている / 単位が mm。`ifc_to_glb.py` を通すと直る |
| 真っ黒・色が無い | GLB に法線や材質が無い。Blender で開いて書き出し直す |
| 公開 URL が 404 | Settings → Pages の設定、`index.html` がリポジトリ直下にあるか |
| 変更が反映されない | Actions タブで Pages のデプロイが終わったか。スマホの再読み込み |

表示には [Google model-viewer](https://modelviewer.dev/)（Apache-2.0）を CDN から読み込んでいます。
