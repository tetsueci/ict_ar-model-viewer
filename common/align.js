// 現場 AR 位置合わせ：ページの中身と動き（全フォルダ共通）。
// 各フォルダの index.html はこれを読むだけ。フォルダには config.json・model.glb・plan.png を置く。
// ★ここを直すと、すべてのフォルダのページに効く。
//
// three.js は jsDelivr の +esm で読む（import map が要らないので、各フォルダの index.html を短くできる）。
// GLTFLoader の +esm は three を同じ URL で読むので、THREE は 1 つにそろう
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';
// meshopt で詰めた GLB（tools/compress.mjs）を戻す。詰めていない GLB はそのまま読める
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/meshopt_decoder.module.js/+esm';

// ---------- 画面の部品 ----------
document.body.insertAdjacentHTML('afterbegin', `
<div class="page">
  <h1 id="title">現場 AR 位置合わせ</h1>
  <div class="muted" id="coords"></div>

  <div class="card">
    <h2>使い方</h2>
    <ol>
      <li>「AR を始める」→ 地面を映してスマホをゆっくり動かす（十字が地面に張り付くまで）</li>
      <li><b>位置合わせモード</b>で始まる（橙の表示）。◀ ▶ で<b>固定する点</b>（青）と<b>向ける点</b>（橙）を選ぶ</li>
      <li>十字を<b>固定する点の印</b>に合わせて「◎ ここへ」</li>
      <li>十字を<b>向ける点の印</b>に合わせて「→ 向ける」。固定した点を中心にモデルが回る</li>
      <li>基準点が 3 点以上あるときは、向ける点を替えて十字を当て「＋ 足す」。
        <b>記録した全部の点で</b>いちばん合う位置に置き直し、点ごとのずれが出る。「近い点」で十字に近い点を選べる</li>
      <li>画面を指でなぞる・ひねると、固定した点を中心に回る（微調整は ⟲ ⟳ ボタン）。
        拡大を「あり」にすると、2 本指で広げる・つまむ、または「→ 向ける」「＋ 足す」で大きさも合わせる</li>
      <li>合ったら「固定する」（緑の表示）。固定中は画面に触ってもモデルは動かない。直すときは「位置合わせ」</li>
    </ol>
  </div>

  <div class="card">
    <h2>基準点</h2>
    <table id="points"><thead><tr><th>点</th><th>X</th><th>Y</th><th>標高</th><th>目印</th></tr></thead><tbody></tbody></table>
  </div>

  <div class="card" id="plancard">
    <h2>平面図</h2>
    <img class="plan" id="plan" alt="基準点とモデルの位置関係の平面図">
  </div>

  <button class="start" id="start" disabled>AR を始める</button>
  <div id="support"></div>
  <p class="muted">Android の Chrome（ARCore 対応機）と iPhone で動きます。</p>
</div>

<div id="overlay">
  <div id="gest"></div>
  <div class="top">
    <div id="step"></div>
    <div id="info"></div>
    <div id="check"></div>
    <div id="live"></div>
  </div>
  <div class="panel">
    <!-- 位置合わせモード -->
    <div class="row adjonly">
      <button id="pp">◀</button><button id="pivBtn" class="blue">固定 P1</button><button id="pn">▶</button>
      <button id="tp">◀</button><button id="tgtBtn" class="orange">向ける P2</button><button id="tn">▶</button>
    </div>
    <div class="row adjonly">
      <button id="here" disabled>◎ P1 をここへ</button>
      <button id="aim" disabled>→ P2 へ向ける</button>
      <button id="add" disabled>＋ P2 を足す</button>
    </div>
    <div class="row adjonly">
      <button id="near" disabled>近い点</button>
      <button id="clr" disabled>記録を消す</button>
      <button id="scaleTgl">拡大：なし</button>
    </div>
    <div class="row adjonly">
      <button id="rl">⟲ 0.5°</button>
      <button id="rr">⟳ 0.5°</button>
      <button id="rl2">⟲ 0.1°</button>
      <button id="rr2">⟳ 0.1°</button>
      <button id="up">▲ 5cm</button>
      <button id="dn">▼ 5cm</button>
    </div>
    <div class="row scaleonly">
      <button id="sm">縮小 1%</button>
      <button id="sp">拡大 1%</button>
      <button id="sm2">縮小 0.1%</button>
      <button id="sp2">拡大 0.1%</button>
      <button id="s1">実寸に戻す</button>
    </div>
    <div class="row adjonly">
      <button id="lock" class="big green" disabled>固定する</button>
      <button id="exit1">終わる</button>
    </div>
    <!-- 固定中 -->
    <div class="row lockonly">
      <button id="adjust" class="big orange">位置合わせ</button>
      <button id="toggle">半透明</button>
      <button id="exit2">終わる</button>
    </div>
  </div>
</div>

`);


