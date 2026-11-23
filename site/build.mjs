#!/usr/bin/env node
/**
 * iroha. ポートフォリオECサイト ビルドスクリプト
 * Node標準モジュールのみを使用（npm依存ゼロ）。
 * ../data/products.json を読み、全ページHTMLと商品プレースホルダSVGを生成する。
 *
 * 実行: node build.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = __dirname;
const DATA_PATH = path.join(__dirname, "..", "data", "products.json");

/* =======================================================================
   0. データ読み込み
   ======================================================================= */
const DATA = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const CATEGORIES = DATA.categories;
const PRODUCTS = DATA.products;

const CATEGORY_BY_SLUG = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));
const PRODUCTS_BY_SKU = Object.fromEntries(PRODUCTS.map((p) => [p.sku, p]));

/* カテゴリの並び（登場順＝design-spec掲載順） */
const CATEGORY_ORDER = [
  "notebook-paper",
  "pen-writing",
  "sticker-craft",
  "desk-accessories",
  "gift-set",
];

/* TOPページ掲載SKU（指示に基づき固定） */
const PICK_UP_SKUS = ["NB009", "PW003", "DA001", "DA007"];
const NEW_ITEMS_SKUS = ["NB012", "PW009", "PW010", "SC009", "SC010", "DA007", "DA008", "GS004"];

/* GIFT GUIDE「添えるアイテム」固定SKU */
const GIFT_ADD_ON_SKUS = ["NB007", "NB008", "NB011", "SC004"];

/* タグ: 表示順とスラッグ（クラス名・data属性用） */
const TAG_LIST = ["定番", "人気", "おすすめ", "主力", "ギフト", "限定"];
const TAG_SLUG = {
  定番: "teiban",
  人気: "ninki",
  おすすめ: "osusume",
  主力: "shuriki",
  ギフト: "gift",
  限定: "gentei",
};

const PORTFOLIO_NOTICE =
  "本サイトは架空ブランド「iroha.」を題材にしたポートフォリオ作品です。商品・価格はすべて架空の設定であり、実際の販売・購入はできません。";

/* favicon: ロゴドット意匠（IROHA BLUEの角丸面＋VIVID ORANGEのドット）。文字は入れない */
const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#315BCB"/><circle cx="22" cy="22" r="7" fill="#F07842"/></svg>';
const FAVICON_HREF = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;

/* OGP: 本番公開URLが決まったらここに設定する。空文字の間はog:url/og:imageを出力しない
   （ローカル閲覧時に不正な相対URLをSNSカード用メタとして出さないため） */
const OG_BASE_URL = "";

/* =======================================================================
   1. 汎用ユーティリティ
   ======================================================================= */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(relPath, content) {
  const full = path.join(SITE_DIR, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, content, "utf8");
  return full;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* 3桁区切り。toLocaleStringはICU実装依存のため使わず、正規表現で決定論的に整形する */
function formatThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function yen(price) {
  return `¥${formatThousands(price)}`;
}

/* ルートプレフィックス（ページ階層の深さからの相対パス） */
function rootPrefix(depth) {
  return depth === 0 ? "./" : "../".repeat(depth);
}

/* =======================================================================
   2. 配色（ブランドカラー・カテゴリ色・アクセント色）
   ======================================================================= */
/* 色の単一ソース化: カテゴリ色は data/products.json の categories[].color から導出する（products.jsonは読み取り専用のまま）。
   ブランド5色の名前(blue/orange/...)は商品カラー欄の語句マッピング等カテゴリ非依存の文脈でも使うため、
   別名として保持しつつ値そのものは常にCATEGORY_HEX（= products.json由来）を参照する。 */
const CATEGORY_HEX = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.color]));

const BRAND_HEX = {
  blue: CATEGORY_HEX["notebook-paper"],
  orange: CATEGORY_HEX["pen-writing"],
  yellow: CATEGORY_HEX["sticker-craft"],
  green: CATEGORY_HEX["desk-accessories"],
  pink: CATEGORY_HEX["gift-set"],
  ink: "#292929",
};

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.substring(0, 2), 16),
    g: parseInt(n.substring(2, 4), 16),
    b: parseInt(n.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const h = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/* colorHexをpct%の濃さで白と混色する（カテゴリ淡色背景の算出用） */
function mixWithWhite(hex, pct) {
  const { r, g, b } = hexToRgb(hex);
  const ratio = pct / 100;
  return rgbToHex(
    255 * (1 - ratio) + r * ratio,
    255 * (1 - ratio) + g * ratio,
    255 * (1 - ratio) + b * ratio
  );
}

const INK_LIGHT_HEX = mixWithWhite(BRAND_HEX.ink, 12);

/* 商品のカラー欄（colorRaw全体）をブランドパレットへマップ（プレースホルダの補助色用） */
function mapAccentHex(colorRaw) {
  const s = colorRaw || "";
  if (/ブルー|コバルト|ネイビー/.test(s)) return BRAND_HEX.blue;
  if (/オレンジ|コーラル|テラコッタ/.test(s)) return BRAND_HEX.orange;
  if (/イエロー/.test(s)) return BRAND_HEX.yellow;
  if (/ピンク/.test(s)) return BRAND_HEX.pink;
  if (/グリーン|セージ/.test(s)) return BRAND_HEX.green;
  return INK_LIGHT_HEX;
}

const MULTI_PALETTE = [BRAND_HEX.blue, BRAND_HEX.orange, BRAND_HEX.yellow, BRAND_HEX.pink, BRAND_HEX.green];
const SAND_TINT_HEX = mixWithWhite(BRAND_HEX.yellow, 55);

/* 商品のcolors[0]（先頭の色・バリエーション名）をブランドパレットへマップ（プレースホルダのメイン図形色用）。
   図形の大面積塗りにink(#292929)は一切使わない（design-spec §4はブランド5色+白系のみ）。
   - 複合色「A×B」は×前の第1成分のみで判定する（例: アイボリー×ブルー→アイボリー→白系）
   - ウォーム→orange / サンド→yellowの淡トーン / グレー→ink12%相当の淡グレー（白系扱い、#292929ではない）
   - ホワイト/アイボリー/クリア→白
   - 「〜セット」「マルチ」「ミックス」「アソート」「カラフル」「n色」等の集合表現・未知色はSKU連番でパレットを巡回させる */
function mapMainHex(colorFirst, skuNum) {
  const s = (colorFirst || "").split("×")[0];
  if (/ブルー|コバルト|ネイビー/.test(s)) return BRAND_HEX.blue;
  if (/オレンジ|コーラル|テラコッタ/.test(s)) return BRAND_HEX.orange;
  if (/イエロー/.test(s)) return BRAND_HEX.yellow;
  if (/ピンク/.test(s)) return BRAND_HEX.pink;
  if (/グリーン|セージ/.test(s)) return BRAND_HEX.green;
  if (/ウォーム/.test(s)) return BRAND_HEX.orange;
  if (/サンド/.test(s)) return SAND_TINT_HEX;
  if (/グレー/.test(s)) return INK_LIGHT_HEX;
  if (/ホワイト|アイボリー|クリア/.test(s)) return "#FFFFFF";
  // マルチ/ミックス/アソート/カラフル/セット/n色 等の集合表現、および未知色はパレット巡回（inkへは落とさない）
  return MULTI_PALETTE[skuNum % MULTI_PALETTE.length];
}

/* =======================================================================
   3. プレースホルダSVG生成（カテゴリ色の幾何学コンポジション）
   文字・ロゴは一切描き込まない。輪郭線は使わずフラット塗りのみ。
   ======================================================================= */
function svgWrap(bgHex, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-hidden="true"><rect width="400" height="400" fill="${bgHex}"/>${inner}</svg>`;
}

/* 共有ユーティリティ: seedから-8〜8degの回転角を決定論的に導出する */
function jitterRotation(seed, multiplier) {
  return ((seed * multiplier) % 17) - 8;
}

/* notebook-paper: 角丸長方形（表紙）＋背表紙帯 */
function svgNotebook(bg, main, accent, seed) {
  const rot = jitterRotation(seed, 11);
  const scale = 0.86 + ((seed * 7) % 11) * 0.028;
  const w = Math.round(190 * scale);
  const h = Math.round(290 * scale);
  const cx = 200 + (((seed * 5) % 23) - 11);
  const cy = 200 + (((seed * 9) % 23) - 11);
  const x = cx - w / 2;
  const y = cy - h / 2;
  const spineW = Math.round(30 * scale);
  const dotCount = seed % 3 === 0 ? 2 : 1;
  const dots = [];
  for (let i = 0; i < dotCount; i += 1) {
    const dotR = 22 - i * 7 + (seed % 6);
    const dotX = 326 - i * 46 - ((seed * 3) % 24);
    const dotY = 86 + i * 54 + ((seed * 7) % 34);
    dots.push(`<circle cx="${dotX}" cy="${dotY}" r="${dotR}" fill="${accent}"/>`);
  }
  return svgWrap(
    bg,
    `<g transform="rotate(${rot} ${cx} ${cy})">` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${main}"/>` +
      `<rect x="${x}" y="${y}" width="${spineW}" height="${h}" rx="12" fill="${accent}"/>` +
      `</g>` +
      dots.join("")
  );
}

