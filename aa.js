// ==============================
// 7. 定时抢约（停今天 → 到点点明天 → 循环：7:30 → 预约 → 我知道了 → 今天）
// ==============================

var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 意向抢购时间（到点执行交叉点击、选时段、立即预约）格式 HH:mm:ss
var rushTime = "22:51:00";
// 提前准备秒数（在 rushTime 之前这么久进入准备阶段）
var prepareAheadSec = 10;
// 到点后连点明天：窗口时长 / 间隔（毫秒）
var burstMs = 100;
var burstIntervalMs = 10;
// 预约循环最长时间（毫秒）
var bookingLoopMaxMs = 5000;
// 首次 burst 切明天后等待（极速，仅 UI 稳定）
var afterBurstMs = 80;
// 每轮 sleep 合计 500ms：70+70+60+150+150
var step730Ms = 70;
var stepBookMs = 70;
var stepKnowMs = 60;
var stepTodayMs = 150;
var stepTomorrowMs = 150;
// 循环内文字查找超时（宜短，配合坐标点击）
var loopFindTimeout = 400;

var tomorrowX = -1;
var tomorrowY = -1;

function parseTime(str) {
    var parts = str.split(":");
    return {
        h: parseInt(parts[0], 10),
        m: parseInt(parts[1], 10),
        s: parseInt(parts[2] || "0", 10),
    };
}

function timeToSec(t) {
    return t.h * 3600 + t.m * 60 + t.s;
}

function formatTime(t) {
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return pad(t.h) + ":" + pad(t.m) + ":" + pad(t.s);
}

/** rushTime 往前推 aheadSec 秒，得到准备时刻 */
function getPrepareTimeStr(rushStr, aheadSec) {
    var total = timeToSec(parseTime(rushStr)) - aheadSec;
    if (total < 0) total += 86400;
    return formatTime({
        h: Math.floor(total / 3600) % 24,
        m: Math.floor((total % 3600) / 60),
        s: total % 60,
    });
}

function isBeforeTime(d, t) {
    var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    if (h !== t.h) return h < t.h;
    if (m !== t.m) return m < t.m;
    return s < t.s;
}

function getWeekdayCn() {
    return WEEKDAYS[new Date().getDay()];
}

function getNextWeekdayCn() {
    return WEEKDAYS[(new Date().getDay() + 1) % 7];
}

/** 阻塞等待到指定时刻（toast 显示 timeStr） */
function waitUntilTime(timeStr, phaseName) {
    var t = parseTime(timeStr);
    if (!isBeforeTime(new Date(), t)) {
        toast(phaseName + "（已过 " + timeStr + "）");
        return;
    }
    toast(phaseName + "，等待至 " + timeStr);
    while (isBeforeTime(new Date(), t)) {
        var d = new Date();
        var remainMs = (timeToSec(t) - timeToSec({
            h: d.getHours(), m: d.getMinutes(), s: d.getSeconds(),
        })) * 1000;
        if (remainMs > 500) {
            sleep(Math.min(remainMs - 200, 1000));
        } else if (remainMs > 30) {
            sleep(10);
        } else {
            sleep(1);
        }
    }
    toast(phaseName + "，已到 " + timeStr);
}

function clickPartial(partText, timeout) {
    timeout = timeout || 1500;
    var w = textContains(partText).findOne(timeout)
        || descContains(partText).findOne(500);
    if (w) {
        w.click();
        return true;
    }
    return false;
}

/** 准备阶段：缓存明天坐标，并回到今天 Tab（开放前必须停在今天） */
function cacheTomorrowPos(today, tomorrow) {
    clickPartial(today, 1500);
    sleep(300);
    var w = textContains(tomorrow).findOne(3000);
    if (!w) return false;
    var b = w.bounds();
    tomorrowX = b.centerX();
    tomorrowY = b.centerY();
    clickPartial(today, 500);
    sleep(200);
    toast("已缓存明天坐标，停在: " + today);
    return true;
}

/** 优先坐标点击明天（约 1ms 级），失败再文本查找 */
function clickTomorrowFast() {
    if (tomorrowX > 0 && tomorrowY > 0) {
        click(tomorrowX, tomorrowY);
        return true;
    }
    return clickPartial(tomorrowText, 150);
}

/** 有弹窗才点，避免无效查找耗时 */
function clickIKnowIfExists() {
    if (!textContains("我知道了").exists()) return false;
    var w = textContains("我知道了").findOne(300);
    if (w) {
        w.click();
        return true;
    }
    return false;
}

/** 到点后 burstMs 内每 burstIntervalMs 点一次明天 */
function burstClickTomorrow() {
    var end = Date.now() + burstMs;
    while (Date.now() < end) {
        clickTomorrowFast();
        sleep(burstIntervalMs);
    }
}

/**
 * 抢购循环（每轮顺序固定，禁止在今天点 7:30/立即预约）：
 * 明天页 → 7:30 → 立即预约 → 我知道了 → 今天 → 明天 → 下一轮
 * 首轮由 burst 切到明天后，直接从 7:30 开始
 */
function runBookingLoop() {
    var round = 0;
    var deadline = Date.now() + bookingLoopMaxMs;
    while (Date.now() < deadline) {
        round++;
        dismissPopupsSafe(1);

        clickPartialOrImage("7:30", IMG_730, loopFindTimeout)
            || clickPartialOrImage("07:30", IMG_730, loopFindTimeout);
        sleep(step730Ms);
        clickPartialOrImage("立即预约", IMG_BOOK, loopFindTimeout);
        sleep(stepBookMs);
        clickIKnowIfExists();
        sleep(stepKnowMs);
        clickPartial(todayText, loopFindTimeout);
        sleep(stepTodayMs);
        clickTomorrowFast();
        sleep(stepTomorrowMs);
    }
    toast("预约循环结束（" + (bookingLoopMaxMs / 1000) + "s）");
}

// 1. 提前准备（rushTime 前 prepareAheadSec 秒）
var prepareTime = getPrepareTimeStr(rushTime, prepareAheadSec);
waitUntilTime(prepareTime, "提前准备");

// 2. 准备阶段：预计算星期 + 缓存明天坐标（请停在约课日期选择页）
dismissPopupsSafe(2);
var todayText = getWeekdayCn();
var tomorrowText = getNextWeekdayCn();
toast("今天: " + todayText + " → 明天: " + tomorrowText);
if (!cacheTomorrowPos(todayText, tomorrowText)) {
    toast("未缓存明天坐标，到点用文本查找");
}

// 3. 开放前停在今天，精确等到 rushTime
clickPartial(todayText, 500);
sleep(200);
waitUntilTime(rushTime, "开始抢购");

// 4. 到点 burst 切明天（极速），短暂稳定后立即第 1 轮
burstClickTomorrow();
sleep(afterBurstMs);

// 5. 预约循环，每轮 sleep 约 500ms，最多 20s
runBookingLoop();