const $ = id => document.getElementById(id);
const DEG = Math.PI / 180;
const cfg = await (await fetch('config.json', { cache: 'no-cache' })).json();
const PT = cfg.points;                        // 基準点（2 点以上。全部使う）

// ---------- 準備画面 ----------
$('title').textContent = cfg.title || '現場 AR 位置合わせ';
$('coords').textContent = cfg.coords || '';
document.title = `${cfg.title} | 現場 AR`;
// 版を付けて読む：同じ名前だとスマホが前の画像・モデルを使い続ける
const ver = u => u + (u.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(cfg.version || Date.now());
if (cfg.plan) $('plan').src = ver(cfg.plan); else $('plancard').remove();
const f3 = v => Number(v).toFixed(3);
$('points').querySelector('tbody').innerHTML = cfg.points.map(p =>
  `<tr><td>${p.name}</td><td>${f3(p.x)}</td><td>${f3(p.y)}</td><td>${f3(p.z)}</td><td>${p.note || ''}</td></tr>`).join('');

// 現場座標（X=東, Y=北, Z=標高）⇔ glTF（x, y=上, z=南）
// origin（任意）：model.glb は現場座標から origin を引いた値で入っている。
// 平面直角座標（10 万 m）のままだと float32 で 1 cm 近く丸まるため
const O = { x: 0, y: 0, z: 0, ...(cfg.origin || {}) };
const siteToGl = p => new THREE.Vector3(p.x - O.x, p.z - O.z, -(p.y - O.y));
const glToSite = v => ({ x: v.x + O.x, y: -v.z + O.y, z: v.y + O.z });
const P = PT.map(siteToGl);                   // モデル側の点

// ---------- three.js ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.domElement.style.display = 'none';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 300);
scene.add(new THREE.HemisphereLight(0xffffff, 0x777766, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(3, 8, 2); scene.add(sun);

// 十字
const reticle = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const parts = [
    new THREE.Mesh(new THREE.RingGeometry(0.09, 0.11, 40).rotateX(-Math.PI / 2), m),
    new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.012).rotateX(-Math.PI / 2), m),
    new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.30).rotateX(-Math.PI / 2), m),
    new THREE.Mesh(new THREE.CircleGeometry(0.012, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false })),
  ];
  parts.forEach(o => { o.renderOrder = 10; reticle.add(o); });
}
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

// モデル（現場座標のまま）
const group = new THREE.Group();
group.matrixAutoUpdate = false;
group.visible = false;
scene.add(group);
let modelRoot = null;
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(ver(cfg.model), g => { modelRoot = g.scene; group.add(modelRoot); },
  undefined, () => { $('support').textContent = 'モデルを読めませんでした（' + cfg.model + '）'; });

// 固定している点の目印（黄色の輪。モデルの中に置く）
const pivMark = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.40, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffd43b, side: THREE.DoubleSide, depthTest: false }));
pivMark.renderOrder = 6;
group.add(pivMark);
const tgtMark = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.32, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff8a3d, side: THREE.DoubleSide, depthTest: false }));
tgtMark.renderOrder = 6;
group.add(tgtMark);

