// ==============================
// 定时抢约脚本 —— AutoJS6
// ==============================

"use strict";

// ─── 配置（只改这里）──────────────────────────────────────────────────────────
var CONFIG = {
    rushTime:        "01:42:00", // 抢购开放时间 HH:mm:ss
    prepareAheadSec: 10,          // 提前几秒进入准备阶段

    burstDurationMs:  200,        // 到点后连点明天的持续时间(ms)
    burstIntervalMs:  15,         // 连点间隔(ms)
    afterBurstMs:     100,        // burst 结束后 UI 稳定等待(ms)

    bookingLoopMaxMs: 5000,       // 抢购循环最长运行时间(ms)
    findTimeout:      300,        // 日期 Tab 单次查找超时(ms)
    loopFindTimeout:  800,        // 循环内 7:30/立即预约 查找超时(ms)
    loadingMaxMs:     800,        // 切日后等待加载上限(ms)

    step: {
        after730:      70,
        afterBook:     70,
        afterKnow:     60,
        afterToday:    150,
        afterTomorrow: 150,
    },
};

// ─── 常量 ──────────────────────────────────────────────────────────────────────
var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// ─── 工具 ──────────────────────────────────────────────────────────────────────
function pad(n) { return n < 10 ? "0" + n : "" + n; }

function parseTime(str) {
    var p = str.split(":");
    return { h: +p[0], m: +p[1], s: +(p[2] || 0) };
}

function fmtDate(d) {
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

/** HH:mm:ss.SSS，用于性能计时 */
function fmtClockMs(d) {
    d = d || new Date();
    var ms = d.getMilliseconds();
    return fmtDate(d) + "." + (ms < 10 ? "00" : ms < 100 ? "0" : "") + ms;
}

function fmtDelta(ms) {
    return (ms >= 0 ? "+" : "") + ms + "ms";
}

function fmtCountdown(ms) {
    var s = Math.ceil(ms / 1000);
    return pad(Math.floor(s / 3600)) + ":"
         + pad(Math.floor((s % 3600) / 60)) + ":"
         + pad(s % 60);
}

function daySummary(days) {
    var t = days.today;
    var m = days.tomorrow;
    return "今=" + t.weekday + "(" + t.label + ") 明=" + m.weekday + "(" + m.label + ")";
}

function fmtDay(d) {
    return (d.getMonth() + 1) + "/" + d.getDate();
}

/** 按日历日期取今天/明天（明天 = 今天 + 1 天） */
function resolveDays() {
    var now = new Date();
    var todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var tomorrowDate = new Date(todayDate.getTime());
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);

    function pack(d) {
        return {
            date: d,
            weekday: WEEKDAYS[d.getDay()],
            dayNum: "" + d.getDate(),
            label: fmtDay(d),
        };
    }

    return { today: pack(todayDate), tomorrow: pack(tomorrowDate) };
}

/**
 * 取今天指定时分秒的 Date，绝不跨天。
 * 用显式参数构造，避免任何复制/计算问题。
 */
function todayAt(timeStr) {
    var t = parseTime(timeStr);
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                    t.h, t.m, t.s, 0);
}

// ─── 三段式精确等待 ────────────────────────────────────────────────────────────
// 粗等（>1s）→ 细等（50ms~1s，10ms 轮询）→ 精等（<50ms，1ms 轮询）
// 避免单纯 sleep 导致的过冲或 toast 刷新打断精度
function waitUntil(target, label) {
    var remain = target - Date.now();
    if (remain <= 0) {
        log(label + " 时间已过，直接执行");
        return;
    }

    toast(label + " 等待至 " + fmtDate(target));
    log(label + " 等待至 " + fmtDate(target) + "，剩余 " + fmtCountdown(remain));

    // ① 粗等：每秒刷新一次倒计时 toast
    while (true) {
        log("当前时间: " + fmtDate(new Date()));
        toast("当前时间: " + fmtDate(new Date()));
        remain = target - Date.now();
        if (remain <= 1000) break;
        toast("⏱ " + label + "  " + fmtCountdown(remain));
        sleep(1000);
    }

    // ② 细等：最后 1 秒，10ms 精度
    while (true) {
        remain = target - Date.now();
        if (remain <= 50) break;
        sleep(10);
    }

    // ③ 精等：最后 50ms，1ms 精度
    while (Date.now() < target) {
        sleep(1);
    }

    log(label + " 实际到达：" + fmtDate(new Date()));
    toast(label + " ——开始！");
}

// ─── UI 操作 ───────────────────────────────────────────────────────────────────