/* pen-writing: 斜めのカプセル形（ペン軸）＋ペン先三角。斜め姿勢を保ちつつSKUごとに角度・寸法・付属円を変化させる */
function svgPen(bg, main, accent, seed) {
  const baseRot = 22 + (seed % 5) * 5;
  const rot = baseRot + jitterRotation(seed, 13);
  const scale = 0.82 + ((seed * 7) % 11) * 0.032;
  const capsuleW = Math.round(260 * scale);
  const capsuleH = Math.round(62 * scale);
  const cx = 200 + (((seed * 9) % 41) - 20);
  const cy = 200 + (((seed * 17) % 41) - 20);
  const tipLen = Math.round(40 * scale);
  const eraserCount = seed % 4 === 0 ? 2 : 1;
  const dots = [];
  for (let i = 0; i < eraserCount; i += 1) {
    const r = 14 + (seed % 7) - i * 4;
    const ex = 92 + i * 160 + ((seed * 5) % 34);
    const ey = 302 - i * 44 - ((seed * 11) % 44);
    dots.push(`<circle cx="${ex}" cy="${ey}" r="${r}" fill="${accent}"/>`);
  }
  return svgWrap(
    bg,
    `<g transform="rotate(${rot} ${cx} ${cy})">` +
      `<rect x="${cx - capsuleW / 2}" y="${cy - capsuleH / 2}" width="${capsuleW}" height="${capsuleH}" rx="${capsuleH / 2}" fill="${main}"/>` +
      `<polygon points="${cx - capsuleW / 2 - tipLen},${cy} ${cx - capsuleW / 2},${cy - capsuleH / 2} ${cx - capsuleW / 2},${cy + capsuleH / 2}" fill="${accent}"/>` +
      `</g>` +
      dots.join("")
  );
}

/* sticker-craft: 大小の円・四角の散らし。白は使わずmain/accent/mainの淡色面の3色で構成する */
function svgSticker(bg, main, accent, seed, accent2) {
  const countPool = [3, 4, 5, 6];
  const count = countPool[seed % countPool.length];
  const basePositions = [
    { x: 78, y: 96, size: 50, shape: "circle" },
    { x: 262, y: 70, size: 38, shape: "square" },
    { x: 190, y: 205, size: 64, shape: "circle" },
    { x: 96, y: 272, size: 40, shape: "square" },
    { x: 308, y: 286, size: 32, shape: "circle" },
    { x: 226, y: 330, size: 44, shape: "square" },
  ];
  /* mainが白の場合、mixWithWhite(白,55%)は白のままで図形が判読不能になるため、
     その枠だけ第2アクセント色に差し替える（白以外のmainでは従来どおり変化なし） */
  const softMain = main === "#FFFFFF" && accent2 ? accent2 : mixWithWhite(main, 55);
  const palette = [main, accent, softMain];
  const scale = 0.85 + ((seed * 7) % 10) * 0.032;
  const parts = basePositions.slice(0, count).map((p, i) => {
    const shiftX = ((seed + i * 37) % 44) - 22;
    const shiftY = ((seed + i * 53) % 44) - 22;
    const fill = palette[(seed + i) % palette.length];
    const size = Math.round(p.size * scale);
    const x = p.x + shiftX;
    const y = p.y + shiftY;
    if (p.shape === "circle") {
      return `<circle cx="${x}" cy="${y}" r="${size / 2}" fill="${fill}"/>`;
    }
    return `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="10" fill="${fill}"/>`;
  });
  return svgWrap(bg, parts.join(""));
}

/* desk-accessories: 積み重なるブロック面。白は使わずmain/accent/mainの淡色面の3色で構成する */
function svgDesk(bg, main, accent, seed, accent2) {
  const rot = jitterRotation(seed, 11);
  const countPool = [2, 3, 4];
  const count = countPool[seed % countPool.length];
  const scale = 0.85 + ((seed * 7) % 10) * 0.032;
  const baseX = 110 + (((seed * 5) % 33) - 16);
  const baseY = 260 + (((seed * 9) % 33) - 16);
  /* mainが白の場合、mixWithWhite(白,55%)は白のままでブロックが判読不能になるため、
     その枠だけ第2アクセント色に差し替える（白以外のmainでは従来どおり変化なし） */
  const softMain = main === "#FFFFFF" && accent2 ? accent2 : mixWithWhite(main, 55);
  const palette = [main, accent, softMain];
  const blocks = [];
  for (let i = 0; i < count; i += 1) {
    blocks.push({
      dx: -36 + i * 18,
      dy: 10 - i * 58,
      w: Math.round(232 * scale),
      h: Math.round(58 * scale),
      fill: palette[i % palette.length],
    });
  }
  const parts = blocks.map(
    (b) => `<rect x="${baseX + b.dx}" y="${baseY + b.dy}" width="${b.w}" height="${b.h}" rx="14" fill="${b.fill}"/>`
  );
  return svgWrap(bg, `<g transform="rotate(${rot} 200 200)">${parts.join("")}</g>`);
}

/* gift-set: 四角（箱）＋半円（リボン） */
function svgGift(bg, main, accent, seed) {
  const rot = jitterRotation(seed, 11);
  const scale = 0.85 + ((seed * 7) % 10) * 0.032;
  const size = Math.round(224 * scale);
  const cx = 200 + (((seed * 5) % 21) - 10);
  const cy = 206 + (((seed * 9) % 21) - 10);
  const ribbonW = Math.round(34 * scale);
  const bowR = Math.round((48 + (seed % 10) * 2) * scale);
  const boxX = cx - size / 2;
  const boxY = cy - (size - 16) / 2;
  const knot = seed % 3 === 0 ? `<circle cx="${cx}" cy="${boxY}" r="${Math.round(14 * scale)}" fill="${accent}"/>` : "";
  return svgWrap(
    bg,
    `<g transform="rotate(${rot} ${cx} ${cy})">` +
      `<rect x="${boxX}" y="${boxY}" width="${size}" height="${size - 16}" rx="16" fill="${main}"/>` +
      `<rect x="${cx - ribbonW / 2}" y="${boxY}" width="${ribbonW}" height="${size - 16}" fill="${accent}"/>` +
      `<path d="M ${cx - bowR} ${boxY} A ${bowR} ${bowR} 0 0 1 ${cx + bowR} ${boxY} Z" fill="${accent}"/>` +
      `</g>` +
      knot
  );
}