// すべての基準点に旗（高さ 1.5 m の竿＋玉、足もとの輪と中心の点）と名前の札。
// 竿は遠くから見つけるため、輪は足もとで十字を合わせるため（make_site_test.py の試験と同じ形）。
// 色：固定点＝青、向ける点＝橙、ほか＝白（paintFlags で塗り替える）
const FLAG_H = 1.5;
const FLAG_COL = { pivot: 0x1a6fd6, target: 0xf08c00, other: 0xf1f3f5 };
const ptMarks = new THREE.Group();
group.add(ptMarks);
const flagMats = [];
{
  const poleG = new THREE.CylinderGeometry(0.02, 0.02, FLAG_H, 12).translate(0, FLAG_H / 2, 0);
  const ballG = new THREE.SphereGeometry(0.08, 20, 14).translate(0, FLAG_H, 0);
  const ringG = new THREE.RingGeometry(0.10, 0.15, 40).rotateX(-Math.PI / 2).translate(0, 0.004, 0);
  const dotG = new THREE.CircleGeometry(0.02, 16).rotateX(-Math.PI / 2).translate(0, 0.005, 0);
  PT.forEach((pt, i) => {
    const solid = new THREE.MeshStandardMaterial({ color: FLAG_COL.other, emissive: FLAG_COL.other, emissiveIntensity: 0.35 });
    const flat = new THREE.MeshBasicMaterial({ color: FLAG_COL.other, side: THREE.DoubleSide, depthTest: false });
    flagMats.push([solid, flat]);
    const f = new THREE.Group();
    f.position.copy(P[i]);
    const ring = new THREE.Mesh(ringG, flat), dot = new THREE.Mesh(dotG, flat);
    ring.renderOrder = dot.renderOrder = 5;
    f.add(new THREE.Mesh(poleG, solid), new THREE.Mesh(ballG, solid), ring, dot);
    ptMarks.add(f);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(15,18,22,.8)'; c.beginPath(); c.roundRect(4, 4, 248, 88, 20); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 60px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(pt.name, 128, 50);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
    sp.scale.set(0.6, 0.225, 1);
    sp.position.copy(P[i]); sp.position.y += FLAG_H + 0.3; sp.renderOrder = 7;
    ptMarks.add(sp);
  });
}
function paintFlags() {
  flagMats.forEach(([solid, flat], i) => {
    const c = i === pivot ? FLAG_COL.pivot : i === target ? FLAG_COL.target : FLAG_COL.other;
    solid.color.setHex(c); solid.emissive.setHex(c); flat.color.setHex(c);
  });
}

// ---------- 置き方の値 ----------
// モデルの点 x は  w + R(θ)·s·(x − P[pivot])  に置く（固定点が w に来る）
let placed = false, w = new THREE.Vector3(), theta = 0, s = 1, pivot = 0, target = 1;
const obs = new Map();                          // 記録した点：番号 → 十字を当てた位置（AR の座標）
let aligning = true, allowScale = false, translucent = false;

function matrixOf() {
  const p = P[pivot];
  return new THREE.Matrix4().makeTranslation(w.x, w.y, w.z)
    .multiply(new THREE.Matrix4().makeRotationY(theta))
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
}
function apply() {
  if (placed) { group.matrix.copy(matrixOf()); group.matrixWorldNeedsUpdate = true; }
  group.visible = placed;
  pivMark.position.copy(P[pivot]); pivMark.position.y += 0.006;
  pivMark.visible = aligning;
  tgtMark.position.copy(P[target]); tgtMark.position.y += 0.006;
  tgtMark.visible = aligning;
  paintFlags();
  showUI();
}
// 固定中に（アンカーで）動いた行列から値を読み直す
function syncFromMatrix() {
  const e = group.matrix.elements;
  s = Math.hypot(e[0], e[1], e[2]);
  theta = Math.atan2(-e[2], e[0]);
  w = P[pivot].clone().applyMatrix4(group.matrix);
}
function setPivot(i) {
  if (placed) w = P[i].clone().applyMatrix4(group.matrix);   // 見た目を変えずに固定点だけ替える
  pivot = i;
  if (target === pivot) target = (pivot + 1) % PT.length;
  apply();
}
const step = (i, d, skip) => { do { i = (i + d + PT.length) % PT.length; } while (i === skip); return i; };
function setTarget(i) { target = i; apply(); }

