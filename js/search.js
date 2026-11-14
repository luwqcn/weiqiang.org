(function () {
"use strict";
var page = document.querySelector(".search-page");
if (!page) return;
var input = document.getElementById("search-input");
var statusEl = document.getElementById("search-status");
var listEl = document.getElementById("search-results");
var indexUrl = page.getAttribute("data-index");
if (!input || !statusEl || !listEl || !indexUrl) return;
var docs = null;
var failed = false;
function escapeRe(s) {
return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function terms(q) {
return q
.toLowerCase()
.split(/\s+/)
.filter(function (t) {
return t.length > 0;
});
}
function highlight(text, ts) {
var frag = document.createDocumentFragment();
if (!ts.length) {
frag.appendChild(document.createTextNode(text));
return frag;
}
var re = new RegExp("(" + ts.map(escapeRe).join("|") + ")", "gi");
var last = 0;
var m;
while ((m = re.exec(text)) !== null) {
if (!m[0]) {
re.lastIndex += 1;
continue;
}
if (m.index > last) {
frag.appendChild(document.createTextNode(text.slice(last, m.index)));
}
var mark = document.createElement("mark");
mark.textContent = m[0];
frag.appendChild(mark);
last = m.index + m[0].length;
}
if (last < text.length) {
frag.appendChild(document.createTextNode(text.slice(last)));
}
return frag;
}
function snippet(doc, ts) {
var src = (doc.c || "").replace(/\s+/g, " ").trim();
if (!src) return "";
var at = -1;
var lower = src.toLowerCase();
ts.forEach(function (t) {
var i = lower.indexOf(t);
if (i > -1 && (at < 0 || i < at)) at = i;
});
if (at < 0) {
return src.length > 140 ? src.slice(0, 140) + "…" : src;
}
var start = Math.max(0, at - 40);
if (start > 0) {
var floor = Math.max(0, at - 70);
for (var i = start; i > floor; i--) {
if (/[。！？；：，、\s”」』）]/.test(src.charAt(i))) {
start = i + 1;
break;
}
}
}
var end = Math.min(src.length, at + 110);
return (
(start > 0 ? "…" : "") +
src.slice(start, end) +
(end < src.length ? "…" : "")
);
}
function search(q) {
var ts = terms(q);
if (!ts.length) {
return docs.slice(0, 20).map(function (d) {
return { doc: d, score: 0, ts: [] };
});
}
var hits = [];
docs.forEach(function (d) {
var title = (d.t || "").toLowerCase();
var tagsText = (d.g || []).join(" ").toLowerCase();
var body = (d.c || "").toLowerCase();
var sum = body.slice(0, 300);
var score = 0;
var all = true;
for (var i = 0; i < ts.length; i++) {
var t = ts[i];
var hit = false;
if (title.indexOf(t) > -1) {
score += title === t ? 24 : 12;
hit = true;
}
if (tagsText.indexOf(t) > -1) {
score += 5;
hit = true;
}
if (sum.indexOf(t) > -1) {
score += 3;
hit = true;
}
if (body.indexOf(t) > -1) {
score += 1;
hit = true;
}
if (!hit) {
all = false;
break;
}
}
if (all) hits.push({ doc: d, score: score, ts: ts });
});
hits.sort(function (a, b) {
if (b.score !== a.score) return b.score - a.score;
return (b.doc.d || "").localeCompare(a.doc.d || "");
});
return hits;
}
function render(q) {
if (failed) {
statusEl.textContent = "索引载入失败，刷新页面试试。";
return;
}
if (!docs) return;
var hits = search(q);
listEl.textContent = "";
if (!terms(q).length) {
statusEl.textContent =
"共 " + docs.length + " 篇。输入关键词开始，按 / 可随时回到这里。";
} else if (!hits.length) {
statusEl.textContent = "没有匹配「" + q.trim() + "」的内容。";
return;
} else {
statusEl.textContent = "找到 " + hits.length + " 篇";
}
var frag = document.createDocumentFragment();
hits.forEach(function (h) {
var d = h.doc;
var li = document.createElement("li");
li.className = "search-item";
var a = document.createElement("a");
a.className = "search-item-title";
a.href = d.u;
a.appendChild(highlight(d.t || "", h.ts));
var meta = document.createElement("p");
meta.className = "search-item-meta";
var bits = [];
if (d.d) bits.push(d.d);
if (d.s) bits.push(d.s);
if (d.g && d.g.length) bits.push(d.g.slice(0, 2).join(" · "));
meta.textContent = bits.join(" · ");
var snip = document.createElement("p");
snip.className = "search-item-snippet";
snip.appendChild(highlight(snippet(d, h.ts), h.ts));
li.appendChild(a);
li.appendChild(meta);
li.appendChild(snip);
frag.appendChild(li);
});
listEl.appendChild(frag);
}
var timer = null;
function schedule() {
window.clearTimeout(timer);
timer = window.setTimeout(function () {
var q = input.value;
render(q);
syncUrl(q);
}, 110);
}
function syncUrl(q) {
if (!window.history || !window.history.replaceState) return;
var url = window.location.pathname;
if (q.trim()) url += "?q=" + encodeURIComponent(q.trim());
try {
window.history.replaceState(null, "", url);
} catch (e) {}
}
input.addEventListener("input", schedule);
input.addEventListener("keydown", function (e) {
if (e.key === "Escape") {
input.value = "";
render("");
syncUrl("");
}
});
document.addEventListener("keydown", function (e) {
if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
var el = document.activeElement || {};
if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
e.preventDefault();
input.focus();
input.select();
});
var initial = "";
try {
initial = new URLSearchParams(window.location.search).get("q") || "";
} catch (e) {}
statusEl.textContent = "正在载入索引…";
fetch(indexUrl, { credentials: "same-origin" })
.then(function (r) {
if (!r.ok) throw new Error(String(r.status));
return r.json();
})
.then(function (data) {
docs = Array.isArray(data) ? data : [];
if (initial) input.value = initial;
render(initial);
if (!initial) input.focus();
})
.catch(function () {
failed = true;
render("");
});
})();