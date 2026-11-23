/*
 * iroha. ポートフォリオECサイト — 共通JS
 * 以下4機能のみを担当する。JSが無効でも閲覧（リンク遷移・情報表示）は成立する
 * プログレッシブエンハンスメント構成とする。
 *   1. SPメニューの開閉（<details> をベースに、リンク押下時に閉じる挙動を補強）
 *   2. 一覧ページのタグ絞り込み・並び順
 *   3. 詳細ページの画像切替・数量±
 *   4. カート（デモ）ボタン押下時のインラインメッセージ
 */
(function () {
  "use strict";

  /* 1. SPメニュー：開閉状態をaria-expandedに反映し、閉じるボタン・リンク押下で閉じる -------------------- */
  function initSpMenu() {
    var menu = document.querySelector(".p-spmenu");
    if (!menu) return;
    var summary = menu.querySelector("summary");
    function syncExpanded() {
      if (summary) summary.setAttribute("aria-expanded", String(menu.hasAttribute("open")));
    }
    menu.addEventListener("toggle", syncExpanded);
    var closeBtn = menu.querySelector("[data-spmenu-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        menu.removeAttribute("open");
      });
    }
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        menu.removeAttribute("open");
      });
    });
  }

  /* CATEGORYドロップダウン：hover/focusの開閉状態をaria-expandedへ反映する（表示自体はCSSのhover/focus-withinで制御） */
  function initCategoryDropdown() {
    var dropdowns = document.querySelectorAll(".p-nav__dropdown");
    dropdowns.forEach(function (dropdown) {
      var toggle = dropdown.querySelector(".p-nav__dropdown-toggle");
      if (!toggle) return;
      function open() { toggle.setAttribute("aria-expanded", "true"); }
      function close() { toggle.setAttribute("aria-expanded", "false"); }
      dropdown.addEventListener("mouseenter", open);
      dropdown.addEventListener("mouseleave", close);
      dropdown.addEventListener("focusin", open);
      dropdown.addEventListener("focusout", function (e) {
        if (!dropdown.contains(e.relatedTarget)) close();
      });
    });
  }

  /* 2. 一覧ページ：タグ絞り込み・並び順 --------------------------------- */
  function initItemsToolbar() {
    var toolbar = document.querySelector("[data-items-toolbar]");
    var grid = document.querySelector("[data-items-grid]");
    if (!toolbar || !grid) return;

    var catChips = Array.prototype.slice.call(toolbar.querySelectorAll("[data-filter-cat]"));
    var tagChips = Array.prototype.slice.call(toolbar.querySelectorAll("[data-filter-tag]"));
    var sortSelect = toolbar.querySelector("[data-sort-select]");
    var cards = Array.prototype.slice.call(grid.querySelectorAll("[data-card]"));
    var countEl = document.querySelector("[data-items-count]");
    var emptyEl = document.querySelector("[data-items-empty]");

    var state = { cat: "all", tag: "all" };

    function applyFilter() {
      var visible = 0;
      cards.forEach(function (card) {
        var matchCat = state.cat === "all" || card.dataset.cat === state.cat;
        var matchTag = state.tag === "all" || (card.dataset.tags || "").split(",").indexOf(state.tag) !== -1;
        var show = matchCat && matchTag;
        card.style.display = show ? "" : "none";
        if (show) visible += 1;
      });
      if (countEl) countEl.textContent = visible;
      if (emptyEl) emptyEl.style.display = visible === 0 ? "block" : "none";
    }

    function applySort() {
      if (!sortSelect) return;
      var mode = sortSelect.value;
      var sorted = cards.slice();
      if (mode === "price-asc") {
        sorted.sort(function (a, b) { return Number(a.dataset.price) - Number(b.dataset.price); });
      } else if (mode === "price-desc") {
        sorted.sort(function (a, b) { return Number(b.dataset.price) - Number(a.dataset.price); });
      } else {
        sorted.sort(function (a, b) { return Number(a.dataset.order) - Number(b.dataset.order); });
      }
      sorted.forEach(function (card) { grid.appendChild(card); });
    }

    catChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.cat = chip.dataset.filterCat;
        catChips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
        applyFilter();
      });
    });

    tagChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.tag = chip.dataset.filterTag;
        tagChips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
        applyFilter();
      });
    });

    if (sortSelect) {
      sortSelect.addEventListener("change", applySort);
    }
  }

  /* 3. 商品詳細：画像切替・数量± --------------------------------------- */
  function initProductDetail() {
    var pd = document.querySelector("[data-pd]");
    if (!pd) return;

    var mainImg = pd.querySelector("[data-pd-main-img]");
    var thumbs = Array.prototype.slice.call(pd.querySelectorAll("[data-pd-thumb]"));
    thumbs.forEach(function (thumb) {
      thumb.addEventListener("click", function () {
        if (!mainImg) return;
        mainImg.setAttribute("src", thumb.dataset.pdThumb);
        thumbs.forEach(function (t) { t.setAttribute("aria-current", String(t === thumb)); });
      });
    });

    var qtyInput = pd.querySelector("[data-pd-qty-input]");
    var minusBtn = pd.querySelector("[data-pd-qty-minus]");
    var plusBtn = pd.querySelector("[data-pd-qty-plus]");
    function clampQty(value) {
      var n = parseInt(value, 10);
      if (isNaN(n) || n < 1) n = 1;
      if (n > 99) n = 99;
      return n;
    }
    if (minusBtn && qtyInput) {
      minusBtn.addEventListener("click", function () {
        qtyInput.value = clampQty(Number(qtyInput.value) - 1);
      });
    }
    if (plusBtn && qtyInput) {
      plusBtn.addEventListener("click", function () {
        qtyInput.value = clampQty(Number(qtyInput.value) + 1);
      });
    }
    if (qtyInput) {
      qtyInput.addEventListener("change", function () {
        qtyInput.value = clampQty(qtyInput.value);
      });
    }

    /* 4. カート（デモ）ボタン：インラインメッセージ表示 ------------------ */
    var cartBtn = pd.querySelector("[data-pd-cart-btn]");
    var cartMsg = pd.querySelector("[data-pd-cart-msg]");
    if (cartBtn && cartMsg) {
      cartBtn.addEventListener("click", function () {
        cartMsg.textContent = "※ポートフォリオ作品のため購入はできません";
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initSpMenu();
    initCategoryDropdown();
    initItemsToolbar();
    initProductDetail();
  });
})();