// ---------- 操作 ----------
let lastHit = null;
function placeHere() {                          // 固定点を十字の位置へ（記録はここから取り直す）
  if (!lastHit) return;
  w = lastHit.clone();
  placed = true;
  obs.clear(); obs.set(pivot, lastHit.clone());
  $('check').className = '';
  $('check').textContent = '';
  apply();
}
function aimOther() {                           // 向ける点を十字の方向へ（拡大ありなら距離も）
  if (!lastHit || !placed) return;
  const o = target;
  obs.set(o, lastHit.clone());
  const d = P[o].clone().sub(P[pivot]);
  const q = lastHit.clone().sub(w);
  theta = Math.atan2(d.z, d.x) - Math.atan2(q.z, q.x);
  const dh = Math.hypot(d.x, d.z), qh = Math.hypot(q.x, q.z);
  if (allowScale) s = qh / dh;
  const diff = (qh - dh * s) * 100;
  const bad = Math.abs(qh - dh) > 0.2;
  $('check').className = bad ? 'bad' : '';
  $('check').textContent = `${PT[pivot].name}–${PT[o].name} の距離　現地 ${qh.toFixed(2)} m ／ 図面 ${dh.toFixed(2)} m`
    + (allowScale ? `（大きさを ${(s * 100).toFixed(1)}% に合わせた）` : `（差 ${diff >= 0 ? '+' : ''}${diff.toFixed(0)} cm）`)
    + (bad && !allowScale ? '　★差が大きい。点の取り違えか、十字の当て違い' : '');
  apply();
}
// 記録した全部の点で合わせる（水平は回転＋移動〔＋拡大〕の最小二乗、高さは平均）
function fitAll() {
  const ids = [...obs.keys()];
  if (ids.length < 2) return;
  const m = ids.map(i => P[i]), q = ids.map(i => obs.get(i));
  const avg = (a, k) => a.reduce((t, v) => t + v[k], 0) / a.length;
  const mc = { x: avg(m, 'x'), z: avg(m, 'z') }, qc = { x: avg(q, 'x'), z: avg(q, 'z') };
  let re = 0, im = 0, mm = 0;
  m.forEach((v, k) => {
    const ax = v.x - mc.x, az = v.z - mc.z, bx = q[k].x - qc.x, bz = q[k].z - qc.z;
    re += ax * bx + az * bz; im += az * bx - ax * bz; mm += ax * ax + az * az;
  });
  theta = Math.atan2(im, re);                   // makeRotationY(θ) で m を q の向きへ
  if (allowScale && mm > 1e-9) s = Math.hypot(re, im) / mm;
  const R = new THREE.Matrix4().makeRotationY(theta);
  const rc = new THREE.Vector3(mc.x, 0, mc.z).applyMatrix4(R).multiplyScalar(s);
  const ty = q.reduce((t, v, k) => t + v.y - s * m[k].y, 0) / q.length;
  const t = new THREE.Vector3(qc.x - rc.x, ty, qc.z - rc.z);
  w = P[pivot].clone().applyMatrix4(R).multiplyScalar(s).add(t);   // 固定点の行き先
  placed = true;
  apply();
  report();
}
// 記録した点ごとのずれ（モデルの点 − 十字を当てた位置）
function report() {
  const M = matrixOf();
  const rows = [...obs.entries()].map(([i, h]) => {
    const v = P[i].clone().applyMatrix4(M);
    return { i, dh: Math.hypot(v.x - h.x, v.z - h.z), dz: v.y - h.y };
  });
  const rms = Math.sqrt(rows.reduce((t, r) => t + r.dh * r.dh, 0) / rows.length);
  const worst = rows.reduce((a, b) => (b.dh > a.dh ? b : a));
  const bad = worst.dh > 0.2;
  $('check').className = bad ? 'bad' : '';
  $('check').innerHTML = `記録 ${rows.length} 点で合わせた　水平のずれ 平均 ${(rms * 100).toFixed(0)} cm・最大 ${PT[worst.i].name} ${(worst.dh * 100).toFixed(0)} cm`
    + (allowScale ? `（大きさ ${(s * 100).toFixed(1)}%）` : '')
    + '<br>' + rows.map(r => `${PT[r.i].name} ${(r.dh * 100).toFixed(0)}/${r.dz >= 0 ? '+' : ''}${(r.dz * 100).toFixed(0)}`).join('　')
    + '（水平/高さ cm）' + (bad ? '<br>★ずれの大きい点は取り違えか当て違い。「記録を消す」でやり直せる' : '');
}
function addPoint() {
  if (!lastHit || !placed) return;
  obs.set(target, lastHit.clone());
  if (obs.size >= 2) fitAll();
}
// 十字にいちばん近い基準点（モデルの上で水平距離）
function nearest(skip) {
  if (!placed || !lastHit) return null;
  const c = lastHit.clone().applyMatrix4(new THREE.Matrix4().copy(group.matrix).invert());
  let best = null;
  P.forEach((p, i) => {
    if (i === skip) return;
    const d = Math.hypot(p.x - c.x, p.z - c.z) * s;
    if (!best || d < best.d) best = { i, d };
  });
  return best;
}
const rotate = deg => { theta += deg * DEG; apply(); };
const lift = m => { w.y += m; apply(); };
const scaleBy = k => { if (allowScale) { s *= k; apply(); } };

