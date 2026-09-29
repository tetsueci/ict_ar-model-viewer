# 3D モデル AR ビューア（Google model-viewer + GitHub Pages）

スマートフォンのブラウザで 3D モデルを表示し、「AR で置く」ボタンで現実の床に置けるページです。
アプリのインストールは要りません。

| 端末 | AR の仕組み | 備考 |
|---|---|---|
| Android（Chrome） | Scene Viewer / WebXR | ARCore 対応機種 |
| iPhone / iPad（Safari） | Quick Look | USDZ は GLB から自動で作られる（`usdz` を書けばそれを使う） |
| PC | AR なし（3D 表示のみ） | 右下の QR をスマホで読むと同じモデルが開く |

AR は **HTTPS でないと動きません**。GitHub Pages は HTTPS なのでそのまま使えます。

## 中身

```
index.html        表示ページ（モデルの一覧・AR ボタン・PC 用の QR）
models.json       表示するモデルの一覧 ← モデルを足すときはここに 1 行
models/           GLB を置く
tools/
  ifc_to_glb.py   IFC → GLB（実寸・メートル・床に置ける向き）
  make_sample.py  サンプル（ボックスカルバート）を作る
  glb.py          GLB 書き出しの共通部分
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
python tools/ifc_to_glb.py 入力.ifc models/kumakigawa.glb
```

- IfcOpenShell が要る（`pip install ifcopenshell numpy`）
- 実寸・メートルで出す。平面直角座標のままだと形が崩れるので、**水平は中心・高さは底を 0** に寄せる
- 大きい構造物（橋など）を机の上で見たいときは縮尺をかける

  ```bash
  python tools/ifc_to_glb.py 入力.ifc models/bridge_1-100.glb --scale 0.01
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
