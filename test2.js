// 测试：200ms 切换周五/周六，直到「未开放」消失

var dayA = "周五";
var dayB = "周六";
var deadline = Date.now() + 20000; // 最多测 20s
var loadingMaxMs = 600;
var stableChecks = 2;
var stableIntervalMs = 35;

function clickDay(text) {
    var w = textContains(text).findOne(500);
    if (w) w.click();
}

function isLoading() {
    return textContains("加载").exists()
        || className("android.widget.ProgressBar").exists();
}

function waitLoadingDone(maxWait) {
    maxWait = maxWait || loadingMaxMs;
    var end = Date.now() + maxWait;
    while (Date.now() < end) {
        if (!isLoading()) return true;
        sleep(20);
    }
    return !isLoading();
}

/** 加载结束且短时连续无「未开放」才算真开放 */
function isDayOpen() {
    if (!waitLoadingDone(loadingMaxMs)) return false;
    for (var i = 0; i < stableChecks; i++) {
        if (textContains("未开放").exists() || isLoading()) return false;
        sleep(stableIntervalMs);
    }
    return true;
}

while (Date.now() < deadline) {
    clickDay(dayA);
    sleep(80);
    clickDay(dayB);
    if (isDayOpen()) {
        toast("未开放 无了");
        sleep(50);
        var btn = textContains("立即预约").findOne(2000);
        if (btn) {
            btn.click();
            toast("已点击 立即预约");
        } else {
            toast("未找到 立即预约");
        }
        break;
    }
}


