"""最小限の GLB 書き出し（numpy だけで動く）。

使い方:
    from glb import write_glb
    write_glb("out.glb", {(r, g, b, a): (verts, tris), ...})

- verts は (N,3) の float、tris は (M,3) の int。座標は glTF の決まり（Y が上・メートル）。
- 色ごとに 1 つのプリミティブにまとめる。面ごとに頂点を分けて平らな法線を付ける
  （法線が無いと Scene Viewer / Quick Look で暗く見えることがあるため）。
"""
import json
import struct

import numpy as np


def zup_to_yup(v):
    """CAD / IFC の Z 上向き → glTF の Y 上向き。(x, y, z) → (x, z, -y)"""
    v = np.asarray(v, dtype=np.float64)
    return np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)


def recenter(groups):
    """全体の外接箱で、水平は中心・高さは底を 0 にそろえる（AR で床に置くため）。

    平面直角座標のような大きな座標のまま渡すと float32 で形が崩れるので必ず通す。
    """
    allv = np.concatenate([v for v, _ in groups.values() if len(v)])
    lo, hi = allv.min(axis=0), allv.max(axis=0)
    off = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    out = {k: (v - off, t) for k, (v, t) in groups.items()}
    return out, hi - lo


def write_glb(path, groups, name="model"):
    bin_parts, views, accessors, materials, prims = [], [], [], [], []
    offset = 0

    def add_view(data, target=34962):
        nonlocal offset
        raw = data.tobytes()
        pad = (-len(raw)) % 4
        bin_parts.append(raw + b"\x00" * pad)
        views.append({"buffer": 0, "byteOffset": offset,
                      "byteLength": len(raw), "target": target})
        offset += len(raw) + pad
        return len(views) - 1

    for color, (verts, tris) in groups.items():
        verts = np.asarray(verts, dtype=np.float64)
        tris = np.asarray(tris, dtype=np.int64).reshape(-1, 3)
        if len(tris) == 0:
            continue
        p = verts[tris]                                   # (M,3,3)
        n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
        ln = np.linalg.norm(n, axis=1, keepdims=True)
        keep = ln[:, 0] > 1e-12                          # つぶれた三角形は捨てる
        p, n, ln = p[keep], n[keep], ln[keep]
        if len(p) == 0:
            continue
        n = np.repeat(n / ln, 3, axis=0).astype(np.float32)
        pos = p.reshape(-1, 3).astype(np.float32)

        vp = add_view(pos)
        accessors.append({"bufferView": vp, "componentType": 5126,
                          "count": len(pos), "type": "VEC3",
                          "min": pos.min(axis=0).tolist(),
                          "max": pos.max(axis=0).tolist()})
        ip = len(accessors) - 1
        vn = add_view(n)
        accessors.append({"bufferView": vn, "componentType": 5126,
                          "count": len(n), "type": "VEC3"})
        inn = len(accessors) - 1

        r, g, b, a = [float(c) for c in color]
        mat = {"pbrMetallicRoughness": {"baseColorFactor": [r, g, b, a],
                                        "metallicFactor": 0.0,
                                        "roughnessFactor": 0.8},
               "doubleSided": True}
        if a < 0.999:
            mat["alphaMode"] = "BLEND"
        materials.append(mat)
        prims.append({"attributes": {"POSITION": ip, "NORMAL": inn},
                      "material": len(materials) - 1})

    if not prims:
        raise ValueError("書き出す三角形がありません")

    gltf = {
        "asset": {"version": "2.0", "generator": "ar-model-viewer/tools/glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": name}],
        "meshes": [{"primitives": prims, "name": name}],
        "materials": materials,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": offset}],
    }
    js = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    js += b" " * ((-len(js)) % 4)
    bn = b"".join(bin_parts)
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(bn), 0x004E4942))
        f.write(bn)
    return total
