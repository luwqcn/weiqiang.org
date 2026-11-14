/* weborg · main.js —— 只做几件小事：切主题、画进度、点亮目录、展开锚点指向的年份 */
(function () {
"use strict";
var root = document.documentElement;
var KEY = "paper-theme";
var toggle = document.querySelector(".theme-toggle");
if (toggle) {
toggle.addEventListener("click", function () {
var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
root.setAttribute("data-theme", next);
try {
localStorage.setItem(KEY, next);
} catch (e) {}
toggle.setAttribute("aria-label", next === "dark" ? "切换到亮色" : "切换到暗色");
});
}
var navBtn = document.querySelector(".nav-toggle");
var navPanel = document.getElementById("nav-panel");
var panelOpen = function (open) {
if (!navBtn || !navPanel) return;
navBtn.setAttribute("aria-expanded", open ? "true" : "false");
navPanel.classList.toggle("is-open", open);
};
if (navBtn && navPanel) {
navBtn.addEventListener("click", function () {
panelOpen(navBtn.getAttribute("aria-expanded") !== "true");
});
document.addEventListener("click", function (e) {
if (navBtn.getAttribute("aria-expanded") !== "true") return;
if (navBtn.contains(e.target) || navPanel.contains(e.target)) return;
panelOpen(false);
});
document.addEventListener("keydown", function (e) {
if (e.key === "Escape" && navBtn.getAttribute("aria-expanded") === "true") {
panelOpen(false);
navBtn.focus();
}
});
window.addEventListener("resize", function () {
if (window.innerWidth > 640) panelOpen(false);
});
}
var bar = document.querySelector(".progress");
if (bar) {
var ticking = false;
var update = function () {
var h = document.documentElement;
var max = h.scrollHeight - h.clientHeight;
var ratio = max > 0 ? h.scrollTop / max : 0;
bar.style.width = Math.min(1, Math.max(0, ratio)) * 100 + "%";
ticking = false;
};
window.addEventListener(
"scroll",
function () {
if (!ticking) {
ticking = true;
window.requestAnimationFrame(update);
}
},
{ passive: true }
);
update();
}
var tocBox = document.querySelector(".toc");
var links = Array.prototype.slice.call(
document.querySelectorAll('.toc a[href^="#"], #table-of-contents a[href^="#"]')
);
if (links.length && window.IntersectionObserver) {
var map = {};
links.forEach(function (a) {
var id = decodeURIComponent(a.getAttribute("href").slice(1));
if (!document.getElementById(id)) return;
(map[id] = map[id] || []).push(a);
});
var headings = Object.keys(map).map(function (id) {
return document.getElementById(id);
});
var current = null;
var observer = new IntersectionObserver(
function (entries) {
entries.forEach(function (entry) {
if (!entry.isIntersecting) return;
var group = map[entry.target.id];
if (!group || group === current) return;
if (current) {
current.forEach(function (l) {
l.classList.remove("is-active");
});
}
group.forEach(function (l) {
l.classList.add("is-active");
});
current = group;
if (!tocBox || tocBox.scrollHeight <= tocBox.clientHeight + 4) return;
var link = group[0];
var lr = link.getBoundingClientRect();
var br = tocBox.getBoundingClientRect();
if (lr.top >= br.top + 8 && lr.bottom <= br.bottom - 8) return;
tocBox.scrollTo({
top: tocBox.scrollTop + (lr.top - br.top) - br.height / 3,
behavior: "smooth"
});
});
},
{ rootMargin: "-10% 0px -70% 0px", threshold: 0 }
);
headings.forEach(function (h) {
observer.observe(h);
});
}
var openHashGroup = function () {
var id = decodeURIComponent((window.location.hash || "").slice(1));
if (!id) return;
var el = document.getElementById(id);
if (!el || el.tagName !== "DETAILS") return;
el.open = true;
};
if (document.querySelector("details.year-group")) {
openHashGroup();
window.addEventListener("hashchange", openHashGroup);
}
var host = location.host;
document.querySelectorAll("main a[href]").forEach(function (a) {
var href = a.getAttribute("href");
if (!href || href.charAt(0) === "#") return;
if (/^(mailto|tel|javascript):/i.test(href)) return;
try {
var u = new URL(href, location.href);
if (u.host && u.host !== host) {
a.setAttribute("target", "_blank");
a.setAttribute("rel", "noopener noreferrer");
}
} catch (e) {
/* 相对路径解析失败就算了 */
}
});
})();