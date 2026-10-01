"""IFC → 現場合わせの一式（model.glb・config.json・plan.png）。dxf_to_site.py の IFC 版。

    python tools/ifc_to_site.py <model.ifc> --out <フォルダ> --title 名前 "--points=X,Y,Z;X,Y,Z"

  （座標が負のときは --points= の形で渡す。空白で区切ると - を見出しと取り違える）

- 形と色は IfcOpenShell のまま（世界座標・m）。Z 上向きを glTF の Y 上向きへ回す
- 頂点をまとめて書く（glb.weld）。管路のように細かいモデルが 1/3 ほどになる
- ★IFC には基準点の目印が無いので、基準点は --points で渡す（2 点。X=東 Y=北 Z=標高）
- 座標は平面直角座標のことが多い。float32 で丸まらないよう、origin（平面の中心を 1 m に丸めた値）を
  引いて model.glb に入れ、config.json に origin を書く（common/align.js が足し戻す）
"""
import argparse
import json
import math
import multiprocessing
import os
import shutil
import sys
import time

import ifcopenshell
import ifcopenshell.geom
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from glb import write_glb, zup_to_yup  # noqa: E402
from ifc_to_glb import DEFAULT_SKIP, FALLBACK, rgba_of  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def read_ifc(src, skip):
    """色 → [(頂点, 三角形)]、部材の種類（名前の $ より前）→ [三角形の頂点 (M,3,3)]"""
    f = ifcopenshell.open(src)
    s = ifcopenshell.geom.settings()
    s.set("use-world-coords", True)
    s.set("apply-default-materials", True)
    excl = [x.strip() for x in skip.split(",") if x.strip()]
    it = ifcopenshell.geom.iterator(s, f, multiprocessing.cpu_count(), exclude=excl or None)
    if not it.initialize():
        raise SystemExit("形状が 1 つも取れませんでした")
    buckets, kinds = {}, {}
    while True:
        sh = it.get()
        g = sh.geometry
        v = np.array(g.verts, dtype=np.float64).reshape(-1, 3)
        t = np.array(g.faces, dtype=np.int64).reshape(-1, 3)
        if len(t):
            mids = np.array(g.material_ids, dtype=np.int64) if len(g.material_ids) else np.full(len(t), -1)
            mats = list(g.materials)
            for mid in np.unique(mids):
                col = rgba_of(mats[mid]) if 0 <= mid < len(mats) else FALLBACK
                buckets.setdefault(col, []).append((v, t[mids == mid]))
            name = (f.by_id(sh.id).Name or f.by_id(sh.id).is_a()).split("$")[0]
            kinds.setdefault(name, []).append(v[t])
        if not it.next():
            break
    return buckets, {k: np.concatenate(x) for k, x in kinds.items()}