/** 查找含 text 的控件并点击，找不到返回 false */
function findAndClick(text, timeout) {
    var w = textContains(text).findOne(timeout || CONFIG.findTimeout);
    if (w) { w.click(); return true; }
    return false;
}

/** 带日志的文本/desc 点击 */
function clickPartial(text, timeout, tag) {
    timeout = timeout || CONFIG.loopFindTimeout;
    var w = textContains(text).findOne(timeout)
        || descContains(text).findOne(Math.min(timeout, 500));
    if (w) {
        clickableNode(w).click();
        if (tag) log("[点击] " + tag + " ✓ (" + text + ")");
        return true;
    }
    if (tag) log("[点击] " + tag + " ✗ 未找到: " + text);
    return false;
}

function isLoading() {
    return textContains("加载").exists()
        || className("android.widget.ProgressBar").exists();
}

function waitLoadingDone(maxWait) {
    maxWait = maxWait || CONFIG.loadingMaxMs;
    var end = Date.now() + maxWait;
    while (Date.now() < end) {
        if (!isLoading()) return true;
        sleep(20);
    }
    return !isLoading();
}

/** 切到明天后：等加载结束，且「未开放」消失或 7:30 出现 */
function waitTomorrowReady(label) {
    var maxWait = CONFIG.loadingMaxMs;
    var end = Date.now() + maxWait;
    waitLoadingDone(maxWait);

    while (Date.now() < end) {
        if (slot730Exists()) {
            log("[就绪] " + (label || "明天") + " 已出现 7:30");
            return true;
        }
        if (!textContains("未开放").exists() && !isLoading()) {
            log("[就绪] " + (label || "明天") + " 无未开放/加载");
            return true;
        }
        sleep(35);
    }
    log("[就绪] " + (label || "明天") + " 超时，仍尝试点击");
    return false;
}

function slot730Exists() {
    return textContains("7:30").exists()
        || textContains("07:30").exists()
        || descContains("7:30").exists()
        || descContains("07:30").exists();
}

/** 点 7:30，避免误匹配 17:30 等；在 timeout 内轮询 */
function click730(timeout) {
    timeout = timeout || CONFIG.loopFindTimeout;
    var end = Date.now() + timeout;
    var patterns = ["07:30", "7:30"];

    while (Date.now() < end) {
        for (var i = 0; i < patterns.length; i++) {
            var p = patterns[i];
            var list = textContains(p).find();
            if (!list || !list.length) list = descContains(p).find();
            if (!list || !list.length) continue;

            for (var j = 0; j < list.length; j++) {
                var raw = (list[j].text() || "") + (list[j].desc() || "");
                if (p === "7:30" && raw.indexOf("17:30") >= 0) continue;
                if (p === "7:30" && raw.indexOf("07:30") >= 0) continue;

                var target = clickableNode(list[j]);
                var b = target.bounds();
                if (b.width() <= 0 || b.height() <= 0) continue;

                target.click();
                log("[点击] 7:30 ✓ (" + raw + ")");
                return true;
            }
        }
        sleep(50);
    }

    log("[点击] 7:30 ✗ 未找到时段");
    return false;
}

/** 取可点击节点：自身或向上找 clickable 父节点 */
function clickableNode(w) {
    if (!w) return null;
    if (w.clickable()) return w;
    var p = w.parent();
    return (p && p.clickable()) ? p : w;
}

/**
 * 点击星期日期格（跳过顶部表头）。
 * 今天优先「今天」；也可按日号辅助匹配。
 */
function tapWeekday(day, timeout, isToday) {
    timeout = timeout || CONFIG.findTimeout;
    var weekday = day.weekday;

    if (isToday && _todayX > 0 && _todayY > 0) {
        click(_todayX, _todayY);
        return true;
    }

    if (isToday) {
        var todayMark = textContains("今天").findOne(Math.min(timeout, 800));
        if (todayMark) {
            var t = clickableNode(todayMark);
            var b = t.bounds();
            _todayX = b.centerX();
            _todayY = b.centerY();
            t.click();
            return true;
        }
    }

    var list = textContains(weekday).find();
    if (!list || !list.length) list = descContains(weekday).find();
    if (!list || !list.length) {
        var one = textContains(weekday).findOne(timeout)
            || descContains(weekday).findOne(Math.min(timeout, 500));
        if (one) {
            var c = clickableNode(one);
            if (isToday) cacheTodayCoords(c);
            c.click();
            return true;
        }
        return false;
    }

    var best = null;
    var bestScore = -1;
    for (var i = 0; i < list.length; i++) {
        var node = list[i];
        var b = node.bounds();
        if (b.width() <= 0 || b.height() <= 0) continue;

        var target = clickableNode(node);
        var tb = target.bounds();
        var score = tb.width() * tb.height();
        if (target.clickable()) score += 5000;
        if (tb.height() < 36) score -= 20000;
        if (nodeContainsDayNum(node, day.dayNum)) score += 8000;

        if (score > bestScore) {
            bestScore = score;
            best = target;
        }
    }

    if (!best) return false;
    if (isToday) cacheTodayCoords(best);
    best.click();
    return true;
}

