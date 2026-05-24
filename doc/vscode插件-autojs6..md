

### 连接到计算机

1. 打开 **命令面板**，选择 **AutoJs6: 建立设备连接 (Connect)** `[Ctrl+Alt+F6]`，或点击相应的菜单按钮
2. 使用下述方式之一建立设备连接（任选其一）：

#### AutoJs6 (客户端) > VSCode (服务端) | 局域网

**拓扑**：手机主动连 PC；VSCode 监听，AutoJs6 发起 Socket。

**前置**：同一 LAN；PC 防火墙放行 VSCode/插件端口；禁用 `node test.js` 本地执行。

| 步骤 | 端 | 操作 |
|------|-----|------|
| 1 | VSCode | `Ctrl+Alt+F6` → Connect → 选局域网服务端 |
| 2 | VSCode | 记录弹窗 IPv4（或 `ipconfig` → 当前网卡 IPv4） |
| 3 | AutoJs6 | 侧栏 → **客户端模式** ON |
| 4 | AutoJs6 | 填入步骤 2 的 PC IP → 连接 |
| 5 | VSCode | 弹窗 `AutoJs6 设备接入: ${DEVICE} (${IP})` → 就绪 |

**验证**：打开 `.js` → `F6` Run；手机 toast / OUTPUT 有日志即通。

**排错**：连不上 → 核对网段、IP 是否漂移、客户端模式是否仍 ON、重连 Connect。

#### AutoJs6 (服务端) < VSCode (客户端) | 局域网

1. AutoJs6 侧拉菜单中开启 **「服务端模式」**
2. VSCode 输入 AutoJs6 所在设备的 IP 地址

#### AutoJs6 (服务端) < VSCode (客户端) | ADB (USB)

1. AutoJs6 侧拉菜单中开启 **「服务端模式」**
2. AutoJs6 所在设备通过 USB 连接到 VSCode 所在计算机
3. AutoJs6 所在设备需启用 **USB 调试** 并勾选信任上述计算机
4. 不同设备操作方式可能不同，详见设备厂商手册或相关互联网资料

#### 历史记录 (IP)

- 连接成功后的设备 IP 地址会记录在列表中，方便选择
- AutoJs6 需启用 **「服务端模式」**
- 设备 IP 地址可能发生改变
- 使用 **「清理」** 选项清除所有已保存的记录

连接完成后，VSCode 弹窗显示：

```text
AutoJs6 设备接入: ${DEVICE} (${IP_ADDRESS})
```

### 执行命令

1. 打开 **命令面板**，查看并执行支持的命令（快捷键详见下述 **「命令」** 板块）
2. 例如：**AutoJs6: 运行脚本 (Run)**、**AutoJs6: 停止所有脚本 (Stop All)** 等
3. 部分功能可通过点击相应的菜单按钮实现

### 查看日志

采用下述方式之一查看来自 AutoJs6 的日志（任选其一）：

- 在建立设备连接后弹出的 **OUTPUT / 输出** 面板 `[F12]` 查看
- 打开 **开发人员工具**，在 **Console** 面板查看

### 断开连接

采用下述方式之一断开所有 AutoJs6 与 VSCode 建立的连接（任选其一）：

- 打开 **命令面板**，选择 **AutoJs6: 断开所有连接 (Disconnect All)** `[Ctrl+Alt+Shift+F6]`
- 在 AutoJs6 侧拉菜单关闭对应开关（客户端 / 服务端）
- 断开 AutoJs6 的 USB 连接（仅适用于 ADB (USB) 连接方式）
- 退出 AutoJs6 应用 / 关闭 VSCode 软件

---