let anchor = null, anchorWant = false, anchorOffset = null;
function lock() {
  if (!placed) return;
  aligning = false;
  anchorWant = true;                            // 次のフレームでアンカーを作る
  apply();
}
function unlock() {
  if (anchor) { syncFromMatrix(); try { anchor.delete(); } catch (e) {} }
  anchor = null; anchorOffset = null; anchorWant = false;
  aligning = true;
  apply();
}

function showUI() {
  const ov = $('overlay');
  ov.classList.toggle('aligning', aligning);
  ov.classList.toggle('scaling', allowScale);
  const a = PT[pivot].name, b = PT[target].name;
  $('pivBtn').textContent = `固定 ${a}`;
  $('tgtBtn').textContent = `向ける ${b}`;
  $('here').textContent = `◎ ${a} をここへ`;
  $('aim').textContent = `→ ${b} へ向ける`;
  $('add').textContent = `＋ ${b} を足す`;
  $('here').disabled = !lastHit;
  $('aim').disabled = !lastHit || !placed;
  $('add').disabled = !lastHit || !placed || PT.length < 3;
  $('near').disabled = !lastHit || !placed;
  $('clr').disabled = obs.size === 0;
  $('lock').disabled = !placed;
  $('scaleTgl').textContent = allowScale ? '拡大：あり' : '拡大：なし';

  let st;
  if (!aligning) st = '<span class="mode lock">固定中</span><b>画面に触ってもモデルは動きません</b><br>十字を当てた場所の座標が出ます。直すときは「位置合わせ」';
  else if (!lastHit) st = '<span class="mode adj">位置合わせ</span><b>地面を探しています…</b><br>スマホをゆっくり左右に動かしてください';
  else if (!placed) st = `<span class="mode adj">位置合わせ</span><b>十字を ${a} の印に合わせて「◎ ${a} をここへ」</b>`;
  else if (obs.size < 2) st = `<span class="mode adj">位置合わせ</span><b>十字を ${b} の印に合わせて「→ ${b} へ向ける」</b><br>画面をなぞる・ひねると ${a} を中心に回る。合ったら「固定する」`;
  else st = `<span class="mode adj">位置合わせ</span><b>記録 ${obs.size} 点。ほかの点も十字を当てて「＋ 足す」</b><br>十分に合ったら「固定する」`;
  $('step').innerHTML = st;
  $('info').textContent = placed
    ? `固定点 ${a}　向き ${(((theta / DEG) % 360 + 540) % 360 - 180).toFixed(1)}°　大きさ ${(s * 100).toFixed(1)}%${allowScale ? '' : '（実寸）'}`
    : '';
}

