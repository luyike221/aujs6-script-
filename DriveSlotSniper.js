// =============================================================================
// DriveSlotSniper — 驾校宝典 · 定时抢约练车时段（AutoJS6 · 固定坐标版）
// =============================================================================
//
// 在 App 开放预约的精确时刻，自动切换日期 Tab、选择时段并点击「立即预约」。
// 以首次出现「我知道了」弹窗作为预约生效标志，并记录距抢购时刻的耗时。
//
// 流程
//   等准备 → 点今天 → 等抢购时刻 → burst 明天
//   └─ 循环 bookingRounds 轮（不论成败）：
//        7:30 → 立即预约 → 我知道了 → 点今天 → burst 明天
//
// 前置条件
//   · 已开启无障碍，脚本运行前手动打开驾校宝典约课页
//   · 坐标按本机分辨率标定；换机或改分辨率后先跑 coord_verify.js 再更新 COORDS
//
// 配套脚本
//   coord_verify.js — 记录/验证五个点击坐标
//   book_only.js    — 单独测试「立即预约」点击
//
// 坐标来源：coord_verify.js @ Redmi 1440×3200（见 COORDS）
//
"use strict";

// ─── 配置 ──────────────────────────────────────────────────────────────────────
var CONFIG = {
    rushTime:        "03:05:00", // 抢购开放时间 HH:mm:ss
    prepareAheadSec: 15,

    burstMaxMs:      80,          // 到点后连点明天时长(ms)
    burstIntervalMs: 5,

    bookingRounds:    5,          // 固定跑几轮（不论成败）

    knowWaitMs:       400,
    knowDismissMs:    400,
    hintMode:         true,
    hintStepMs:       1000,

    step: {
        after730:      15,
        afterBook:     15,
        afterToday:    35,
        afterTomorrow: 35,
    },
};

/** 固定坐标（Redmi 1440x3200） */
var COORDS = {
    today:    { x: 161,  y: 1002 }, // 今天 Tab
    tomorrow: { x: 399,  y: 1002 }, // 明天 Tab
    slot730:  { x: 277,  y: 1233 }, // 7:30 时段
    book:     { x: 1095, y: 3009 }, // 立即预约
    know:     { x: 719,  y: 1578 }, // 我知道了
};

var _rushTs = 0;
var _firstBookMs = -1;

// ─── 工具 ──────────────────────────────────────────────────────────────────────
function pad(n) { return n < 10 ? "0" + n : "" + n; }

function fmtDate(d) {
    return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function fmtClockMs(d) {
    d = d || new Date();
    var ms = d.getMilliseconds();
    return fmtDate(d) + "." + (ms < 10 ? "00" : ms < 100 ? "0" : "") + ms;
}

function fmtDelta(ms) { return (ms >= 0 ? "+" : "") + ms + "ms"; }

function fmtCountdown(ms) {
    var s = Math.ceil(ms / 1000);
    return pad(Math.floor(s / 3600)) + ":"
         + pad(Math.floor((s % 3600) / 60)) + ":"
         + pad(s % 60);
}

function fmtDay(d) {
    d = d || new Date();
    return (d.getMonth() + 1) + "/" + d.getDate();
}

function todayAt(timeStr) {
    var p = timeStr.split(":");
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                    +p[0], +p[1], +(p[2] || 0), 0);
}

function stepPause(label) {
    if (!CONFIG.hintMode) return;
    log("[提示] " + label);
    toast("▶ " + label);
    sleep(CONFIG.hintStepMs || 1000);
}

function stepSleep(ms) {
    // 提示模式只放慢 stepPause，step 仍用毫秒，否则一轮远超 bookingLoopMaxMs
    sleep(ms);
}

// ─── 精确等待 ──────────────────────────────────────────────────────────────────
function waitUntil(target, label) {
    var remain = target - Date.now();
    if (remain <= 0) {
        log(label + " 时间已过，直接执行");
        return;
    }
    toast(label + " 等待至 " + fmtDate(new Date(target)));
    log(label + " 等待至 " + fmtDate(new Date(target)) + "，剩余 " + fmtCountdown(remain));

    while (true) {
        remain = target - Date.now();
        if (remain <= 1000) break;
        toast("⏱ " + label + "  " + fmtCountdown(remain));
        sleep(1000);
    }
    while (true) {
        remain = target - Date.now();
        if (remain <= 50) break;
        sleep(10);
    }
    while (Date.now() < target) sleep(1);

    log(label + " 实际到达：" + fmtClockMs(new Date()));
    toast(label + " ——开始！");
}

// ─── 固定坐标点击 ──────────────────────────────────────────────────────────────
function tapFixed(key, tag) {
    var p = COORDS[key];
    if (!p) return false;
    click(p.x, p.y);
    log("[点击] " + (tag || key) + " (" + p.x + "," + p.y + ")");
    return true;
}

function tapToday() { return tapFixed("today", "今天"); }
function tapTomorrow() { return tapFixed("tomorrow", "明天"); }
function tap730() { return tapFixed("slot730", "7:30"); }
function tapBook() { return tapFixed("book", "立即预约"); }
function tapKnow() { return tapFixed("know", "我知道了"); }

function knowVisible() {
    return textContains("我知道了").exists() || descContains("我知道了").exists();
}

function waitKnowGone() {
    var end = Date.now() + CONFIG.knowDismissMs;
    while (Date.now() < end) {
        if (!knowVisible()) return true;
        sleep(20);
    }
    return false;
}

