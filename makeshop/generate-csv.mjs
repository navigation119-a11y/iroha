#!/usr/bin/env node
/**
 * generate-csv.mjs
 *
 * data/products.json から MakeShop 投入用CSV（仮フォーマット）を決定論的に生成する。
 * Node標準モジュールのみ使用。日付・乱数は使わない（同一入力からは常に同一出力）。
 *
 * 出力:
 *   csv/products-makeshop.csv       … 商品一括登録CSV（UTF-8 BOM付き）
 *   csv/products-makeshop-sjis.csv  … 同内容のShift_JIS版
 *   csv/categories.csv              … カテゴリ一括登録CSV（UTF-8 BOM付き）
 *
 * 列仕様・区切り文字の根拠と要確認事項は csv/README.md を参照。
 *
 * 文字コード変換について:
 *   Node標準にはUTF-8文字列をShift_JISへ「エンコード」する機能がない
 *   （Buffer/TextEncoderはUTF-8出力のみ対応）。フルのJIS X 0208変換表を
 *   自前実装する代わりに、macOS/Linuxに標準搭載されている `iconv` コマンドを
 *   child_process経由で呼び出す（npm追加インストールは不要。利用可否は
 *   実行環境依存のため、iconvが無い環境ではこのスクリプトは失敗する＝要確認事項として
 *   CHECKLIST.mdに記載済み）。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CSV_DIR = path.join(__dirname, 'csv');

mkdirSync(CSV_DIR, { recursive: true });

const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
const categoryBySlug = Object.fromEntries(data.categories.map((c) => [c.slug, c]));

// ---------------------------------------------------------------------
// CSVユーティリティ（RFC4180準拠: カンマ・ダブルクォート・改行を含む値のみ引用符で囲む）
// ---------------------------------------------------------------------
function csvField(value) {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function toRow(fields) {
  return fields.map(csvField).join(',');
}
// MakeShopの旧系CSVはCRLF・S-JIS系が多いため、改行はCRLFに統一する
const CRLF = '\r\n';

// ---------------------------------------------------------------------
// 1. 商品一括登録CSV（仮フォーマット・11列）
//    列順は企画指示どおり。新85列フォーマットへの正式な列対応はcsv/README.md参照。
// ---------------------------------------------------------------------
const PRODUCT_HEADER = [
  '商品特定コード指定',
  '独自商品コード',
  '商品名',
  '販売価格',
  '商品説明',
  'カテゴリーパス',
  'バリエーション1名称',
  '数量',
  '商品表示可否',
  '商品ラベル',
  '拡大画像名',
];

// 要確認: バリエーション1名称内でカラー選択肢を複数登録する際の公式区切り文字が
// 調査ノート(docs/makeshop-notes.md §2)に記載なし。暫定で「|」を採用する。
const VARIATION_DELIMITER = '|';
// 商品ラベル(CSV列84相当)はパイプ区切りが調査ノートで確認済み。
const LABEL_DELIMITER = '|';

const productRows = data.products.map((p) => {
  const category = categoryBySlug[p.category];
  if (!category) {
    throw new Error(`未知のカテゴリslug: ${p.category} (SKU: ${p.sku})`);
  }
  return [
    '1', // 商品特定コード指定 = 1固定（独自商品コードをキーにする）
    p.sku, // 独自商品コード
    p.nameJa, // 商品名 … products.jsonの値そのまま。nameEn(英語名)は本CSVの単一「商品名」列には
    // 含めない（要確認: 正式85列フォーマットに英語名専用列があるかPhase Aで確認。
    // 詳細はcsv/README.mdの要確認事項を参照）
    String(p.price), // 販売価格 … products.jsonの値そのまま（数値のみ、通貨記号・カンマなし）
    p.description, // 商品説明 … products.jsonの値そのまま
    category.nameJa, // カテゴリーパス（1階層のみのため、カテゴリ名そのものがパスになる）
    p.colors.join(VARIATION_DELIMITER), // バリエーション1名称（カラー選択肢）
    '10', // 数量 = 10固定
    'Y', // 商品表示可否 = Y固定
    p.tags.join(LABEL_DELIMITER), // 商品ラベル
    `${p.sku}.png`, // 拡大画像名（convert-images.mjsの出力ファイル名と一致させる）
  ];
});

const productCsvBody = [PRODUCT_HEADER, ...productRows].map(toRow).join(CRLF) + CRLF;

// --- 自己検査（絶対条件・自己検査項目） ---
function assert(cond, message) {
  if (!cond) {
    throw new Error(`自己検査失敗: ${message}`);
  }
}
assert(data.products.length === 45, `products.json件数が45件ではない (実際: ${data.products.length})`);
assert(productRows.length === 45, `生成した商品行数が45件ではない (実際: ${productRows.length})`);
{
  const lineCount = productCsvBody.split(CRLF).filter((l) => l.length > 0).length;
  assert(lineCount === 46, `CSV行数(ヘッダ+データ)が46行ではない (実際: ${lineCount})`);
}
{
  const skuSet = new Set(data.products.map((p) => p.sku));
  assert(skuSet.size === 45, `SKUが45種ではない (実際: ${skuSet.size}種)`);
}
{
  // 生成したCSV本文を再パースし、価格列がproducts.jsonの値と一致するかを独立に再検証する
  const lines = productCsvBody.split(CRLF).filter((l) => l.length > 0);
  const header = lines[0].split(',');
  const priceCol = header.indexOf('販売価格');
  const skuCol = header.indexOf('独自商品コード');
  assert(priceCol !== -1 && skuCol !== -1, 'ヘッダ列の再検出に失敗');
  const bySku = Object.fromEntries(data.products.map((p) => [p.sku, p.price]));
  for (const line of lines.slice(1)) {
    const cols = line.split(','); // 本データにはCSV特殊文字を含む値がないため単純split可（事前grep済み）
    const sku = cols[skuCol];
    const price = Number(cols[priceCol]);
    assert(bySku[sku] === price, `価格不一致: SKU=${sku} CSV=${price} products.json=${bySku[sku]}`);
  }
}
console.log('[自己検査OK] 商品CSV: 行数46(ヘッダ+45)・SKU45種・価格一致を確認');

// --- UTF-8 (BOM付き) 出力 ---
const BOM = '\uFEFF';
const productCsvUtf8Path = path.join(CSV_DIR, 'products-makeshop.csv');
writeFileSync(productCsvUtf8Path, BOM + productCsvBody, 'utf8');

// --- Shift_JIS 出力（iconv経由） ---
const productCsvSjisPath = path.join(CSV_DIR, 'products-makeshop-sjis.csv');
try {
  const sjisBuffer = execFileSync('iconv', ['-f', 'UTF-8', '-t', 'SHIFT_JIS'], {
    input: Buffer.from(productCsvBody, 'utf8'),
    maxBuffer: 10 * 1024 * 1024,
  });
  writeFileSync(productCsvSjisPath, sjisBuffer);
} catch (err) {
  throw new Error(
    `Shift_JIS変換に失敗しました（iconvコマンドが見つからない可能性があります）。` +
      `この変換手段自体が要確認事項です（csv/README.md参照）。詳細: ${err.message}`
  );
}

// ---------------------------------------------------------------------
// 2. カテゴリ一括登録CSV（5カテゴリ・カテゴリーパス形式）
//    公式の新規カテゴリ登録CSVの正式列構成は調査ノートに記載がないため、
//    確認が取れている「カテゴリーパス」列のみで構成する（要確認: 他の列の要否）。
// ---------------------------------------------------------------------
const CATEGORY_HEADER = ['カテゴリーパス'];
const categoryRows = data.categories.map((c) => [c.nameJa]);
assert(categoryRows.length === 5, `カテゴリ件数が5件ではない (実際: ${categoryRows.length})`);
const categoryCsvBody = [CATEGORY_HEADER, ...categoryRows].map(toRow).join(CRLF) + CRLF;
const categoryCsvPath = path.join(CSV_DIR, 'categories.csv');
writeFileSync(categoryCsvPath, BOM + categoryCsvBody, 'utf8');

console.log('[生成完了]');
console.log(` - ${path.relative(ROOT, productCsvUtf8Path)}`);
console.log(` - ${path.relative(ROOT, productCsvSjisPath)}`);
console.log(` - ${path.relative(ROOT, categoryCsvPath)}`);