// ボタン
$('pp').onclick = () => setPivot(step(pivot, -1, -1));
$('pn').onclick = () => setPivot(step(pivot, 1, -1));
$('tp').onclick = () => setTarget(step(target, -1, pivot));
$('tn').onclick = () => setTarget(step(target, 1, pivot));
$('pivBtn').onclick = $('tgtBtn').onclick = () => { const o = pivot; setPivot(target); target = o; apply(); };   // 入れ替え
$('add').onclick = addPoint;
$('near').onclick = () => { const n = nearest(pivot); if (n) setTarget(n.i); };
$('clr').onclick = () => { obs.clear(); $('check').textContent = ''; apply(); };
$('scaleTgl').onclick = () => { allowScale = !allowScale; apply(); };
$('here').onclick = placeHere;
$('aim').onclick = aimOther;
$('rl').onclick = () => rotate(0.5);  $('rr').onclick = () => rotate(-0.5);
$('rl2').onclick = () => rotate(0.1); $('rr2').onclick = () => rotate(-0.1);
$('up').onclick = () => lift(0.05);   $('dn').onclick = () => lift(-0.05);
$('sp').onclick = () => scaleBy(1.01);   $('sm').onclick = () => scaleBy(1 / 1.01);
$('sp2').onclick = () => scaleBy(1.001); $('sm2').onclick = () => scaleBy(1 / 1.001);
$('s1').onclick = () => { s = 1; apply(); };
$('lock').onclick = lock;
$('adjust').onclick = unlock;
$('toggle').onclick = () => {
  translucent = !translucent;
  $('toggle').textContent = translucent ? '不透明' : '半透明';
  modelRoot?.traverse(o => {
    if (!o.isMesh) return;
    o.material.transparent = translucent; o.material.opacity = translucent ? 0.45 : 1;
    o.material.depthWrite = !translucent; o.material.needsUpdate = true;
  });
};
$('exit1').onclick = $('exit2').onclick = () => session?.end();

// 指の操作（位置合わせモードで、置いたあとだけ）：なぞる・ひねる＝固定点で回転、2 本指で広げる＝拡大
const touches = new Map();
let g0 = null;
function gstate() {
  const t = [...touches.values()];
  if (t.length >= 2) {
    const dx = t[1].x - t[0].x, dy = t[1].y - t[0].y;
    return { n: 2, ang: Math.atan2(dy, dx), dist: Math.hypot(dx, dy), theta, s };
  }
  return { n: 1, x: t[0].x, theta, s };
}
const gest = $('gest');
gest.addEventListener('pointerdown', e => { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); g0 = gstate(); });
gest.addEventListener('pointermove', e => {
  if (!touches.has(e.pointerId) || !placed || !aligning) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const g = gstate();
  if (g.n !== g0.n) { g0 = g; return; }
  if (g.n === 1) theta = g0.theta - (g.x - g0.x) * 0.15 * DEG;        // 右へなぞる＝右回り
  else {
    theta = g0.theta - (g.ang - g0.ang);
    if (allowScale) s = g0.s * g.dist / g0.dist;
  }
  apply();
});
const up = e => { touches.delete(e.pointerId); g0 = touches.size ? gstate() : null; };
gest.addEventListener('pointerup', up);
gest.addEventListener('pointercancel', up);

