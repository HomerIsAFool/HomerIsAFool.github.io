/* ==========================================================================
   τ₀-VLA 论文阅读报告 — 交互脚本
   零依赖。四件事：阅读进度条、目录高亮、移动端抽屉、极简代码着色。
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------- 1. 阅读进度条 ---------------- */
  var progress = document.getElementById("progress");
  var topBtn = document.getElementById("top-btn");

  function onScroll() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - doc.clientHeight;
    var pct = scrollable > 0 ? (doc.scrollTop / scrollable) * 100 : 0;
    progress.style.width = pct + "%";

    if (doc.scrollTop > 600) {
      topBtn.classList.add("show");
    } else {
      topBtn.classList.remove("show");
    }
  }

  topBtn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  /* ---------------- 2. 目录高亮（IntersectionObserver） ----------------
     用 rootMargin 把"判定线"放在视口上方 ~30% 处，这样高亮切换的时机
     和读者的实际阅读位置一致，而不是等章节滚出视口才切。 */
  var links = Array.prototype.slice.call(
    document.querySelectorAll("#toc a")
  );
  var targets = links
    .map(function (a) {
      return document.querySelector(a.getAttribute("href"));
    })
    .filter(Boolean);

  var visible = new Set();

  function refreshActive() {
    // 在所有当前可见的标题中，取文档顺序最靠前的那个作为 active
    var best = null;
    var bestTop = Infinity;
    visible.forEach(function (el) {
      var top = el.getBoundingClientRect().top;
      if (top < bestTop) {
        bestTop = top;
        best = el;
      }
    });

    if (!best) return;
    var id = best.id;
    links.forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("href") === "#" + id);
    });
  }

  if ("IntersectionObserver" in window && targets.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        });
        refreshActive();
      },
      { rootMargin: "-72px 0px -68% 0px", threshold: 0 }
    );
    targets.forEach(function (t) {
      io.observe(t);
    });
  }

  /* 兜底：滚到最底部时强制高亮最后一项（末章太短可能无法触发观察器） */
  function bottomFallback() {
    var doc = document.documentElement;
    if (doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 4) {
      links.forEach(function (a) {
        a.classList.remove("active");
      });
      links[links.length - 1].classList.add("active");
    }
  }

  window.addEventListener(
    "scroll",
    function () {
      onScroll();
      bottomFallback();
    },
    { passive: true }
  );
  onScroll();

  /* ---------------- 3. 移动端目录抽屉 ---------------- */
  var sidebar = document.getElementById("sidebar");
  var menuBtn = document.getElementById("menu-btn");

  menuBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    sidebar.classList.toggle("open");
  });

  // 点击目录项后自动收起
  links.forEach(function (a) {
    a.addEventListener("click", function () {
      sidebar.classList.remove("open");
    });
  });

  // 点击正文区域收起抽屉
  document.addEventListener("click", function (e) {
    if (
      sidebar.classList.contains("open") &&
      !sidebar.contains(e.target) &&
      e.target !== menuBtn
    ) {
      sidebar.classList.remove("open");
    }
  });

  // Esc 关闭
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") sidebar.classList.remove("open");
  });

  /* ---------------- 4. 极简语法着色 ----------------
     只处理 Python / Bash / 纯文本三类，够用即止。
     实现方式：先转义 HTML，再按 注释 → 字符串 → 数字 → 关键字 的顺序
     替换。注释与字符串先被包进 span，后续规则通过“跳过已在标签内的文本”
     的正则边界来避免二次污染。 */

  var PY_KW = [
    "def", "class", "return", "if", "elif", "else", "for", "while", "in",
    "is", "not", "and", "or", "None", "True", "False", "import", "from",
    "as", "with", "try", "except", "raise", "lambda", "self", "yield",
    "assert", "pass", "break", "continue", "global", "await", "async"
  ];

  var BASH_KW = [
    "git", "cd", "bash", "python", "python3", "export", "echo", "cat",
    "if", "then", "fi", "for", "do", "done", "sudo", "pip"
  ];

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlight(code, lang) {
    var src = escapeHtml(code);
    var slots = [];

    // 用占位符把注释和字符串"抠"出来，避免后续规则误伤其内容
    function stash(html) {
      slots.push(html);
      return "\u0000" + (slots.length - 1) + "\u0000";
    }

    // 注释：# 到行尾
    src = src.replace(/#[^\n]*/g, function (m) {
      return stash('<span class="tok-com">' + m + "</span>");
    });

    // 字符串：单引号 / 双引号（含 f-string 前缀）
    src = src.replace(/(f?)("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g, function (
      m
    ) {
      return stash('<span class="tok-str">' + m + "</span>");
    });

    if (lang !== "text") {
      // 数字
      src = src.replace(/\b(\d+\.?\d*(?:e-?\d+)?)\b/g, '<span class="tok-num">$1</span>');

      // 关键字
      var kws = lang === "bash" ? BASH_KW : PY_KW;
      var kwRe = new RegExp("\\b(" + kws.join("|") + ")\\b", "g");
      src = src.replace(kwRe, '<span class="tok-kw">$1</span>');

      // 函数调用名
      src = src.replace(
        /\b([A-Za-z_][A-Za-z0-9_]*)(\s*\()/g,
        '<span class="tok-fn">$1</span>$2'
      );
    }

    // 还原占位符
    src = src.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return slots[Number(i)];
    });

    return src;
  }

  document.querySelectorAll("pre > code").forEach(function (el) {
    var cls = el.className || "";
    var lang = "text";
    if (/lang-py/.test(cls)) lang = "py";
    else if (/lang-bash/.test(cls)) lang = "bash";

    el.innerHTML = highlight(el.textContent, lang);
  });

  /* ---------------- 5. 标题锚点（点击 h2/h3 复制链接） ---------------- */
  document.querySelectorAll("section[id]").forEach(function (sec) {
    var h = sec.querySelector("h2");
    if (!h) return;
    h.style.cursor = "pointer";
    h.title = "点击复制本节链接";
    h.addEventListener("click", function () {
      var url = location.origin + location.pathname + "#" + sec.id;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url);
      }
      location.hash = "#" + sec.id;
    });
  });
})();