const ARCHETYPE_BY_CATEGORY = {
  "notebook-paper": svgNotebook,
  "pen-writing": svgPen,
  "sticker-craft": svgSticker,
  "desk-accessories": svgDesk,
  "gift-set": svgGift,
};

function categoryTintHex(slug) {
  return mixWithWhite(CATEGORY_HEX[slug], 12);
}
function categoryMainHex(slug) {
  return CATEGORY_HEX[slug];
}

/* 補助図形の色を決定する。
   メインが白(ホワイト/アイボリー/クリア系)の場合はink12%の淡グレー（輪郭なし）で固定。
   それ以外は商品の2色目（あれば）をブランドパレットへマップし、メインとの二色構成にする。
   2色目が無い・メインと同色になる等の衝突時はカテゴリ色→ink、の順にフォールバックして
   同一カテゴリ内で「メイン＝アクセント」の単色化（例: NB群がすべて同じ青一色）を避ける */
/* パレット内の次の色（巡回）。衝突回避・白系の彩色アクセント決定で共用する */
function nextPaletteColor(hex) {
  const idx = MULTI_PALETTE.indexOf(hex);
  return idx === -1 ? MULTI_PALETTE[0] : MULTI_PALETTE[(idx + 1) % MULTI_PALETTE.length];
}

/* mainが白（ホワイト/アイボリー/クリア系）の場合の彩色アクセント色を決定する。
   白系メインは「ほぼ空の画像」に見えやすいため、ink12%の淡グレーではなく必ず彩色（ブランド5色）を返す。
   決定順: 1. 複合色「A×B」のB、またはcolors[1]をマップ（有効な色相が取れた場合）
          2. マルチ/ミックス系→SKU連番でパレットローテーション
          3. どちらも無い単色白系→カテゴリ色 */
function resolveWhiteAccent(product, skuNum) {
  const first = (product.colors && product.colors[0]) || "";
  const compoundParts = first.split("×");
  const secondSource = compoundParts.length >= 2 ? compoundParts[1] : (product.colors && product.colors[1]) || null;
  if (secondSource) {
    const mapped = mapMainHex(secondSource, skuNum + 1);
    if (mapped !== "#FFFFFF") return mapped;
  }
  if (/マルチ|ミックス|アソート|カラフル/.test(first)) {
    return MULTI_PALETTE[skuNum % MULTI_PALETTE.length];
  }
  return categoryMainHex(product.category);
}

function resolveAccentHex(product, skuNum, main) {
  if (main === "#FFFFFF") return resolveWhiteAccent(product, skuNum);
  const second = product.colors && product.colors[1];
  let candidate = second ? mapMainHex(second, skuNum + 1) : categoryMainHex(product.category);
  if (candidate === main) candidate = categoryMainHex(product.category);
  if (candidate === main) {
    // カテゴリ色でも衝突する場合は、inkへは逃がさずパレット次色（白系ならパレット先頭）へ巡回させる
    const idx = MULTI_PALETTE.indexOf(main);
    candidate = idx === -1 ? MULTI_PALETTE[skuNum % MULTI_PALETTE.length] : MULTI_PALETTE[(idx + 1) % MULTI_PALETTE.length];
  }
  return candidate;
}

/* 商品1点分（main/sub1/sub2/sub3）のSVGを生成して書き出す。
   メイン図形＝商品のcolors[0]をブランドパレットへマップした色（個体差）
   背景＝カテゴリ色12%tint（カテゴリ識別を維持）
   補助図形＝resolveAccentHex参照 */
function buildProductImages(product) {
  const archetype = ARCHETYPE_BY_CATEGORY[product.category];
  const bg = categoryTintHex(product.category);
  const skuNum = parseInt(product.sku.slice(2), 10);
  const main = mapMainHex(product.colors && product.colors[0], skuNum);
  const accent = resolveAccentHex(product, skuNum, main);
  /* mainが白の場合のみ、sticker/desk archetype向けに第2の彩色アクセントを渡す（他categoryは未使用のため無害） */
  const accent2 = main === "#FFFFFF" ? nextPaletteColor(accent) : undefined;
  const variants = ["main", "sub1", "sub2", "sub3"];
  variants.forEach((name, i) => {
    const seed = skuNum * 4 + i * 13;
    const svg = archetype(bg, main, accent, seed, accent2);
    writeFile(`img/products/${product.sku}/${name}.svg`, svg);
  });
}

/* カテゴリカード等に使う、カテゴリ色＋別アクセント色の2トーン組み合わせ（白は使わず常に視認性を確保） */
const CATEGORY_ICON_ACCENT = {
  "notebook-paper": BRAND_HEX.orange,
  "pen-writing": BRAND_HEX.blue,
  "sticker-craft": BRAND_HEX.pink,
  "desk-accessories": BRAND_HEX.blue,
  "gift-set": BRAND_HEX.yellow,
};

/* カテゴリアイコン（カード等にインライン表示する小さな同系統SVG） */
function categoryIconSvg(slug, seedOffset = 0) {
  const archetype = ARCHETYPE_BY_CATEGORY[slug];
  const bg = categoryTintHex(slug);
  const main = categoryMainHex(slug);
  const accent = CATEGORY_ICON_ACCENT[slug];
  return archetype(bg, main, accent, seedOffset);
}

/* SNSグリッド用の汎用プレースホルダ（6枚、カテゴリを巡回） */
function buildSnsImages() {
  for (let i = 0; i < 6; i += 1) {
    const slug = CATEGORY_ORDER[i % CATEGORY_ORDER.length];
    const archetype = ARCHETYPE_BY_CATEGORY[slug];
    const bg = categoryTintHex(slug);
    const main = categoryMainHex(slug);
    const accentKeys = Object.keys(BRAND_HEX).filter((k) => BRAND_HEX[k] !== main && k !== "ink");
    const accent = BRAND_HEX[accentKeys[i % accentKeys.length]];
    const svg = archetype(bg, main, accent, i * 5 + 2);
    writeFile(`img/sns/${i + 1}.svg`, svg);
  }
}

/* =======================================================================
   4. 共通HTMLパーツ
   ======================================================================= */