// ---------- 開始・終了 ----------
let session = null, hitSource = null, refSpace = null;
async function startAR() {
  const overlay = $('overlay');
  session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['local', 'dom-overlay', 'anchors'],
    domOverlay: { root: overlay },
  });
  overlay.classList.add('on');
  overlay.addEventListener('beforexrselect', e => e.preventDefault());
  renderer.domElement.style.display = 'block';
  await renderer.xr.setSession(session);
  refSpace = renderer.xr.getReferenceSpace();
  const viewer = await session.requestReferenceSpace('viewer');
  hitSource = await session.requestHitTestSource({ space: viewer });
  session.addEventListener('end', () => {
    hitSource = null; session = null; lastHit = null; reticle.visible = false;
    anchor = null; anchorOffset = null; anchorWant = false;
    placed = false; aligning = true; theta = 0; s = 1; obs.clear();
    overlay.classList.remove('on'); renderer.domElement.style.display = 'none';
    $('check').textContent = ''; $('live').textContent = '';
    apply();
  });
  apply();
}
$('start').onclick = () => startAR().catch(e => { $('support').textContent = 'AR を始められませんでした：' + e.message; });

// iPhone：Variant Launch の中で開き直すと WebXR が使える
function launchReady(d) {
  if (!d || !d.launchRequired) return false;
  $('start').textContent = 'AR を始める（iPhone：「開く」を押してください）';
  $('start').disabled = false;
  $('start').onclick = () => { location.href = d.launchUrl; };
  return true;
}
if (navigator.xr && await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) {
  $('start').disabled = false;
} else if (!launchReady(window.__vl)) {
  $('support').innerHTML = IS_IOS && VL_KEY
    ? '準備中です。少し待ってから再読み込みしてください。'
    : 'この端末・ブラウザでは AR を始められません（Android の Chrome・ARCore 対応機か、iPhone で開いてください）。';
  window.addEventListener('vlaunch-initialized', e => { if (launchReady(e.detail)) $('support').textContent = ''; });
}

// ---------- 毎フレーム ----------
const tmpM = new THREE.Matrix4();
renderer.setAnimationLoop((time, frame) => {
  if (frame && hitSource) {
    const hits = frame.getHitTestResults(hitSource);
    const had = !!lastHit;
    if (hits.length) {
      reticle.matrix.fromArray(hits[0].getPose(refSpace).transform.matrix);
      reticle.matrixWorldNeedsUpdate = true;
      reticle.visible = true;
      lastHit = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
    } else {
      reticle.visible = false;
      lastHit = null;
    }
    if (had !== !!lastHit) showUI();

    // 固定したらアンカーを作り、以後はアンカーの動きに合わせる（歩いたときのずれを減らす）
    if (anchorWant && frame.createAnchor) {
      anchorWant = false;
      const at = w.clone(), M = group.matrix.clone();
      frame.createAnchor(new XRRigidTransform({ x: at.x, y: at.y, z: at.z }), refSpace).then(a => {
        if (aligning) { try { a.delete(); } catch (e) {} return; }
        anchor = a;
        anchorOffset = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).invert().multiply(M);
      }).catch(() => {});
    }
    if (!aligning && anchor && anchorOffset && frame.trackedAnchors?.has(anchor)) {
      const ap = frame.getPose(anchor.anchorSpace, refSpace);
      if (ap) { group.matrix.multiplyMatrices(tmpM.fromArray(ap.transform.matrix), anchorOffset); group.matrixWorldNeedsUpdate = true; }
    }

    // 十字の位置を現場座標で
    if (placed && lastHit) {
      const c = glToSite(lastHit.clone().applyMatrix4(tmpM.copy(group.matrix).invert()));
      const n = nearest(-1);
      $('live').textContent = `十字の位置　X ${c.x.toFixed(2)}　Y ${c.y.toFixed(2)}　標高 ${c.z.toFixed(2)}`
        + (n && n.d < 5 ? `　近い点 ${PT[n.i].name} まで ${(n.d * 100).toFixed(0)} cm` : '');
    } else $('live').textContent = '';
  }
  renderer.render(scene, camera);
});
