// ==============================
// 驾考宝典 - 自动约课脚本
// ==============================

var JIAKAO_PKG = "com.handsgo.jiakao.android";
var JIAKAO_MAIN = "cn.mucang.android.jiakao.default";

// ---------- 弹窗 / 找图资源（close.png、730.png 等放 /sdcard/脚本/res/） ----------
var RES_DIR = "/sdcard/脚本/res/";
var POPUP_CLOSE_IMAGE = RES_DIR + "close.png";
var IMG_730 = RES_DIR + "730.png";
var IMG_BOOK = RES_DIR + "立即预约.png";

var POPUP_CLOSE_TEXTS = [
    "跳过", "Skip", "关闭", "取消", "我知道了", "知道了",
    "暂不", "以后再说", "不再提示", "不再提醒", "狠心离开",
    "直接关闭", "去意已决",
];
var POPUP_CLOSE_TEXTS_SAFE = [
    "跳过", "Skip", "关闭", "我知道了", "知道了",
    "暂不", "以后再说", "不再提示", "不再提醒", "×", "✕",
];

var screenCaptureReady = false;

function initScreenCapture() {
    if (screenCaptureReady) return true;
    screenCaptureReady = images.requestScreenCapture();
    if (!screenCaptureReady) toast("截图权限未开启，找图关闭不可用");
    return screenCaptureReady;
}

/** OpenCV 模板找图并点击（文件不存在则跳过） */
function clickByImage(templatePath, threshold) {
    if (!files.exists(templatePath)) return false;
    if (!initScreenCapture()) return false;
    threshold = threshold || 0.88;
    var screen = captureScreen();
    var tpl = images.read(templatePath);
    if (!tpl) {
        screen.recycle();
        return false;
    }
    var p = images.findImage(screen, tpl, { threshold: threshold });
    screen.recycle();
    tpl.recycle();
    if (p) {
        click(p.x, p.y);
        return true;
    }
    return false;
}

function clickCloseByImage() {
    return clickByImage(POPUP_CLOSE_IMAGE, 0.88);
}

/** 是否「5月题库更新」类弹窗（立即更新 + 下方圆形 X，无文字） */
function isJiakaoUpdateDialogVisible() {
    return textContains("5月题库更新").exists()
        || textContains("新规题库").exists()
        || (textContains("立即更新").exists() && textContains("更新题库").exists());
}

/**
 * 关闭驾考宝典「题库更新」弹窗：X 在白色卡片下方居中，不是「立即更新」按钮
 * 请把 X 小图保存为 /sdcard/脚本/res/close.png 提高命中率
 */
function dismissJiakaoUpdateDialog() {
    if (!isJiakaoUpdateDialogVisible()) return false;

    var w = device.width;
    var h = device.height;

    // 1. 找屏幕中下、居中、较小的可点击控件（圆形 X）
    var nodes = clickable(true).find();
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var b = node.bounds();
        var bw = b.right - b.left;
        var bh = b.bottom - b.top;
        if (b.centerY() > h * 0.58 && b.centerY() < h * 0.82
            && Math.abs(b.centerX() - w / 2) < w * 0.12
            && bw > 0 && bw < 220 && bh > 0 && bh < 220) {
            node.click();
            sleep(500);
            if (!isJiakaoUpdateDialogVisible()) return true;
        }
    }

    // 2. 在「立即更新」蓝色按钮下方点击（X 在按钮下面）
    var btn = textContains("立即更新").findOne(800);
    if (btn) {
        var bb = btn.bounds();
        click(bb.centerX(), bb.bottom + Math.floor(h * 0.065));
        sleep(500);
        if (!isJiakaoUpdateDialogVisible()) return true;
    }

    // 3. 屏幕比例坐标（K80 类长屏，X 约在 72% 高度）
    click(Math.floor(w * 0.5), Math.floor(h * 0.72));
    sleep(500);
    if (!isJiakaoUpdateDialogVisible()) return true;

    click(Math.floor(w * 0.5), Math.floor(h * 0.68));
    sleep(400);
    if (!isJiakaoUpdateDialogVisible()) return true;

    // 4. OpenCV 关闭图
    if (clickCloseByImage() && !isJiakaoUpdateDialogVisible()) return true;

    return false;
}

/** 关闭常见广告/活动弹窗 */
function dismissPopups(rounds, textList) {
    rounds = rounds || 3;
    textList = textList || POPUP_CLOSE_TEXTS;
    for (var r = 0; r < rounds; r++) {
        if (dismissJiakaoUpdateDialog()) {
            sleep(300);
            continue;
        }
        var closed = false;
        for (var i = 0; i < textList.length; i++) {
            var w = textContains(textList[i]).findOne(400);
            if (w) {
                w.click();
                sleep(300);
                closed = true;
                break;
            }
        }
        if (!closed) {
            var d = descContains("关闭").findOne(300) || descContains("跳过").findOne(300);
            if (d) {
                d.click();
                sleep(300);
                closed = true;
            }
        }
        if (!closed && r === rounds - 1) {
            closed = clickCloseByImage();
            if (closed) sleep(300);
        }
        if (!closed) break;
    }
}