## 命令 (Commands)

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| 查看在线文档 (View Online Document) | `Alt+Shift+F6` | 查看 AutoJs6 在线开发文档 |
| 建立设备连接 (Connect) | `Ctrl+Alt+F6` | 建立 AutoJs6 与 VSCode 的连接；AutoJs6 相关开关可能需要手动开启 |
| 断开所有连接 (Disconnect All) | `Ctrl+Alt+Shift+F6` | 断开所有已建立的连接；AutoJs6 相关开关状态可能被重置 |
| 运行脚本 (Run) | `F6` | 运行当前 VSCode 对应的脚本；对所有已连接的设备有效 |
| 重新运行脚本 (Rerun) | — | 停止当前脚本并重新运行；对所有已连接的设备有效 |
| 停止当前脚本 (Stop) | `Ctrl+F6` | 停止当前 VSCode 对应的脚本；对所有已连接的设备有效 |
| 停止所有脚本 (Stop All) | `Ctrl+Shift+F6` | 停止所有正在运行的脚本；对所有已连接的设备有效 |
| 保存到所有设备 (Save) | — | 保存当前文件到已连接设备的 AutoJs6 工作目录；对所有已连接的设备有效 |
| 指定设备运行 (Run On Device) | — | 弹出设备菜单并指定运行脚本的设备 |
| 保存到指定设备 (Save To Device) | — | 弹出设备菜单并指定保存脚本的设备 |
| 新建项目 (New Project) | `Ctrl+Alt+6` `N` | 选择（或创建后选择）空文件夹用于新建 AutoJs6 项目；新建后执行 `npm run dts-link` 或 `npm run dts` 可完成声明文件部署 |
| 运行项目 (Run Project) | `Ctrl+Alt+6` `R` / `Alt+F6` | 运行一个 AutoJs6 项目 |
| 保存项目到设备 (Save Project) | `Ctrl+Alt+6` `S` | 保存一个 AutoJs6 项目 |

---

## 版本历史 (Release Notes)

### v1.0.13

**2026/03/14**

- **优化** 重构设备端 Socket 分帧协议：使用固定 8 字节二进制帧头（int32BE 长度 + 类型）替代旧的文本式头部写入方式
- **优化** TCP 流解析逻辑使用基于累积缓冲区的循环拆帧模型，提升对半包与粘包场景的处理可靠性
- **优化** 增加帧合法性校验（类型检查与最大帧长度限制），用于尽早发现协议失步并防止异常内存膨胀
- **优化** 发送 JSON 及二进制数据时移除不必要的字符串中转流程

### v1.0.12

**2025/04/14**

- **修复** 服务端模式因版本判断失误导致无法连接的问题（[issue #27](https://github.com/SuperMonster003/AutoJs6-VSCode-Extension/issues/27)）
- **优化** 新建项目支持使用 `dts-link` 脚本任务自动创建 AutoJs6 声明文件软链接（[issue #8](https://github.com/SuperMonster003/AutoJs6-VSCode-Extension/issues/8)）

### v1.0.11

**2025/04/14**

- **修复** VSCode 编辑器菜单栏运行项目及保存项目按钮功能失效的问题（Ref to terwer）pr #25 issue #26 issue #24 issue #23

更多版本历史可参阅 [CHANGELOG.md](https://github.com/SuperMonster003/AutoJs6-VSCode-Extension/blob/master/CHANGELOG.md)。

---

## 相关项目

| 项目 | 作者 | 说明 |
|------|------|------|
| [AutoJs6](https://github.com/SuperMonster003/AutoJs6) | SuperMonster003 | 安卓平台 JavaScript 自动化工具（二次开发项目） |
| [AutoJs6-TypeScript-Declarations](https://github.com/SuperMonster003/AutoJs6-TypeScript-Declarations) | SuperMonster003 | AutoJs6 声明文件（代码智能补全） |
| [Auto.js-VSCode-Extension](https://github.com/hyb1996/Auto.js-VSCode-Extension) | hyb1996 | Auto.js VSCode 开发插件 |
| Auto.js-VSCode-Extension | 710850609 | Auto.js VSCode 开发插件（二次开发项目） |
| Auto.js-VSCode-Extension | kkevsekk1 | Auto.js VSCode 开发插件（二次开发项目） |