function iconSearch() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><line x1="16.2" y1="16.2" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function iconCart() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16l-1.6 10.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 7V6a4 4 0 0 1 8 0v1" stroke="currentColor" stroke-width="2"/></svg>`;
}
function iconHamburger() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
function iconSnsA() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="6" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2"/></svg>`;
}
function iconSnsB() {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><line x1="8" y1="9" x2="16" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="9" x2="8" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function logoSvg() {
  return (
    `<span class="p-logo__word">` +
    `<svg width="74" height="24" viewBox="0 0 74 24" aria-hidden="true" focusable="false">` +
    `<text x="0" y="18" font-family="Poppins, sans-serif" font-weight="600" font-size="20" fill="#315BCB">iroha</text>` +
    `<circle cx="70" cy="19" r="3.4" fill="#F07842"/>` +
    `</svg>` +
    `</span>`
  );
}

function noticeBar(extraClass = "") {
  return `<p class="p-notice-bar ${extraClass}">${escapeHtml(PORTFOLIO_NOTICE)}</p>`;
}

function headerHtml(root) {
  const items = root + "items/index.html";
  const categoryHref = (slug) => `${root}category/${slug}/index.html`;
  const navLinks = [
    { label: "ABOUT", href: `${root}about/index.html` },
    { label: "GIFT GUIDE", href: `${root}gift-guide/index.html` },
    { label: "NEWS", href: `${root}news/index.html` },
    { label: "FAQ", href: `${root}faq/index.html` },
  ];
  const dropdownItems = CATEGORIES.map(
    (c) =>
      `<a class="p-nav__dropdown-item p-cat-${c.slug}" href="${categoryHref(c.slug)}"><span class="p-nav__dot"></span>${escapeHtml(c.nameEn)}</a>`
  ).join("");

  return `<header class="p-header">
  <div class="p-header__inner">
    <a class="p-logo" href="${root}index.html" aria-label="iroha. ホーム">
      ${logoSvg()}
      <span class="p-logo__tagline">STATIONERY &amp; CREATIVE GOODS</span>
    </a>
    <nav class="p-nav" aria-label="メインナビゲーション">
      <div class="p-nav__dropdown">
        <button type="button" class="p-nav__dropdown-toggle" aria-haspopup="true" aria-expanded="false">CATEGORY <span class="p-nav__dropdown-caret">▾</span></button>
        <div class="p-nav__dropdown-panel">
          ${dropdownItems}
          <a class="p-nav__dropdown-item" href="${items}"><span class="p-nav__dot" style="background:var(--c-ink)"></span>ALL ITEMS</a>
        </div>
      </div>
      ${navLinks.map((n) => `<a class="p-nav__link" href="${n.href}">${n.label}</a>`).join("")}
    </nav>
    <div class="p-header__icons">
      <a class="p-icon-btn" href="#" aria-label="検索">${iconSearch()}</a>
      <a class="p-icon-btn" href="#" aria-label="カート">${iconCart()}</a>
      <details class="p-spmenu">
        <summary aria-label="メニューを開く" aria-expanded="false">${iconHamburger()}</summary>
        <div class="p-spmenu__panel">
          <button type="button" class="p-spmenu__close" data-spmenu-close aria-label="メニューを閉じる">${iconClose()}</button>
          <a class="p-spmenu__link" href="${items}">ALL ITEMS</a>
          <div class="p-spmenu__sub">
            ${dropdownItems}
          </div>
          ${navLinks.map((n) => `<a class="p-spmenu__link" href="${n.href}">${n.label}</a>`).join("")}
        </div>
      </details>
    </div>
  </div>
</header>`;
}

function footerHtml(root) {
  const categoryHref = (slug) => `${root}category/${slug}/index.html`;
  const shopLinks =
    CATEGORIES.map((c) => `<a class="p-footer__link" href="${categoryHref(c.slug)}">${escapeHtml(c.nameEn)}</a>`).join("") +
    `<a class="p-footer__link" href="${root}items/index.html">ALL ITEMS</a>`;
  const guideLinks = [
    { label: "ABOUT", href: `${root}about/index.html` },
    { label: "GIFT GUIDE", href: `${root}gift-guide/index.html` },
    { label: "FAQ", href: `${root}faq/index.html` },
    { label: "NEWS", href: `${root}news/index.html` },
  ]
    .map((n) => `<a class="p-footer__link" href="${n.href}">${n.label}</a>`)
    .join("");
  const policyLinks = [
    { label: "ご利用ガイド", href: `${root}policy/index.html#guide` },
    { label: "特定商取引法に基づく表記（デモ注記）", href: `${root}policy/index.html#tokushoho` },
    { label: "プライバシーポリシー（デモ）", href: `${root}policy/index.html#privacy` },
  ]
    .map((n) => `<a class="p-footer__link" href="${n.href}">${n.label}</a>`)
    .join("");

  return `<footer class="p-footer">
  <div class="p-container">
    <div class="p-footer__grid">
      <details class="p-footer__accordion" open>
        <summary>SHOP</summary>
        <nav aria-label="ショップ">${shopLinks}</nav>
      </details>
      <details class="p-footer__accordion" open>
        <summary>GUIDE</summary>
        <nav aria-label="ガイド">${guideLinks}</nav>
      </details>
      <details class="p-footer__accordion" open>
        <summary>POLICY</summary>
        <nav aria-label="ポリシー">${policyLinks}</nav>
      </details>
      <div>
        ${logoSvg()}
        <p class="p-logo__tagline">STATIONERY &amp; CREATIVE GOODS</p>
        <div class="p-footer__sns">
          <a class="p-footer__sns-link" href="#" aria-label="Instagram（ダミー）">${iconSnsA()}</a>
          <a class="p-footer__sns-link" href="#" aria-label="X（ダミー）">${iconSnsB()}</a>
        </div>
      </div>
    </div>
    <div class="p-footer__bottom">
      <p class="p-footer__copyright">© iroha.</p>
      ${noticeBar("p-notice-bar--footer")}
    </div>
  </div>
</footer>`;
}

function breadcrumbHtml(items) {
  const parts = items
    .map((item, i) => {
      const isLast = i === items.length - 1;
      const label = escapeHtml(item.label);
      if (isLast || !item.href) {
        return `<span aria-current="page">${label}</span>`;
      }
      return `<a href="${item.href}">${label}</a>`;
    })
    .join('<span class="p-breadcrumb__sep">&gt;</span>');
  return `<nav class="p-breadcrumb p-container" aria-label="パンくずリスト">${parts}</nav>`;
}

function tagChipsHtml(tags) {
  return `<span class="p-tag-group">${tags
    .map((t) => `<span class="p-tag p-tag--${TAG_SLUG[t]}">${escapeHtml(t)}</span>`)
    .join("")}</span>`;
}

function productCardHtml(product, root, order) {
  const cat = CATEGORY_BY_SLUG[product.category];
  const href = `${root}products/${product.sku}/index.html`;
  const mainImg = `${root}img/products/${product.sku}/main.svg`;
  const subImg = `${root}img/products/${product.sku}/sub1.svg`;
  return `<a class="p-card p-cat-${product.category}" data-card data-cat="${product.category}" data-tags="${product.tags.join(",")}" data-price="${product.price}" data-order="${order}" href="${href}">
  <div class="p-card__media">
    <img src="${mainImg}" alt="${escapeHtml(product.nameJa)}" loading="lazy" width="400" height="400">
    <img class="p-card__img-sub" src="${subImg}" alt="" loading="lazy" width="400" height="400" aria-hidden="true">
    <span class="p-card__tags">${product.tags.map((t) => `<span class="p-tag p-tag--${TAG_SLUG[t]}">${escapeHtml(t)}</span>`).join("")}</span>
  </div>
  <div class="p-card__body">
    <p class="p-card__name-ja">${escapeHtml(product.nameJa)}</p>
    <p class="p-card__name-en">${escapeHtml(product.nameEn)}</p>
    <p class="p-card__price">${yen(product.price)}<span class="p-card__price-note">(税込)</span></p>
  </div>
</a>`;
}

function categoryCardHtml(cat, root) {
  return `<a class="p-category-card p-tint p-cat-${cat.slug}" href="${root}category/${cat.slug}/index.html">
  <span class="p-category-card__icon">${categoryIconSvg(cat.slug)}</span>
  <span class="p-category-card__en">${escapeHtml(cat.nameEn)}</span>
  <span class="p-category-card__ja">${escapeHtml(cat.nameJa)}</span>
</a>`;
}

/* =======================================================================
   5. ページシェル
   ======================================================================= */
function pageShell({ root, canonicalPath = "", title, description, bodyHtml, ogImage = "img/sns/1.svg" }) {
  /* og:url / og:image はOG_BASE_URLが空の間（＝本番URL未確定の間）は出力しない */
  const ogUrlTags = OG_BASE_URL
    ? `<meta property="og:url" content="${OG_BASE_URL}/${canonicalPath}">
<meta property="og:image" content="${OG_BASE_URL}/${ogImage}">`
    : "";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
${ogUrlTags}
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/svg+xml" href="${FAVICON_HREF}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&amp;family=Noto+Sans+JP:wght@400;500;700&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}css/style.css">
</head>
<body>
${noticeBar()}
${headerHtml(root)}
<main>
${bodyHtml}
</main>
${footerHtml(root)}
<script src="${root}js/main.js"></script>
</body>
</html>
`;
}

/* =======================================================================
   6. TOPページ
   ======================================================================= */
function buildTop() {
  const root = rootPrefix(0);

  const pickUp = PICK_UP_SKUS.map((sku) => PRODUCTS_BY_SKU[sku]);
  const newItems = NEW_ITEMS_SKUS.map((sku) => PRODUCTS_BY_SKU[sku]);
  const giftSetProducts = PRODUCTS.filter((p) => p.category === "gift-set");

  /* 円・半円・波形を重ねた1つのまとまりとして構成（図形はすべて中央のクラスタに密集させる） */
  const heroShapes = `<div class="p-hero__shapes" aria-hidden="true">
    <div class="p-shape p-shape--circle" style="left:15%; top:10%; width:62%; aspect-ratio:1/1; background:var(--c-yellow);"></div>
    <div class="p-shape p-shape--half-circle" style="left:36%; top:-6%; width:52%; aspect-ratio:2/1; background:var(--c-blue); transform:rotate(6deg);"></div>
    <div class="p-shape p-shape--wave" style="left:-8%; bottom:2%; width:48%; aspect-ratio:1/1; background:var(--c-green);"></div>
    <div class="p-shape p-shape--square" style="right:2%; bottom:8%; width:32%; aspect-ratio:1/1; background:var(--c-orange); transform:rotate(14deg);"></div>
    <div class="p-shape p-shape--circle" style="right:6%; top:4%; width:20%; aspect-ratio:1/1; background:var(--c-pink);"></div>
  </div>`;

  const hero = `<section class="p-hero">
  <div class="p-container p-hero__inner">
    <div>
      <h1 class="p-hero__title">毎日に、彩りと<br>アイデアを。</h1>
      <p class="p-hero__sub">いつもの毎日に、小さな発見を。</p>
      <div class="p-hero__cta"><a class="p-btn p-btn--primary" href="${root}items/index.html">ALL ITEMS →</a></div>
    </div>
    ${heroShapes}
  </div>
</section>`;

  const pickUpSection = `<section class="p-section">
  <div class="p-container">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">おすすめアイテム</p>
      <h2 class="p-section__title">PICK <span class="p-accent">UP</span></h2>
    </div>
    <div class="p-grid--scroll">
      ${pickUp.map((p, i) => productCardHtml(p, root, i)).join("")}
    </div>
  </div>
</section>`;

  const categorySection = `<section class="p-section">
  <div class="p-container">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">カテゴリーから探す</p>
      <h2 class="p-section__title">CATEGORY</h2>
    </div>
    <div class="p-category-grid">
      ${CATEGORY_ORDER.map((slug) => categoryCardHtml(CATEGORY_BY_SLUG[slug], root)).join("")}
    </div>
  </div>
</section>`;

  const newItemsSection = `<section class="p-section">
  <div class="p-container">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">新着アイテム</p>
      <h2 class="p-section__title">NEW ITEMS</h2>
    </div>
    <div class="p-grid">
      ${newItems.map((p, i) => productCardHtml(p, root, i)).join("")}
    </div>
    <div class="p-section__foot"><a class="p-btn p-btn--outline" href="${root}items/index.html">ALL ITEMS →</a></div>
  </div>
</section>`;

  const scenes = [
    {
      title: "デスクを整える",
      text: "お気に入りの道具で、集中できる空間をつくる。",
      href: `${root}category/desk-accessories/index.html`,
      slug: "desk-accessories",
    },
    {
      title: "手帳とノートの時間",
      text: "書くことが、少し楽しみになる一冊を。",
      href: `${root}category/notebook-paper/index.html`,
      slug: "notebook-paper",
    },
    {
      title: "贈りものを選ぶ",
      text: "大切な人へ、ちょっと嬉しいものを。",
      href: `${root}gift-guide/index.html`,
      slug: "gift-set",
    },
  ];
  const sceneSection = `<section class="p-section">
  <div class="p-container">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">シーンから探す</p>
      <h2 class="p-section__title">SCENE &amp; IDEAS</h2>
    </div>
    <div class="p-scene-grid">
      ${scenes
        .map(
          (s) => `<a class="p-scene-card p-cat-${s.slug}" href="${s.href}">
        <span class="p-scene-card__icon">${categoryIconSvg(s.slug, 2)}</span>
        <p class="p-scene-card__title">${s.title}</p>
        <p class="p-scene-card__text">${s.text}</p>
      </a>`
        )
        .join("")}
    </div>
  </div>
</section>`;

  const giftBand = `<section class="p-gift-band p-tint p-cat-gift-set">
  <div class="p-container">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">贈りもの</p>
      <h2 class="p-section__title">GIFT</h2>
    </div>
    <div class="p-gift-band__row">
      ${giftSetProducts.map((p, i) => productCardHtml(p, root, i)).join("")}
    </div>
    <div class="p-section__foot"><a class="p-btn p-btn--primary" href="${root}gift-guide/index.html">GIFT GUIDE →</a></div>
  </div>
</section>`;

  const keywordChips = [
    ["PLAYFUL", "遊び心", BRAND_HEX.orange],
    ["COLORFUL", "色彩", BRAND_HEX.blue],
    ["CREATIVE", "創造性", BRAND_HEX.green],
    ["DAILY", "日常", BRAND_HEX.yellow],
    ["DISCOVERY", "小さな発見", BRAND_HEX.pink],
  ];
  const aboutSection = `<section class="p-section">
  <div class="p-container">
    <div class="p-section__head">
      <p class="p-section__eyebrow">ブランドについて</p>
      <h2 class="p-section__title">ABOUT</h2>
    </div>
    <p class="p-about-teaser__text">いつもの毎日に、小さな発見を。書く、描く、整理する、贈る。何気ない日常の動作に、色やかたち、ちょっとしたアイデアを添えるステーショナリーと雑貨を提案するブランドです。</p>
    <div class="p-keyword-group">
      ${keywordChips
        .map(
          ([en, ja, color]) =>
            `<span class="p-keyword-chip"><span class="p-keyword-chip__dot" style="background:${color}"></span>${en} / ${ja}</span>`
        )
        .join("")}
    </div>
    <div class="p-section__foot" style="text-align:left;"><a class="p-btn p-btn--outline" href="${root}about/index.html">irohaについて →</a></div>
  </div>
</section>`;

  const newsItems = [
    { date: "2026.11.01", title: "iroha. オンラインストア リニューアルオープン" },
    { date: "2026.10.15", title: "GIFT特集ページを公開しました" },
    { date: "2026.09.01", title: "年末年始の営業についてのお知らせ" },
  ];
  const newsSection = `<section class="p-section">
  <div class="p-container">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">お知らせ</p>
      <h2 class="p-section__title">NEWS</h2>
    </div>
    <ul class="p-news-list">
      ${newsItems.map((n) => `<li><span class="p-news-date">${n.date}</span><span class="p-news-title">${n.title}</span></li>`).join("")}
    </ul>
    <div class="p-section__foot"><a class="p-btn p-btn--outline" href="${root}news/index.html">NEWS一覧 →</a></div>
  </div>
</section>`;

  const snsSection = `<section class="p-section">
  <div class="p-container">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">フォローする</p>
      <h2 class="p-section__title">FOLLOW US</h2>
    </div>
    <div class="p-sns-grid">
      ${Array.from({ length: 6 })
        .map((_, i) => `<a class="p-sns-grid__item" href="#" aria-label="Instagram投稿（ダミー）"><img src="${root}img/sns/${i + 1}.svg" alt="" aria-hidden="true" loading="lazy" width="400" height="400"></a>`)
        .join("")}
    </div>
  </div>
</section>`;

  const body = [hero, pickUpSection, categorySection, newItemsSection, sceneSection, giftBand, aboutSection, newsSection, snsSection].join(
    "\n"
  );

  writeFile(
    "index.html",
    pageShell({
      root,
      canonicalPath: "",
      title: "iroha. | STATIONERY & CREATIVE GOODS",
      description: "毎日に、彩りとアイデアを。文房具・ステーショナリー・クリエイティブ雑貨のiroha.ポートフォリオサイトです。",
      bodyHtml: body,
    })
  );
}

/* =======================================================================
   7. 一覧ページ（ALL ITEMS / カテゴリ）
   ======================================================================= */
function toolbarHtml({ showCatChips, count }) {
  const catChips = showCatChips
    ? `<div class="p-filter-chips" role="group" aria-label="カテゴリで絞り込み">
      <button type="button" class="p-filter-chip" data-filter-cat="all" aria-pressed="true">ALL</button>
      ${CATEGORY_ORDER.map((slug) => `<button type="button" class="p-filter-chip" data-filter-cat="${slug}" aria-pressed="false">${CATEGORY_BY_SLUG[slug].nameEn}</button>`).join("")}
    </div>`
    : "";
  const tagChips = `<div class="p-filter-chips" role="group" aria-label="タグで絞り込み">
      <button type="button" class="p-filter-chip" data-filter-tag="all" aria-pressed="true">ALL TAGS</button>
      ${TAG_LIST.map((t) => `<button type="button" class="p-filter-chip" data-filter-tag="${t}" aria-pressed="false">${t}</button>`).join("")}
    </div>`;

  return `<div class="p-toolbar" data-items-toolbar>
    <p class="p-toolbar__count"><span data-items-count>${count}</span>件表示中</p>
    ${catChips}
    ${tagChips}
    <label class="p-sort">並び順
      <select class="p-sort__select" data-sort-select>
        <option value="default">おすすめ</option>
        <option value="price-asc">価格が安い順</option>
        <option value="price-desc">価格が高い順</option>
      </select>
    </label>
  </div>`;
}

function buildItems() {
  const root = rootPrefix(1);
  const toolbar = toolbarHtml({ showCatChips: true, count: PRODUCTS.length });
  const cards = PRODUCTS.map((p, i) => productCardHtml(p, root, i)).join("");

  const body = `<div class="p-container p-items-page">
  ${breadcrumbHtml([{ label: "TOP", href: `${root}index.html` }, { label: "ALL ITEMS" }])}
  <div class="p-section__head">
    <p class="p-section__eyebrow">すべての商品</p>
    <h1 class="p-section__title">ALL ITEMS</h1>
  </div>
  ${toolbar}
  <div class="p-grid" data-items-grid>
    ${cards}
  </div>
  <p class="p-items-empty" data-items-empty>該当する商品が見つかりませんでした。</p>
</div>`;

  writeFile(
    "items/index.html",
    pageShell({
      root,
      canonicalPath: "items/",
      title: "ALL ITEMS | iroha.",
      description: "iroha.の全商品一覧。ノート・ペン・シール・デスク雑貨・ギフトセットをカテゴリ・タグから絞り込めます。",
      bodyHtml: body,
    })
  );
}

function buildCategoryPage(cat) {
  const root = rootPrefix(2);
  const products = PRODUCTS.filter((p) => p.category === cat.slug);
  const descriptions = {
    "notebook-paper": "書く・記録する楽しさを支える、ノートと紙もののシリーズ。",
    "pen-writing": "書き心地にこだわった、毎日使いたくなるペン・筆記具。",
    "sticker-craft": "貼る・飾る・作るをもっと楽しくする、シールとクラフト雑貨。",
    "desk-accessories": "お気に入りの道具が映える、機能的なデスクアクセサリー。",
    "gift-set": "贈る人にも贈られる人にも、ちょっと嬉しいギフト・セット。",
  };
  const toolbar = toolbarHtml({ showCatChips: false, count: products.length });
  const cards = products.map((p, i) => productCardHtml(p, root, i)).join("");

  const body = `<div class="p-cat-header p-tint p-cat-${cat.slug}">
  <div class="p-container">
    ${breadcrumbHtml([{ label: "TOP", href: `${root}index.html` }, { label: cat.nameJa }])}
    <h1 class="p-cat-header__en">${escapeHtml(cat.nameEn)}</h1>
    <span class="p-cat-header__bar" aria-hidden="true"></span>
    <p class="p-cat-header__ja">${escapeHtml(cat.nameJa)}</p>
    <p class="p-cat-header__desc">${descriptions[cat.slug]}</p>
    <p class="p-cat-header__count">${products.length}件の商品</p>
  </div>
</div>
<div class="p-container p-items-page p-cat-${cat.slug}">
  ${toolbar}
  <div class="p-grid" data-items-grid>
    ${cards}
  </div>
  <p class="p-items-empty" data-items-empty>該当する商品が見つかりませんでした。</p>
</div>`;

  writeFile(
    `category/${cat.slug}/index.html`,
    pageShell({
      root,
      canonicalPath: `category/${cat.slug}/`,
      title: `${cat.nameEn}（${cat.nameJa}） | iroha.`,
      description: `iroha.の${cat.nameJa}一覧。${descriptions[cat.slug]}`,
      bodyHtml: body,
    })
  );
}

/* =======================================================================
   8. 商品詳細ページ
   ======================================================================= */
function relatedProducts(product) {
  const sameCategory = PRODUCTS.filter((p) => p.category === product.category).sort((a, b) => (a.sku < b.sku ? -1 : 1));
  const idx = sameCategory.findIndex((p) => p.sku === product.sku);
  const related = [];
  for (let i = 1; i <= 4; i += 1) {
    related.push(sameCategory[(idx + i) % sameCategory.length]);
  }
  return related;
}

function buildProductDetail(product) {
  const root = rootPrefix(2);
  const cat = CATEGORY_BY_SLUG[product.category];
  /* セット内容リストは、specを「・」分割した各要素に数字が1つでも含まれない場合は
     （「各1点」「〜等」等の不定数表現のため）リスト化せず仕様テーブルのみにする */
  const specParts = product.spec.split("・");
  const isSet =
    (product.sku.startsWith("GS") || product.sku === "PW010") && specParts.every((part) => /\d/.test(part));
  /* ギフト提案ボックスは、ギフトタグ商品に加えGIFT&SETカテゴリ全品にも表示する */
  const isGift = product.tags.includes("ギフト") || product.category === "gift-set";

  const thumbs = ["main", "sub1", "sub2", "sub3"].map((name, i) => ({
    name,
    src: `${root}img/products/${product.sku}/${name}.svg`,
    current: i === 0,
    alt: `${product.nameJa} 画像${i + 1}`,
  }));

  const colorOptions = product.colors
    .map(
      (c, i) =>
        `<label class="p-pd__color-option"><input type="radio" name="color-${product.sku}" value="${escapeHtml(c)}" ${i === 0 ? "checked" : ""}><span>${escapeHtml(c)}</span></label>`
    )
    .join("");

  const setList = isSet
    ? `<div class="p-pd__spec" style="margin-top:var(--sp-3);">
      <p class="p-pd__block-label">セット内容</p>
      <ul class="p-pd__set-list">${specParts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>`
    : "";

  const giftBox = isGift
    ? `<div class="p-pd__gift-box">ラッピングを想定したギフト向けアイテムです。<a href="${root}gift-guide/index.html">GIFT GUIDE →</a></div>`
    : "";

  const related = relatedProducts(product);

  const body = `<div class="p-container p-cat-${product.category}">
  ${breadcrumbHtml([
    { label: "TOP", href: `${root}index.html` },
    { label: cat.nameJa, href: `${root}category/${cat.slug}/index.html` },
    { label: product.nameJa },
  ])}
  <div class="p-pd" data-pd>
    <div>
      <div class="p-pd__main-img">
        <img src="${thumbs[0].src}" alt="${escapeHtml(product.nameJa)}" data-pd-main-img width="600" height="600">
      </div>
      <div class="p-pd__thumbs">
        ${thumbs
          .map(
            (t) =>
              `<button type="button" class="p-pd__thumb" data-pd-thumb="${t.src}" aria-current="${t.current}"><img src="${t.src}" alt="${escapeHtml(t.alt)}" width="200" height="200"></button>`
          )
          .join("")}
      </div>
    </div>
    <div>
      <p class="p-pd__cat-label"><span class="p-nav__dot"></span><a href="${root}category/${cat.slug}/index.html">${escapeHtml(cat.nameEn)}</a></p>
      <div class="p-pd__title">
        <h1 class="p-pd__title-ja">${escapeHtml(product.nameJa)}</h1>
        <p class="p-pd__title-en">${escapeHtml(product.nameEn)}</p>
      </div>
      <div class="p-pd__tags">${tagChipsHtml(product.tags)}</div>
      <p class="p-pd__price">${yen(product.price)}<span class="p-pd__price-note">(税込)</span></p>
      <p class="p-pd__desc">${escapeHtml(product.description)}</p>

      <div class="p-pd__colors">
        <p class="p-pd__block-label">カラーを選ぶ</p>
        <div class="p-pd__color-options">${colorOptions}</div>
      </div>

      <div class="p-pd__spec">
        <table class="p-pd__spec-table">
          <tbody>
            <tr><th>カラー</th><td>${escapeHtml(product.colorRaw)}</td></tr>
            <tr><th>仕様</th><td>${escapeHtml(product.spec)}</td></tr>
            <tr><th>SKU</th><td>${escapeHtml(product.sku)}</td></tr>
          </tbody>
        </table>
      </div>
      ${setList}

      <div class="p-pd__qty">
        <span class="p-pd__block-label">数量</span>
        <span class="p-pd__qty-control">
          <button type="button" class="p-pd__qty-btn" data-pd-qty-minus aria-label="数量を1減らす">−</button>
          <input type="number" class="p-pd__qty-input" data-pd-qty-input value="1" min="1" max="99" inputmode="numeric" aria-label="数量">
          <button type="button" class="p-pd__qty-btn" data-pd-qty-plus aria-label="数量を1増やす">＋</button>
        </span>
      </div>

      <div class="p-pd__cta">
        <button type="button" class="p-btn p-btn--primary p-btn--block" data-pd-cart-btn>カートに入れる</button>
        <p class="p-pd__cart-msg" data-pd-cart-msg aria-live="polite"></p>
      </div>
      ${giftBox}
    </div>
  </div>

  <section class="p-related">
    <div class="p-section__head">
      <p class="p-section__eyebrow">この商品に関連する商品</p>
      <h2 class="p-section__title" style="font-size:clamp(24px,4vw,34px);">RELATED ITEMS</h2>
    </div>
    <div class="p-grid">
      ${related.map((p, i) => productCardHtml(p, root, i)).join("")}
    </div>
  </section>
</div>`;

  writeFile(
    `products/${product.sku}/index.html`,
    pageShell({
      root,
      canonicalPath: `products/${product.sku}/`,
      title: `${product.nameJa}（${product.nameEn}） | iroha.`,
      description: product.description,
      bodyHtml: body,
      ogImage: `img/products/${product.sku}/main.svg`,
    })
  );
}

/* =======================================================================
   9. ABOUT / GIFT GUIDE / NEWS / FAQ
   ======================================================================= */
function buildAbout() {
  const root = rootPrefix(1);
  const keywordChips = [
    ["PLAYFUL", "遊び心", BRAND_HEX.orange],
    ["COLORFUL", "色彩", BRAND_HEX.blue],
    ["CREATIVE", "創造性", BRAND_HEX.green],
    ["DAILY", "日常", BRAND_HEX.yellow],
    ["DISCOVERY", "小さな発見", BRAND_HEX.pink],
  ];
  const promises = [
    "明るく、前向きな気持ちを届けます。",
    "親しみやすく、だけど子どもっぽくならない品の良さを大切にします。",
    "色を楽しみながらも、派手になりすぎないバランスを心がけます。",
    "デザイン性と実用性、どちらも妥協しません。",
    "気軽に手に取れる、ちょっと特別な瞬間をつくります。",
  ];

  const body = `<div class="p-page-hero">
  <div class="p-container">
    ${breadcrumbHtml([{ label: "TOP", href: `${root}index.html` }, { label: "ABOUT" }])}
    <h1 class="p-page-hero__en">ABOUT</h1>
    <p class="p-page-hero__ja">iroha.について</p>
    <p class="p-page-hero__lead">いつもの毎日に、小さな発見を。</p>
  </div>
</div>
<div class="p-container">
  <section class="p-section">
    <p class="p-about-teaser__text">書く、描く、整理する、贈る。何気ない日常の動作に、色やかたち、ちょっとしたアイデアを添えるステーショナリーと雑貨を提案するブランドです。文房具・ステーショナリー・クリエイティブ雑貨のセレクトショップとして、自分用にもギフト用にも気の利いたアイテムをお届けします。</p>
    <div class="p-keyword-group">
      ${keywordChips
        .map(([en, ja, color]) => `<span class="p-keyword-chip"><span class="p-keyword-chip__dot" style="background:${color}"></span>${en} / ${ja}</span>`)
        .join("")}
    </div>
  </section>

  <section class="p-section">
    <div class="p-section__head">
      <p class="p-section__eyebrow">ブランドの約束</p>
      <h2 class="p-section__title" style="font-size:clamp(26px,4vw,38px);">iroha.の約束</h2>
    </div>
    <div class="p-promise-list">
      ${promises
        .map(
          (text, i) =>
            `<div class="p-promise-item"><p class="p-promise-item__num">0${i + 1}</p><p class="p-promise-item__text">${text}</p></div>`
        )
        .join("")}
    </div>
  </section>

  <section class="p-section">
    <div class="p-section__head p-section__head--center">
      <p class="p-section__eyebrow">カテゴリーから探す</p>
      <h2 class="p-section__title">CATEGORY</h2>
    </div>
    <div class="p-category-grid">
      ${CATEGORY_ORDER.map((slug) => categoryCardHtml(CATEGORY_BY_SLUG[slug], root)).join("")}
    </div>
  </section>
</div>`;

  writeFile(
    "about/index.html",
    pageShell({
      root,
      canonicalPath: "about/",
      title: "ABOUT | iroha.",
      description: "iroha.のブランドコンセプト・キーワード・約束をご紹介します。",
      bodyHtml: body,
    })
  );
}

function buildGiftGuide() {
  const root = rootPrefix(1);
  const candidates = PRODUCTS.filter((p) => p.tags.includes("ギフト") || p.category === "gift-set");
  const tiers = [
    { label: "〜¥1,000", test: (p) => p.price <= 1000 },
    { label: "〜¥3,000", test: (p) => p.price > 1000 && p.price <= 3000 },
    { label: "¥3,000〜", test: (p) => p.price > 3000 },
  ];
  const giftSetProducts = PRODUCTS.filter((p) => p.category === "gift-set");
  const addOnProducts = GIFT_ADD_ON_SKUS.map((sku) => PRODUCTS_BY_SKU[sku]);

  const tierSections = tiers
    .map((tier) => {
      const items = candidates.filter(tier.test).sort((a, b) => a.price - b.price);
      return `<div class="p-price-tier">
      <p class="p-price-tier__title">${tier.label}</p>
      <div class="p-grid">${items.map((p, i) => productCardHtml(p, root, i)).join("")}</div>
    </div>`;
    })
    .join("");

  const body = `<div class="p-page-hero p-page-hero--pink">
  <div class="p-container">
    ${breadcrumbHtml([{ label: "TOP", href: `${root}index.html` }, { label: "GIFT GUIDE" }])}
    <h1 class="p-page-hero__en">GIFT GUIDE</h1>
    <p class="p-page-hero__ja">ギフトガイド</p>
    <p class="p-page-hero__lead p-gift-lead">大切な人へ、ちょっと嬉しいものを。予算や贈る相手に合わせて、iroha.のギフトアイテムをご紹介します。</p>
  </div>
</div>
<div class="p-container">
  <section class="p-section">
    <div class="p-section__head">
      <p class="p-section__eyebrow">価格帯で選ぶ</p>
      <h2 class="p-section__title" style="font-size:clamp(26px,4vw,38px);">BUDGET</h2>
    </div>
    ${tierSections}
  </section>

  <section class="p-section p-cat-gift-set">
    <div class="p-section__head">
      <p class="p-section__eyebrow">ギフトセット</p>
      <h2 class="p-section__title" style="font-size:clamp(26px,4vw,38px);">GIFT &amp; SET</h2>
    </div>
    <div class="p-grid">${giftSetProducts.map((p, i) => productCardHtml(p, root, i)).join("")}</div>
  </section>

  <section class="p-section">
    <div class="p-section__head">
      <p class="p-section__eyebrow">添えるアイテム</p>
      <h2 class="p-section__title" style="font-size:clamp(26px,4vw,38px);">MESSAGE</h2>
    </div>
    <div class="p-grid p-add-items">${addOnProducts.map((p, i) => productCardHtml(p, root, i)).join("")}</div>
  </section>

  <p class="p-page-notice">ラッピング・のし等のギフトサービスについては、MakeShopの機能仕様確認後にご案内します（要確認）。</p>
</div>`;

  writeFile(
    "gift-guide/index.html",
    pageShell({
      root,
      canonicalPath: "gift-guide/",
      title: "GIFT GUIDE | iroha.",
      description: "価格帯別にiroha.のギフトアイテムをご紹介するギフトガイドです。",
      bodyHtml: body,
    })
  );
}

function buildNews() {
  const root = rootPrefix(1);
  const newsItems = [
    { date: "2026.11.01", title: "iroha. オンラインストア リニューアルオープン" },
    { date: "2026.10.15", title: "GIFT特集ページを公開しました" },
    { date: "2026.09.01", title: "年末年始の営業についてのお知らせ" },
  ];
  const body = `<div class="p-page-hero">
  <div class="p-container">
    ${breadcrumbHtml([{ label: "TOP", href: `${root}index.html` }, { label: "NEWS" }])}
    <h1 class="p-page-hero__en">NEWS</h1>
    <p class="p-page-hero__ja">お知らせ</p>
  </div>
</div>
<div class="p-container">
  <section class="p-section">
    <ul class="p-news-list">
      ${newsItems.map((n) => `<li><span class="p-news-date">${n.date}</span><span class="p-news-title">${n.title}</span></li>`).join("")}
    </ul>
    <p class="p-page-notice">本ページはデモ用のお知らせ一覧です。詳細ページは用意していません。</p>
  </section>
</div>`;

  writeFile(
    "news/index.html",
    pageShell({
      root,
      canonicalPath: "news/",
      title: "NEWS | iroha.",
      description: "iroha.からのお知らせ一覧です。",
      bodyHtml: body,
    })
  );
}

function buildFaq() {
  const root = rootPrefix(1);
  const faqs = [
    { q: "商品の購入はできますか？", a: "本サイトはポートフォリオ作品のデモサイトのため、実際の購入はできません。商品・価格・仕様はすべて架空の設定です。" },
    { q: "送料はいくらですか？", a: "デモサイトのため実際の送料設定はありません。実装時はMakeShop標準機能での設定を予定しています（要確認）。" },
    { q: "お届けまでの日数を教えてください。", a: "デモサイトのため実際の納期はご案内できません（要確認）。" },
    { q: "ラッピングには対応していますか？", a: "デモサイトのため、ラッピングサービスのご案内はありません。実装時はMakeShopの機能仕様確認後にご案内します（要確認）。" },
    { q: "お問い合わせ方法を教えてください。", a: "本デモサイトにはお問い合わせフォームを設置していません。実装時はMakeShop標準のお問い合わせ機能を利用予定です（要確認）。" },
  ];
  const body = `<div class="p-page-hero">
  <div class="p-container">
    ${breadcrumbHtml([{ label: "TOP", href: `${root}index.html` }, { label: "FAQ" }])}
    <h1 class="p-page-hero__en">FAQ</h1>
    <p class="p-page-hero__ja">よくあるご質問</p>
    <p class="p-page-hero__lead">本サイトはデモサイトのため、実際の販売・購入に関するご案内はありません。</p>
  </div>
</div>
<div class="p-container">
  <section class="p-section">
    ${faqs
      .map(
        (f) => `<details class="p-faq-item">
      <summary>${f.q}</summary>
      <p class="p-faq-item__a">${f.a}</p>
    </details>`
      )
      .join("")}
  </section>
</div>`;

  writeFile(
    "faq/index.html",
    pageShell({
      root,
      canonicalPath: "faq/",
      title: "FAQ | iroha.",
      description: "iroha.のよくあるご質問（デモサイト）。",
      bodyHtml: body,
    })
  );
}

/* POLICY（ご利用ガイド／特定商取引法に基づく表記／プライバシーポリシー。いずれもデモ注記付き） */
function buildPolicy() {
  const root = rootPrefix(1);
  const body = `<div class="p-page-hero">
  <div class="p-container">
    ${breadcrumbHtml([{ label: "TOP", href: `${root}index.html` }, { label: "POLICY" }])}
    <h1 class="p-page-hero__en">POLICY</h1>
    <p class="p-page-hero__ja">ご利用ガイド・特定商取引法に基づく表記・プライバシーポリシー</p>
  </div>
</div>
<div class="p-container">
  <section class="p-section" id="guide">
    <h2 class="p-section__title" style="font-size:clamp(24px,4vw,34px);">ご利用ガイド</h2>
    <p>本サイトは架空ブランド「iroha.」のポートフォリオ作品（デモサイト）です。商品の購入・会員登録・お問い合わせ等の実際の機能はなく、閲覧のみご利用いただけます。</p>
  </section>
  <section class="p-section" id="tokushoho">
    <h2 class="p-section__title" style="font-size:clamp(24px,4vw,34px);">特定商取引法に基づく表記</h2>
    <p class="p-page-notice">本サイトは架空ブランドのポートフォリオ作品であり、実在の事業者による販売は行っていません。特定商取引法に基づく表記の対象となる実際の取引が存在しないため、該当事項はありません（デモ注記）。</p>
  </section>
  <section class="p-section" id="privacy">
    <h2 class="p-section__title" style="font-size:clamp(24px,4vw,34px);">プライバシーポリシー（デモ）</h2>
    <p>本サイトはデモサイトのため、実際の個人情報の取得・利用・管理は行っていません。本ページはポートフォリオ上の構成として設置しています。</p>
  </section>
</div>`;

  writeFile(
    "policy/index.html",
    pageShell({
      root,
      canonicalPath: "policy/",
      title: "POLICY | iroha.",
      description: "iroha.のご利用ガイド・特定商取引法に基づく表記・プライバシーポリシー（デモ）。",
      bodyHtml: body,
    })
  );
}

/* =======================================================================
   10. 実行
   ======================================================================= */
function main() {
  console.log("iroha. サイトビルド開始...");

  PRODUCTS.forEach(buildProductImages);
  buildSnsImages();

  buildTop();
  buildItems();
  CATEGORIES.forEach(buildCategoryPage);
  PRODUCTS.forEach(buildProductDetail);
  buildAbout();
  buildGiftGuide();
  buildNews();
  buildFaq();
  buildPolicy();

  console.log(`生成完了: 商品${PRODUCTS.length}件 / カテゴリ${CATEGORIES.length}件`);
}

main();