/** 约课流程中避免误点「取消」「立即更新」 */
function dismissPopupsSafe(rounds) {
    if (dismissJiakaoUpdateDialog()) {
        sleep(300);
        return;
    }
    if (textContains("我要约课").exists()
        || textContains("立即预约").exists()
        || textContains("未开放").exists()) {
        dismissPopups(rounds || 2, POPUP_CLOSE_TEXTS_SAFE);
    } else {
        dismissPopups(rounds || 3);
    }
}

/** 开屏广告：等待「跳过」出现 */
function dismissSplashAd(maxWaitMs) {
    maxWaitMs = maxWaitMs || 8000;
    var deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
        var skip = textContains("跳过").findOne(500)
            || textContains("Skip").findOne(300)
            || id(JIAKAO_PKG + ":id/skip").findOne(300);
        if (skip) {
            skip.click();
            sleep(500);
            dismissPopups(2);
            return true;
        }
        sleep(300);
    }
    dismissPopups(2);
    return false;
}

/** 文字优先，失败再找图 */
function clickPartialOrImage(text, imgPath, timeout) {
    if (clickPartial(text, timeout || 400)) return true;
    if (imgPath) return clickByImage(imgPath, 0.88);
    return false;
}

/** 等待驾考宝典到前台（period 为检测间隔 ms） */
function waitJiakaoForeground(maxWaitMs) {
    var deadline = Date.now() + (maxWaitMs || 15000);
    while (Date.now() < deadline) {
        if (currentPackage() === JIAKAO_PKG) return true;
        sleep(300);
    }
    return false;
}

/** 打开驾考宝典（勿先 home；shell 勿用 root） */
function launchJiakao() {
    toast("正在启动驾考宝典…");

    app.startActivity({
        packageName: JIAKAO_PKG,
        className: JIAKAO_MAIN,
        flags: ["activity_new_task"],
    });
    sleep(800);

    app.launch(JIAKAO_PKG);
    sleep(500);

    shell("am start -n " + JIAKAO_PKG + "/" + JIAKAO_MAIN);
    sleep(800);

    app.launchPackage(JIAKAO_PKG);
    sleep(500);

    if (waitJiakaoForeground(8000)) return true;

    app.launchApp("驾考宝典");
    sleep(2000);
    app.launchPackage(JIAKAO_PKG);
    if (waitJiakaoForeground(8000)) return true;

    return false;
}

// 1. 打开驾考宝典
if (!launchJiakao()) {
    toast("自动启动未成功，10秒内请手动打开驾考宝典");
    if (typeof waitForPackage === "function") {
        waitForPackage(JIAKAO_PKG, 200);
    } else {
        waitJiakaoForeground(10000);
    }
}
toast("驾考宝典前台: " + currentPackage());
sleep(3000);

// 2. 关闭开屏广告 / 活动弹窗
sleep(1500);
dismissSplashAd(8000);
dismissPopups(3);

// 3. 点击底部导航"我的"
dismissPopupsSafe(2);
var mine = text("我的").findOne(5000)
        || textContains("我的").findOne(2000);
if (mine) {
    mine.click();
    sleep(1500);
} else {
    toast("未找到'我的'按钮！");
    exit();
}

// 4. 先滑动到页面末尾，再向上滑动300px
// 滑动到底部（多次滑动确保到底）
for (var i = 0; i < 5; i++) {
    swipe(540, 1400, 540, 400, 500); // 从下往上滑（向下滚动页面）
    sleep(400);
}
sleep(800);

// 再向下滑动1000px（回滚一点）
swipe(540, 800, 540, 1800, 500); // 从上往下滑1000px
sleep(800);

// 5. 点击"我要约课"
dismissPopupsSafe(2);
var bookBtn = text("我要约课").findOne(5000)
           || textContains("约课").findOne(3000);
if (bookBtn) {
    bookBtn.click();
    sleep(1500);
} else {
    toast("未找到'我要约课'按钮！");
    exit();
}

// ==============================
// 7. 定时抢约（停今天 → 到点点明天 → 循环：7:30 → 预约 → 我知道了 → 今天）
// ==============================

var WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// 意向抢购时间（到点执行交叉点击、选时段、立即预约）格式 HH:mm:ss
var rushTime = "09:00:00";
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
