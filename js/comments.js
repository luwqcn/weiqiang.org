/* ============================================================
comments.js — 文章末尾那块「评论 / 网络提及」
标签切换是纯 CSS（radio + 兄弟选择器），这个脚本只管三件事：
1. 标签被选中（或本来就是默认项）时才去加载那一栏 —— 没被选中的
面板是 display:none，可组件脚本照样会下载，所以不能提前注入；
2. LiteCWD：注入组件脚本、挂载、跟随站点深浅色、折算标签上的条数；
3. 网络提及：读 webmention.io 的公开 API，画成头像 + 条目列表。
配置从 #comments 的 data-* 上读，构建时由 weborg-site.el 写进去。
页面上没有 #comments（列表页、单页）时，整段直接退出。
============================================================ */
(function () {
'use strict';
var root = document.getElementById('comments');
if (!root) { return; }
var data = root.dataset || {};
function node(tag, cls, text) {
var n = document.createElement(tag);
if (cls) { n.className = cls; }
if (text != null) { n.textContent = text; }
return n;
}
/* 提及内容来自别人的站点：只放行 http(s)，其余一律不给 href */
function safeUrl(v) {
return (typeof v === 'string' && /^https?:\/\//i.test(v)) ? v : '';
}
function checkedTab(id) {
var el = document.getElementById(id);
return el && el.checked ? el : null;
}
/* ---------------- 网络提及 ---------------- */
(function webmention() {
var box = document.getElementById('webmentions');
if (!box || !window.fetch) { return; }
var target = box.getAttribute('data-target') || data.wmTarget;
if (!target) { return; }
var tab = document.getElementById('ct-webmention');
var badge = root.querySelector('[data-count-webmention]');
var reactEl = box.querySelector('.wm-reactions');
var listEl = box.querySelector('.wm-list');
var emptyEl = box.querySelector('.wm-empty');
var loadingEl = box.querySelector('.wm-loading');
var loaded = false;
var TYPES = {
'in-reply-to': '回复',
'mention-of': '提及',
'like-of': '赞',
'repost-of': '转发',
'bookmark-of': '收藏',
'rsvp': '回应'
};
var REACTIONS = ['like-of', 'repost-of', 'bookmark-of', 'rsvp'];
function author(item) { return item.author || {}; }
function authorName(item) {
var a = author(item);
return a.name || a.nickname || '匿名';
}
function link(href, cls, text) {
var a = node('a', cls, text);
a.href = href;
a.rel = 'nofollow noopener ugc';
a.target = '_blank';
return a;
}
function avatar(item) {
var a = author(item);
var name = authorName(item);
var photo = safeUrl(a.photo);
var box;
if (photo) {
box = document.createElement('img');
box.src = photo;
box.alt = name;
box.loading = 'lazy';
box.referrerPolicy = 'no-referrer';
} else {
box = node('span', 'wm-noavatar', name.slice(0, 1));
}
var href = safeUrl(item.url) || safeUrl(a.url);
if (!href) { return box; }
var wrap = link(href, '', null);
wrap.title = name;
wrap.appendChild(box);
return wrap;
}
function stamp(item) {
return item.published || item['wm-received'] || '';
}
function row(item) {
var li = node('li', 'wm-item');
var av = node('div', 'wm-avatar');
av.appendChild(avatar(item));
li.appendChild(av);
var body = node('div', 'wm-body');
var head = node('div', 'wm-head');
var name = authorName(item);
var href = safeUrl(item.url) || safeUrl(author(item).url);
head.appendChild(href ? link(href, 'wm-author', name) : node('span', 'wm-author', name));
head.appendChild(node('span', 'wm-type', TYPES[item['wm-property']] || ''));
var when = stamp(item);
if (when) {
var t = document.createElement('time');
t.className = 'wm-date';
t.dateTime = when;
t.textContent = String(when).slice(0, 10);
head.appendChild(t);
}
body.appendChild(head);
var text = String((item.content || {}).text || '').trim();
if (text) {
if (text.length > 400) { text = text.slice(0, 400) + '…'; }
body.appendChild(node('p', 'wm-text', text));
}
li.appendChild(body);
return li;
}
function draw(res) {
if (loadingEl) { loadingEl.hidden = true; }
var items = (res && res.children) || [];
var reactions = [];
var responses = [];
items.forEach(function (item) {
(REACTIONS.indexOf(item['wm-property']) > -1 ? reactions : responses).push(item);
});
if (badge) {
badge.textContent = String(items.length);
badge.hidden = !items.length;
}
if (!items.length) {
if (emptyEl) { emptyEl.hidden = false; }
return;
}
if (reactions.length) {
reactEl.hidden = false;
reactEl.appendChild(node('span', 'wm-reactions-label',
reactions.length + ' 个赞 / 转发'));
reactions.forEach(function (item) { reactEl.appendChild(avatar(item)); });
}
if (responses.length) {
listEl.hidden = false;
responses.sort(function (a, b) {
return new Date(stamp(b) || 0) - new Date(stamp(a) || 0);
});
responses.forEach(function (item) { listEl.appendChild(row(item)); });
}
}
function load() {
if (loaded) { return; }
loaded = true;
if (loadingEl) { loadingEl.hidden = false; }
var url = 'https://webmention.io/api/mentions.jf2?target=' +
encodeURIComponent(target) + '&per-page=200';
fetch(url, { credentials: 'omit' })
.then(function (r) { return r.ok ? r.json() : null; })
.then(function (res) {
if (res) { draw(res); }
else if (loadingEl) { loadingEl.hidden = true; }
})
.catch(function () {
/* 拉不到就静默停在空态，别写「还没有提及」误导人 */
if (loadingEl) { loadingEl.hidden = true; }
});
}
if (tab) {
tab.addEventListener('change', function () { if (tab.checked) { load(); } });
if (tab.checked) { load(); }
}
})();
/* ---------------- LiteCWD（Cloudflare Workers Discuss）---------------- */
(function litecwd() {
var mountEl = document.getElementById('litecwd-comments');
if (!mountEl) { return; }
var api = (data.litecwdApi || '').replace(/\/+$/, '');
if (!api) {
mountEl.innerHTML =
'<p class="comments-disabled">评论还没接上：在 weborg-site.el 的 ' +
'<code>weborg-litecwd-api</code> 里填 LiteCWD 的 API 地址。</p>';
return;
}
var config = {
apiBaseUrl: api,
postSlug: data.litecwdSlug || location.pathname,
lang: data.litecwdLang || 'zh-CN',
pageSize: parseInt(data.litecwdPageSize, 10) || 20,
commentPlaceholder: data.litecwdPlaceholder || '写下你的评论...'
};
if (data.litecwdSite) { config.siteId = data.litecwdSite; }
if (data.litecwdCss) { config.customCssUrl = data.litecwdCss; }
var themeMode = data.litecwdTheme || 'auto';
var scriptUrl = data.litecwdCdn ||
'https://cwd.weiqiang.org/litecwd.js';
var tab = document.getElementById('ct-comments');
var badge = root.querySelector('[data-count-comments]');
var instance = null;
var loading = false;
/* 组件脚本 + /api/config 冷启动加起来能到几秒，这期间面板是空的。
先摆一句「正在加载评论」，等组件真画出东西再收走。 */
var loader = document.getElementById('litecwd-loading');
var slowTimer = null;
var hardTimer = null;
function clearTimers() {
if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
if (hardTimer) { clearTimeout(hardTimer); hardTimer = null; }
}
function stopLoading() {
if (!loader) { return; }
var el = loader;
loader = null;
clearTimers();
el.classList.add('is-done');
window.setTimeout(function () {
if (el.parentNode) { el.parentNode.removeChild(el); }
}, 260);
}
function startSlowHint() {
if (slowTimer || !loader) { return; }
slowTimer = window.setTimeout(function () {
var t = loader && loader.querySelector('.litecwd-loading-text');
if (t) { t.textContent = '评论加载有点慢，请稍候'; }
}, 12000);
/* API 那边要是整个不通（Worker 挂着、DNS 打不通），组件会挂上一个空
容器就再没动静，占位就一直转。兜个底：20 秒还没画出东西就换个说法，
组件本身不拆——它万一后来连上了，照样能自己补上来。 */
hardTimer = window.setTimeout(function () {
if (!loader) { return; }
var t = loader.querySelector('.litecwd-loading-text');
var dots = loader.querySelector('.litecwd-loading-dots');
if (t) { t.textContent = '评论暂时加载不出来，请稍后刷新重试。'; }
if (dots) { dots.hidden = true; }
}, 20000);
}
function isDark() {
return document.documentElement.getAttribute('data-theme') === 'dark';
}
function resolvedTheme() {
return themeMode === 'auto' ? (isDark() ? 'dark' : 'light') : themeMode;
}
/* 组件的列表接口用下划线小写（post_slug / site_id），条数跟着它走。 */
function showCount() {
if (!badge) { return; }
var url = config.apiBaseUrl + '/api/comments?limit=1&post_slug=' +
encodeURIComponent(config.postSlug);
if (config.siteId) { url += '&site_id=' + encodeURIComponent(config.siteId); }
fetch(url, { credentials: 'omit' })
.then(function (r) { return r.ok ? r.json() : null; })
.then(function (res) {
var p = res && res.pagination;
if (!p) { return; }
var n = p.totalCount != null ? p.totalCount : p.total;
if (n) { badge.textContent = String(n); badge.hidden = false; }
})
.catch(function () { /* 拿不到就不显示，别挂一个假的 0 */ });
}
/* 组件把「昵称 *」画成输入框上方的 <label>。这里把文案挪进 placeholder：
读标签文字 → 压掉 * 前的空格 → 写进 placeholder 与 aria-label → 收起
label。组件重渲染会重建 label，所以用 MutationObserver 盯着。 */
function foldLabel(text) {
return (text || '').replace(/\s+/g, ' ').replace(/\s*\*\s*/g, '*').trim();
}
function foldLabels(sr) {
var fields = sr.querySelectorAll('.litecwd-form-field');
for (var i = 0; i < fields.length; i++) {
var field = fields[i];
var label = field.querySelector('label');
var input = field.querySelector('input, textarea');
if (!label || !input) { continue; }
var text = foldLabel(label.textContent);
if (text) {
if (input.getAttribute('placeholder') !== text) {
input.setAttribute('placeholder', text);
}
if (!input.getAttribute('aria-label')) {
input.setAttribute('aria-label', text);
}
}
if (label.style.display !== 'none') { label.style.display = 'none'; }
}
}
function watchLabels() {
var sr = mountEl.shadowRoot;
if (!sr) { return; }
/* 组件自己也会画一句「加载中」；只要 shadow DOM 里有东西落地，
外面那句占位就该收了，别让读者看两遍。 */
function settle() {
if (sr.querySelector('.litecwd-loading, .litecwd-comment-list, .litecwd-comment-form, .litecwd-empty, .litecwd-error')) {
stopLoading();
}
}
foldLabels(sr);
settle();
new MutationObserver(function () { foldLabels(sr); settle(); })
.observe(sr, { childList: true, subtree: true });
}
function mount(retry) {
if (instance) { return; }
if (typeof window.LiteCWDComments === 'undefined') {
/* 脚本 onload 偶尔早于 UMD 赋值落地，留几次重试兜底 */
if ((retry || 0) < 10) {
window.setTimeout(function () { mount((retry || 0) + 1); }, 50);
return;
}
stopLoading();
mountEl.innerHTML =
'<p class="comments-disabled">评论组件未能初始化，刷新页面重试。</p>';
return;
}
var cfg = {};
for (var k in config) {
if (Object.prototype.hasOwnProperty.call(config, k)) { cfg[k] = config[k]; }
}
cfg.el = mountEl;
cfg.theme = resolvedTheme();
instance = new window.LiteCWDComments(cfg);
instance.mount();
watchLabels();
showCount();
}
function load() {
if (loading) { return; }
loading = true;
startSlowHint();
if (typeof window.LiteCWDComments !== 'undefined') { mount(); return; }
var s = document.createElement('script');
s.src = scriptUrl;
s.async = true;
s.onload = mount;
s.onerror = function () {
stopLoading();
mountEl.innerHTML =
'<p class="comments-disabled">评论加载失败，检查网络后刷新重试。</p>';
};
document.head.appendChild(s);
}
if (tab) {
tab.addEventListener('change', function () { if (tab.checked) { load(); } });
if (tab.checked) { load(); }
} else {
load();
}
if (themeMode === 'auto') {
new MutationObserver(function () {
if (instance) { instance.updateConfig({ theme: resolvedTheme() }); }
}).observe(document.documentElement, {
attributes: true,
attributeFilter: ['data-theme']
});
}
})();
})();