function dismissKnowIfExists() {
    if (!knowVisible()) return false;
    tapKnow();
    waitKnowGone();
    return true;
}

function markFirstBookConfirmed(round) {
    if (_firstBookMs >= 0 || !_rushTs) return;
    _firstBookMs = Date.now() - _rushTs;
    var msg = "[成功] 首次预约生效(我知道了) 距抢购 " + fmtDelta(_firstBookMs)
        + " | 时刻 " + fmtClockMs(new Date()) + " | 第" + round + "轮";
    log(msg);
    toast("✅ 预约生效 " + fmtDelta(_firstBookMs));
}

/** 点预约 + 等「我知道了」弹窗（坐标点击） */
function clickBookAndConfirm() {
    dismissKnowIfExists();
    tapBook();

    var end = Date.now() + CONFIG.knowWaitMs;
    while (Date.now() < end) {
        if (knowVisible()) {
            log("[确认] 预约生效 ✓ 出现「我知道了」");
            tapKnow();
            waitKnowGone();
            return { bookClicked: true, confirmed: true };
        }
        sleep(10);
    }
    log("[怀疑] 已点预约坐标，但未见「我知道了」");
    return { bookClicked: true, confirmed: false };
}

// ─── 核心流程 ──────────────────────────────────────────────────────────────────
function burst(rushTs) {
    var t0 = Date.now();
    log("[计时] burst 开始 " + fmtClockMs(new Date(t0)) + " | 距抢购 " + fmtDelta(t0 - rushTs));

    stepPause("到点：切明天");
    tapTomorrow();
    var deadline = t0 + CONFIG.burstMaxMs;
    while (Date.now() < deadline) {
        tapTomorrow();
        sleep(CONFIG.burstIntervalMs);
    }

    log("[计时] burst 结束 | 耗时 " + (Date.now() - t0) + "ms"
        + " | 距抢购 " + fmtDelta(Date.now() - rushTs));
}

function bookingLoop(rushTs) {
    var step = CONFIG.step;
    var total = CONFIG.bookingRounds;
    var loopStart = Date.now();
    var prevRoundStart = 0;

    log("[计时] bookingLoop 启动，固定 " + total + " 轮 | 距抢购 " + fmtDelta(loopStart - rushTs));
    toast("开始抢购循环 " + total + " 轮");

    for (var round = 1; round <= total; round++) {
        var roundStart = Date.now();
        log("[计时] 第" + round + "轮 开始 " + fmtClockMs(new Date(roundStart))
            + " | 距抢购 " + fmtDelta(roundStart - rushTs)
            + (round > 1 ? " | 距上轮 " + fmtDelta(roundStart - prevRoundStart) : ""));
        prevRoundStart = roundStart;

        stepPause("第" + round + "轮：7:30");
        var t730 = Date.now();
        tap730();
        log("[计时] 7:30 步骤 " + (Date.now() - t730) + "ms");
        stepSleep(step.after730);

        stepPause("第" + round + "轮：立即预约");
        var tBook = Date.now();
        var book = clickBookAndConfirm();
        log("[计时] 预约步骤 " + (Date.now() - tBook) + "ms | 生效=" + (book.confirmed ? "是" : "否"));

        if (book.confirmed) markFirstBookConfirmed(round);
        stepSleep(step.afterBook);

        stepPause("第" + round + "轮：切今天");
        tapToday();
        stepSleep(step.afterToday);

        stepPause("第" + round + "轮：burst 明天");
        burst(rushTs);
        stepSleep(step.afterTomorrow);

        log("[计时] 第" + round + "轮 结束 | 本轮 " + (Date.now() - roundStart) + "ms"
            + " | 生效=" + (book.confirmed ? "是" : "否"));
    }

    if (_firstBookMs >= 0) {
        log("[成功] 汇总：首次预约生效 距抢购 " + fmtDelta(_firstBookMs));
        toast("汇总：预约生效 " + fmtDelta(_firstBookMs));
    } else {
        log("[成功] 汇总：" + total + "轮均未确认预约生效");
        toast(total + "轮均未确认生效");
    }
    log("抢约结束，共 " + total + " 轮");
}

// ─── 主入口 ────────────────────────────────────────────────────────────────────
(function main() {
    auto.waitFor();

    var rushDate = todayAt(CONFIG.rushTime);
    var prepareDate = new Date(rushDate.getTime() - CONFIG.prepareAheadSec * 1000);

    log("固定坐标模式 " + device.width + "x" + device.height + " 日期=" + fmtDay());
    log("准备=" + fmtDate(prepareDate) + " 抢购=" + fmtDate(rushDate));
    log("坐标 今(" + COORDS.today.x + "," + COORDS.today.y + ")"
        + " 明(" + COORDS.tomorrow.x + "," + COORDS.tomorrow.y + ")"
        + " 730(" + COORDS.slot730.x + "," + COORDS.slot730.y + ")"
        + " 预约(" + COORDS.book.x + "," + COORDS.book.y + ")"
        + " 知道(" + COORDS.know.x + "," + COORDS.know.y + ")");
    toast("抢购=" + fmtDate(rushDate) + " 今=" + fmtDay());

    if (CONFIG.hintMode) toast("🔍 提示模式 ON");

    stepPause("等待准备时刻");
    waitUntil(prepareDate, "准备");

    stepPause("准备：停今天");
    tapToday();
    stepSleep(300);

    stepPause("等待抢购时刻");
    waitUntil(rushDate, "抢购");
    _rushTs = rushDate.getTime();

    burst(_rushTs);
    bookingLoop(_rushTs);
})();