def write_plan(kinds, points, path, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    plt.rcParams["font.family"] = ["Yu Gothic", "Meiryo", "MS Gothic", "sans-serif"]
    fig, axs = plt.subplots(1, 2, figsize=(12, 7), dpi=110, gridspec_kw={"width_ratios": [1.6, 1]})
    pal = ["#868e96", "#d9480f", "#1971c2", "#2f9e44", "#ae3ec9"]
    names = {"DUCT": "管路", "CCBOX": "特殊部"}
    cols = ["#1a6fd6", "#e8590c"]
    allp = np.concatenate([p.reshape(-1, 3) for p in kinds.values()])
    d = math.hypot(points[1]["x"] - points[0]["x"], points[1]["y"] - points[0]["y"])
    mx = (points[0]["x"] + points[1]["x"]) / 2
    my = (points[0]["y"] + points[1]["y"]) / 2
    r = max(d, 6) * 1.2
    for k, ax in enumerate(axs):
        for i, (kind, tri) in enumerate(sorted(kinds.items())):
            ax.add_collection(PolyCollection(tri[:, :, :2], facecolors=pal[i % len(pal)], edgecolors="none",
                                             label=names.get(kind, kind)))
        for j, p in enumerate(points):
            ax.plot(p["x"], p["y"], "o", ms=9, mfc="white", mec=cols[j], mew=2.5, zorder=5)
            ax.annotate(p["name"], (p["x"], p["y"]), xytext=(8, 8), textcoords="offset points",
                        color=cols[j], fontsize=13, fontweight="bold", zorder=6)
        ax.set_aspect("equal")
        if k == 0:
            ax.set_xlim(allp[:, 0].min() - 5, allp[:, 0].max() + 5)
            ax.set_ylim(allp[:, 1].min() - 5, allp[:, 1].max() + 5)
            ax.grid(True, color="#dddddd", lw=0.5)
            ax.set_xlabel("X（東）m")
            ax.set_ylabel("Y（北）m")
            ax.legend(loc="best", fontsize=10)
            ax.set_title(f"{title}\nP1–P2 {d:.2f} m（点の高さ {points[0]['z']:.2f} / {points[1]['z']:.2f}）", fontsize=12)
        else:
            ax.plot([points[0]["x"], points[1]["x"]], [points[0]["y"], points[1]["y"]], "-", color="#333333", lw=1)
            ax.set_xlim(mx - r, mx + r)
            ax.set_ylim(my - r, my + r)
            ax.set_xticks([])
            ax.set_yticks([])
            ax.set_title("基準点のまわり\n" + "\n".join(
                f"{p['name']}  X {p['x']:.3f}  Y {p['y']:.3f}  Z {p['z']:.3f}" for p in points), fontsize=9.5)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ifc")
    ap.add_argument("--out", required=True, help="出力フォルダ（例 ebetsu）")
    ap.add_argument("--title", default="IFC モデル")
    ap.add_argument("--points", required=True, help='基準点 "X,Y,Z;X,Y,Z"（m）')
    ap.add_argument("--points-note", default="", help="点の説明（; 区切り。config.json の note に入る）")
    ap.add_argument("--skip", default=DEFAULT_SKIP)
    a = ap.parse_args()
    out = a.out if os.path.isabs(a.out) else os.path.join(ROOT, a.out)

    notes = a.points_note.split(";") if a.points_note else []
    pts = []
    for k, s in enumerate(a.points.split(";")):
        x, y, z = (float(c) for c in s.split(","))
        pts.append({"name": f"P{k + 1}", "x": x, "y": y, "z": z, "note": notes[k] if k < len(notes) else "指定した点"})
    if len(pts) < 2:
        raise SystemExit("基準点は 2 点要ります")

    buckets, kinds = read_ifc(a.ifc, a.skip)
    allv = np.concatenate([v for parts in buckets.values() for v, _ in parts])
    lo, hi = allv.min(axis=0), allv.max(axis=0)
    org = np.array([round((lo[0] + hi[0]) / 2), round((lo[1] + hi[1]) / 2), 0.0])

    groups = {}
    for col, parts in buckets.items():
        vs, ts, base = [], [], 0
        for v, t in parts:
            vs.append(v - org)
            ts.append(t + base)
            base += len(v)
        groups[col] = (zup_to_yup(np.concatenate(vs)), np.concatenate(ts))

    os.makedirs(out, exist_ok=True)
    page = os.path.join(out, "index.html")
    if not os.path.exists(page):              # 新しいフォルダには入口のひな形を写す（中身は ../common/）
        shutil.copyfile(os.path.join(ROOT, "common", "page.html"), page)
    n = write_glb(os.path.join(out, "model.glb"), groups, name="model", smooth=True)
    cfg = {
        "title": a.title,
        "version": time.strftime("%Y%m%d%H%M%S"),
        "model": "model.glb",
        "plan": "plan.png",
        "coords": "図面の座標（X=東・Y=北・Z=標高、m）",
        "origin": {"x": float(org[0]), "y": float(org[1]), "z": float(org[2])},
        "points": pts[:2],
    }
    with open(os.path.join(out, "config.json"), "w", encoding="utf-8", newline="\n") as fo:
        json.dump(cfg, fo, ensure_ascii=False, indent=2)
        fo.write("\n")
    write_plan(kinds, pts[:2], os.path.join(out, "plan.png"), a.title)

    print(f"model.glb {n / 1e6:.2f} MB")
    for kind, tri in sorted(kinds.items()):
        print(f"  {kind:8s} 三角形 {len(tri):7d}")
    print(f"  範囲 X {lo[0]:.2f}〜{hi[0]:.2f}  Y {lo[1]:.2f}〜{hi[1]:.2f}  Z {lo[2]:.2f}〜{hi[2]:.2f}")
    print(f"  origin X {org[0]:.0f}  Y {org[1]:.0f}")
    for p in pts:
        print(f"  {p['name']}  X {p['x']:.3f}  Y {p['y']:.3f}  Z {p['z']:.3f}")
    if n > 15e6:
        print("  ★15MB を超えています。スマホで開くのに時間がかかります（README「重いとき」）")


if __name__ == "__main__":
    main()
