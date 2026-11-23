#!/usr/bin/env node
/**
 * convert-images.mjs
 *
 * site/img/products/{SKU}/main.svg を MakeShop登録用の 800x800 PNG へ変換し、
 * makeshop/images/{SKU}.png として出力する。日付・乱数は使用しない決定論的処理。
 *
 * 変換手段の調査結果:
 *   - rsvg-convert / inkscape: このマシンに未インストール（`which`で未検出）
 *   - npx sharp 等npmパッケージ: ネットワーク取得が必要になるため、インストール前に
 *     報告・許可を得る対象。今回は未インストールのツールで代替可能だったため使用しなかった
 *   - sips: macOS標準搭載（追加インストール一切不要）。SVGの読み込み・PNG出力・
 *     800x800へのリサイズに対応していることを事前にテスト済み（本文のテスト結果は
 *     CHECKLIST.md / 作業報告を参照。NB001/main.svgで正しく図形が描画されることを目視確認済み）
 *   → 本スクリプトは sips を child_process 経由で呼び出す方式を採用する。
 *
 * MakeShop側の画像仕様（docs/makeshop-notes.md §2）: 500KB以下・長辺5,000pxまで。
 * 800x800のフラットなSVG由来PNGであれば十分に収まる想定（実ファイルサイズは
 * 本スクリプトの検証ログで確認できる）。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PRODUCTS_SVG_DIR = path.join(ROOT, 'site', 'img', 'products');
const OUT_DIR = path.join(__dirname, 'images');
const SIZE = 800;

mkdirSync(OUT_DIR, { recursive: true });

const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const skus = data.products.map((p) => p.sku);

/**
 * PNGファイルのIHDRチャンクからwidth/heightを読み取る（Node標準のBufferのみで実装。
 * 外部の画像処理ライブラリは使わない）。
 * PNG仕様: シグネチャ8byte + IHDRチャンク(長さ4 + "IHDR"4 + width4 + height4 + ...)
 */
function readPngSize(filePath) {
  const buf = readFileSync(filePath);
  const signatureOk = buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a;
  if (!signatureOk) {
    throw new Error(`PNGシグネチャ不正: ${filePath}`);
  }
  const chunkType = buf.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') {
    throw new Error(`先頭チャンクがIHDRではない: ${filePath}`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

let okCount = 0;
let ngCount = 0;
const results = [];

for (const sku of skus) {
  const srcSvg = path.join(PRODUCTS_SVG_DIR, sku, 'main.svg');
  const destPng = path.join(OUT_DIR, `${sku}.png`);

  if (!existsSync(srcSvg)) {
    console.error(`[NG] ${sku}: ソースSVGが見つかりません (${srcSvg})`);
    ngCount++;
    continue;
  }

  try {
    execFileSync('sips', ['-s', 'format', 'png', '-z', String(SIZE), String(SIZE), srcSvg, '--out', destPng], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error(`[NG] ${sku}: sips変換失敗 - ${err.message}`);
    ngCount++;
    continue;
  }

  const { width, height } = readPngSize(destPng);
  const sizeBytes = statSync(destPng).size;
  if (width !== SIZE || height !== SIZE) {
    console.error(`[NG] ${sku}: サイズ不正 (${width}x${height}、期待値 ${SIZE}x${SIZE})`);
    ngCount++;
    continue;
  }
  okCount++;
  results.push({ sku, width, height, sizeBytes });
}

console.log('--- 変換結果 ---');
for (const r of results) {
  console.log(`${r.sku}: ${r.width}x${r.height}, ${(r.sizeBytes / 1024).toFixed(1)}KB`);
}
console.log(`OK: ${okCount} / 期待値: ${skus.length} / NG: ${ngCount}`);

if (okCount !== 45 || ngCount !== 0) {
  console.error('[検証失敗] 45枚すべてが800x800で生成されていません。');
  process.exit(1);
}
console.log('[検証OK] 45枚すべて800x800 PNGとして生成されました。');