function nodeContainsDayNum(node, dayNum) {
    var p = node;
    for (var depth = 0; depth < 4 && p; depth++) {
        var txt = (p.text() || "") + (p.desc() || "");
        if (txt.indexOf(dayNum) >= 0) return true;
        p = p.parent();
    }
    return false;
}

function cacheTodayCoords(w) {
    var b = w.bounds();
    _todayX = b.centerX();
    _todayY = b.centerY();
}

/** 切回今天；失败会 toast 提示 */
function tapToday(day, timeout) {
    var ok = tapWeekday(day, timeout, true);
    if (!ok) toast("⚠️ 切回今天失败: " + day.weekday + "(" + day.label + ")");
    return ok;
}

/** 找明天 Tab：优先今天右侧相邻格，避免误点其它周的「周二」 */
function findTomorrowWidget(tomorrowDay) {
    var weekday = tomorrowDay.weekday;

    if (_todayX > 0 && _todayY > 0) {
        var list = textContains(weekday).find();
        if (!list || !list.length) list = descContains(weekday).find();
        var best = null;
        var bestDx = Infinity;
        for (var i = 0; i < list.length; i++) {
            var target = clickableNode(list[i]);
            var b = target.bounds();
            if (b.height() < 36) continue;
            var dx = b.centerX() - _todayX;
            var dy = Math.abs(b.centerY() - _todayY);
            if (dx > 0 && dy < 80 && dx < bestDx) {
                bestDx = dx;
                best = target;
            }
        }
        if (best) return best;
    }

    var w = textContains(weekday).findOne(2000)
        || descContains(weekday).findOne(1000);
    return w ? clickableNode(w) : null;
}

/** 仅在控件存在时点击（不等待），避免超时拖慢循环 */
function clickIfExists(text) {
    var w = textContains(text).findOne(200);
    if (w) { w.click(); return true; }
    return false;
}

// ─── 今天/明天坐标缓存 ──────────────────────────────────────────────────────────
var _todayX = -1, _todayY = -1;
var _tx = -1, _ty = -1;

function cacheTomorrow(days) {
    var today = days.today;
    var tomorrow = days.tomorrow;

    if (!tapToday(today, 2000)) {
        toast("⚠️ 准备阶段无法切到今天");
        return false;
    }
    sleep(400);

    var w = findTomorrowWidget(tomorrow);
    if (!w) {
        toast("⚠️ 找不到明天 " + tomorrow.weekday + "(" + tomorrow.label + ")");
        return false;
    }

    var b = w.bounds();
    _tx = b.centerX();
    _ty = b.centerY();

    if (!tapToday(today, 1000)) {
        toast("⚠️ 缓存后无法停回今天");
        return false;
    }
    sleep(300);

    toast("✅ " + daySummary(days)
        + "\n今天(" + _todayX + "," + _todayY + ") 明天(" + _tx + "," + _ty + ")");
    log(daySummary(days));
    log("今天坐标：(" + _todayX + ", " + _todayY + ")");
    log("明天坐标：(" + _tx + ", " + _ty + ")");
    return true;
}

/** 优先坐标点击（无查找耗时），兜底用文字查找 */
function tapTomorrow(tomorrowDay) {
    if (_tx > 0 && _ty > 0) {
        click(_tx, _ty);
        return true;
    }
    var w = findTomorrowWidget(tomorrowDay);
    if (w) {
        w.click();
        return true;
    }
    return findAndClick(tomorrowDay.weekday, 200);
}

// ─── 核心流程 ──────────────────────────────────────────────────────────────────

function burst(days, rushTs) {
    var burstStart = Date.now();
    log("[计时] burst 开始 " + fmtClockMs(new Date(burstStart))
        + " | 距抢购 " + fmtDelta(burstStart - rushTs));
    var end = burstStart + CONFIG.burstDurationMs;
    while (Date.now() < end) {
        tapTomorrow(days.tomorrow);
        sleep(CONFIG.burstIntervalMs);
    }
    var burstEnd = Date.now();
    log("[计时] burst 结束 " + fmtClockMs(new Date(burstEnd))
        + " | burst耗时 " + (burstEnd - burstStart) + "ms"
        + " | 距抢购 " + fmtDelta(burstEnd - rushTs));
    sleep(CONFIG.afterBurstMs);
    waitTomorrowReady("burst后");
    log("[计时] burst后就绪 " + fmtClockMs(new Date())
        + " | 距抢购 " + fmtDelta(Date.now() - rushTs));
}

