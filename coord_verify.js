// 坐标记录 & 验证 —— 与 test.js 同款查找逻辑
// 用法：打开约课页 → 运行脚本 → 看日志/依次点击验证

"use strict";

auto.waitFor();

var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

var CONFIG = {
    clickAfterRecord: true,  // 记录后依次点击验证
    clickIntervalMs:  1500,  // 每次点击间隔(ms)
    savePath:         "/sdcard/脚本/book_coords.json",
};

// ─── 与 test.js 一致的查找逻辑 ───────────────────────────────────────────────

function widgetRaw(w) {
    return ((w.text() || "") + " " + (w.desc() || "")).trim();
}

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

function clickableNode(w) {
    if (!w) return null;
    var p = w;
    for (var i = 0; i < 6 && p; i++) {
        if (p.clickable()) return p;
        p = p.parent();
    }
    return w;
}

function pickBestWidget(list, filterFn) {
    var best = null;
    var bestScore = -1;
    var sh = device.height;
    for (var i = 0; i < list.length; i++) {
        var w = list[i];
        var raw = widgetRaw(w);
        var target = clickableNode(w);
        var b = target.bounds();
        if (b.width() <= 0 || b.height() <= 0) continue;
        if (b.centerY() < 0 || b.centerY() > sh) continue;
        if (filterFn && !filterFn(w, raw, target)) continue;
        var score = b.width() * b.height();
        if (target.clickable()) score += 5000;
        if (score > bestScore) {
            bestScore = score;
            best = w;
        }
    }
    return best;
}

function resolveDays() {
    var now = new Date();
    var todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var tomorrowDate = new Date(todayDate.getTime());
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    return {
        today: WEEKDAYS[todayDate.getDay()],
        tomorrow: WEEKDAYS[tomorrowDate.getDay()],
    };
}

/** 记录坐标（不点击） */
function recordBest(keyword, filterFn) {
    var best = pickBestWidget(findAllContaining(keyword), filterFn);
    if (!best) return { ok: false, keyword: keyword };
    var b = clickableNode(best).bounds();
    return {
        ok: true,
        keyword: keyword,
        x: b.centerX(),
        y: b.centerY(),
        raw: widgetRaw(best),
    };
}

/** 今天：优先「今天」，否则星期 */
function recordToday(weekday) {
    var mark = recordBest("今天");
    if (mark.ok) {
        mark.label = "今天";
        return mark;
    }
    var w = recordBest(weekday);
    w.label = "今天(" + weekday + ")";
    return w;
}

/** 明天：优先今天右侧相邻格 */
function recordTomorrow(weekday, todayPt) {
    if (todayPt && todayPt.ok) {
        var list = findAllContaining(weekday);
        var best = null;
        var bestDx = Infinity;
        for (var i = 0; i < list.length; i++) {
            var target = clickableNode(list[i]);
            var b = target.bounds();
            if (b.height() < 36) continue;
            var dx = b.centerX() - todayPt.x;
            var dy = Math.abs(b.centerY() - todayPt.y);
            if (dx > 0 && dy < 80 && dx < bestDx) {
                bestDx = dx;
                best = target;
            }
        }
        if (best) {
            var bb = best.bounds();
            return {
                ok: true,
                label: "明天(" + weekday + ")",
                keyword: weekday,
                x: bb.centerX(),
                y: bb.centerY(),
                raw: widgetRaw(best),
            };
        }
    }
    var w = recordBest(weekday);
    w.label = "明天(" + weekday + ")";
    return w;
}

function filter730(w, raw) {
    return raw.indexOf("17:30") < 0;
}

function logPoint(name, pt) {
    if (pt.ok) {
        log("[坐标] " + name + " (" + pt.x + "," + pt.y + ") " + pt.raw);
    } else {
        log("[坐标] " + name + " ✗ 未找到");
    }
}

function tapPoint(name, pt) {
    if (!pt.ok) {
        toast("跳过 " + name + "（未记录）");
        return false;
    }
    click(pt.x, pt.y);
    log("[点击] " + name + " (" + pt.x + "," + pt.y + ")");
    toast("点击: " + name);
    return true;
}

// ─── 主流程 ────────────────────────────────────────────────────────────────────

var days = resolveDays();
toast("开始记录坐标…");
log("======== 坐标记录 ========");
log("今=" + days.today + " 明=" + days.tomorrow);
log("屏幕 " + device.width + "x" + device.height);

var coords = {
    time: new Date().toISOString(),
    screen: { w: device.width, h: device.height },
    today: recordToday(days.today),
    tomorrow: null,
    slot730: recordBest("7:30", filter730),
    book: recordBest("立即预约"),
    know: recordBest("我知道了"),
};

coords.tomorrow = recordTomorrow(days.tomorrow, coords.today);

logPoint("今天", coords.today);
logPoint("明天", coords.tomorrow);
logPoint("7:30", coords.slot730);
logPoint("立即预约", coords.book);
logPoint("我知道了", coords.know);

try {
    files.ensureDir("/sdcard/脚本/");
    files.write(CONFIG.savePath, JSON.stringify(coords, null, 2));
    log("已保存: " + CONFIG.savePath);
} catch (e) {
    log("保存失败: " + e);
}

var summary = "";
["today", "tomorrow", "slot730", "book", "know"].forEach(function(k) {
    var p = coords[k];
    var name = p.label || p.keyword || k;
    summary += name + ": " + (p.ok ? p.x + "," + p.y : "无") + "\n";
});
toast(summary);

if (!CONFIG.clickAfterRecord) {
    toast("仅记录，未点击");
} else {
    toast("2秒后开始依次点击验证");
    sleep(2000);

    var order = [
       // ["今天", coords.today],
       // ["明天", coords.tomorrow],
       // ["7:30", coords.slot730],
       // ["立即预约", coords.book],
        ["我知道了", coords.know],
    ];

    for (var i = 0; i < order.length; i++) {
        var item = order[i];
        if (item[1].ok) {
            tapPoint(item[0], item[1]);
            sleep(CONFIG.clickIntervalMs);
        }
    }
    toast("点击验证完成");
    log("======== 验证结束 ========");
}
