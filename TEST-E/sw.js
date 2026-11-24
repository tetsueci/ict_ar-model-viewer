// 電波が無くても開けるようにする（本体は ict_ar-viewer の common/sw-core.js。config.json の "offline": true のときページが登録する）
// ★ar-model-viewer には common/ が無いので、同じサイト（tetsueci.github.io）の ict_ar-viewer から読む
importScripts('https://tetsueci.github.io/ict_ar-viewer/common/sw-core.js');