function bookingLoop(days, rushTs) {
    var today = days.today;
    var tomorrow = days.tomorrow;
    var step     = CONFIG.step;
    var deadline = Date.now() + CONFIG.bookingLoopMaxMs;
    var round    = 0;
    var loopStart = Date.now();
    var prevRoundStart = 0;

    log("[计时] bookingLoop 启动 " + fmtClockMs(new Date(loopStart))
        + " | 距抢购 " + fmtDelta(loopStart - rushTs));
    toast("开始抢购循环");

    while (Date.now() < deadline) {
        round++;
        var roundStart = Date.now();
        log("[计时] 第" + round + "轮 开始 " + fmtClockMs(new Date(roundStart))
            + " | 距循环起 " + fmtDelta(roundStart - loopStart)
            + " | 距抢购 " + fmtDelta(roundStart - rushTs)
            + (round > 1 ? " | 距上轮 " + fmtDelta(roundStart - prevRoundStart) : ""));
        prevRoundStart = roundStart;

        log("── 第 " + round + " 轮，剩余 " + (deadline - Date.now()) + "ms ──");

        waitTomorrowReady("第" + round + "轮");

        // ① 选 7:30 时段（必须在明天页）
        var ok730 = click730(CONFIG.loopFindTimeout);
        sleep(step.after730);

        // ② 立即预约
        var okBook = clickPartial("立即预约", CONFIG.loopFindTimeout, "立即预约");
        sleep(step.afterBook);

        // ③ 关闭弹窗（如有）
        var okKnow = clickIfExists("我知道了");
        if (okKnow) log("[点击] 我知道了 ✓");
        sleep(step.afterKnow);

        // ④ 切回今天
        var okToday = tapToday(today);
        log("[切换] 今天 " + (okToday ? "✓" : "✗"));
        sleep(step.afterToday);

        // ⑤ 切到明天（下一轮在明天页开始）
        var okTomorrow = tapTomorrow(tomorrow);
        log("[切换] 明天 " + (okTomorrow ? "✓" : "✗"));
        sleep(step.afterTomorrow);

        var roundEnd = Date.now();
        log("[计时] 第" + round + "轮 结束 " + fmtClockMs(new Date(roundEnd))
            + " | 本轮耗时 " + (roundEnd - roundStart) + "ms");

        if (ok730 && okBook) {
            log("[结果] 第 " + round + " 轮已点 7:30 + 立即预约");
            toast("第 " + round + " 轮已预约");
        }
    }

    toast("✅ 抢约结束，共 " + round + " 轮");
    log("抢约结束，共 " + round + " 轮");
}

// ─── 主入口 ────────────────────────────────────────────────────────────────────
(function main() {
    // AutoJS6 必须先确保无障碍服务已开启
    auto.waitFor();

    var days         = resolveDays();
    var rushDate     = todayAt(CONFIG.rushTime);
    var prepareDate  = new Date(rushDate.getTime() - CONFIG.prepareAheadSec * 1000);

    log(daySummary(days));
    log("准备时间=" + fmtDate(prepareDate));
    log("抢购时间=" + fmtDate(rushDate));
    toast(daySummary(days)
        + "\n准备=" + fmtDate(prepareDate)
        + " 抢购=" + fmtDate(rushDate));
    toast("当前时间: " + fmtDate(new Date()));
    log("当前时间: " + fmtDate(new Date()));
    // 1. 等到准备时间
    waitUntil(prepareDate, "准备");

    // 准备阶段重新取日期，避免跨零点或长时间等待后偏差
    days = resolveDays();
    log("准备阶段: " + daySummary(days));
    toast("准备阶段: " + daySummary(days));

    // 2. 缓存明天坐标，停回今天（须在约课日期选择页）
    cacheTomorrow(days);

    // 3. 停在今天，精确等到抢购时刻
    tapToday(days.today, 2000);
    sleep(200);
    waitUntil(rushDate, "抢购");

    var rushTs = rushDate.getTime();

    // 4. burst 连点切换到明天（内部已 waitTomorrowReady）
    burst(days, rushTs);

    // 5. 抢购循环
    bookingLoop(days, rushTs);
})();