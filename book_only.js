// 单独测试：只点「立即预约」（包含匹配 + 坐标点击）
// 用法：先手动切到约课页、选好时段，再运行

"use strict";

auto.waitFor();

var KEYWORD     = "立即预约";
var DURATION_MS = 0;     // 0=只点一次；>0 重复点
var INTERVAL_MS = 200;
var FIND_MS     = 1500;

/** 收集所有 text/desc 包含 keyword 的控件 */
function findAllContaining(keyword) {
    var seen = {};
    var out = [];
    var lists = [textContains(keyword).find(), descContains(keyword).find()];
    for (var i = 0; i < lists.length; i++) {
        var list = lists[i];
        if (!list) continue;
        for (var j = 0; j < list.length; j++) {
            var w = list[j];
            var id = w.toString();
            if (seen[id]) continue;
            seen[id] = true;
            out.push(w);
        }
    }
    return out;
}

/** 向上找可点击父节点 */
function clickableTarget(w) {
    var p = w;
    for (var i = 0; i < 6 && p; i++) {
        if (p.clickable()) return p;
        p = p.parent();
    }
    return w;
}

/** 坐标点击（比 .click() 更可靠） */
function tryClick(w) {
    var raw = ((w.text() || "") + " " + (w.desc() || "")).trim();
    var b = clickableTarget(w).bounds();
    if (b.width() <= 0 || b.height() <= 0) return null;
    var cx = b.centerX();
    var cy = b.centerY();
    click(cx, cy);
    log("[点] 坐标 (" + cx + "," + cy + ") " + raw);
    return "coord";
}

/** 从包含 KEYWORD 的控件里选最大、最像按钮的一个来点 */
function clickBook() {
    var end = Date.now() + FIND_MS;
    while (Date.now() < end) {
        var list = findAllContaining(KEYWORD);
        if (list.length) {
            var best = null;
            var bestScore = -1;
            for (var i = 0; i < list.length; i++) {
                var w = list[i];
                var t = clickableTarget(w);
                var b = t.bounds();
                if (b.width() <= 0 || b.height() <= 0) continue;
                var score = b.width() * b.height();
                if (t.clickable()) score += 5000;
                if (score > bestScore) {
                    bestScore = score;
                    best = w;
                }
            }
            if (best) {
                var way = tryClick(best);
                if (way) {
                    toast("已点 " + KEYWORD + " (" + way + ")");
                    return true;
                }
            }
        }
        sleep(30);
    }
    log("[点] ✗ 未找到包含「" + KEYWORD + "」的控件");
    toast("未找到 " + KEYWORD);
    return false;
}

toast("开始：包含匹配点「" + KEYWORD + "」");

if (DURATION_MS <= 0) {
    clickBook();
} else {
    var deadline = Date.now() + DURATION_MS;
    var n = 0;
    while (Date.now() < deadline) {
        n++;
        clickBook();
        sleep(INTERVAL_MS);
    }
    log("结束，共 " + n + " 次");
    toast("结束，共 " + n + " 次");
}
