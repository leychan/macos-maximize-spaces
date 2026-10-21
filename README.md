# 最大化窗口独立桌面

适用于 **KWin / KDE Plasma 6.7+**，按本机 KWin 6.7.4 的头文件接口实现。

## 从源码打包

```sh
python3 tools/package.py
node tests/lifecycle.cjs
```

生成的安装包位于 `dist/macos-maximize-spaces.kwinscript`。

## 安装与启用

在系统设置 → 窗口管理 → KWin 脚本中选择“从文件安装”，选择 `macos-maximize-spaces.kwinscript`，然后勾选“最大化窗口独立桌面”并应用。

也可以在终端安装：

```sh
kpackagetool6 --type KWin/Script --install /完整路径/macos-maximize-spaces.kwinscript
```

更新已安装版本时，将 `--install` 换为 `--upgrade`。安装后仍需在系统设置中启用。

## 行为

- 窗口完全最大化时，在其所在桌面右侧创建一个桌面，将该窗口移过去；当前正在该窗口的原桌面时，同时切换过去。
- 最小化、关闭或取消最大化时，回收临时桌面；尚未关闭的窗口恢复原桌面归属。
- 最小化后再次恢复，如果窗口仍处于最大化状态，会重新创建临时桌面。
- 仅水平或垂直最大化不触发；F11 全屏不触发。
- 按单个窗口管理，同一应用的其他普通窗口留在原处。
- 启用时不迁移已经最大化的现有窗口；取消最大化再最大化即可触发。
- 若你已经切到其他桌面，后台窗口关闭不会强制将你切回。
- 手动将管理中的窗口移出临时桌面时，保留你选定的位置，并尝试回收空桌面。
- 排除所有桌面上的固定窗口和附属对话框。

只删除本次运行创建的临时桌面。如果其他窗口被放入该桌面，会保留该桌面并停止管理它，避免误删。若原桌面已被删除，则返回另一个可用桌面。

## 验证与限制

JavaScript 语法检查及 9 个模拟生命周期场景已通过。尚未进行真实 KWin 会话中的窗口交互测试。

建议启用后用普通应用验证：最大化 → 最小化 → 恢复 → 取消最大化 → 再次最大化 → 关闭。另测试多个窗口分别最大化。

桌面数量达到 KWin 上限时，不移动窗口。窗口规则或其他桌面管理脚本可能影响行为；尤其是“仅在主屏幕上切换虚拟桌面”可能与本脚本冲突。

停用、更新脚本或注销前，建议先取消受管理窗口的最大化，让临时桌面正常回收。KWin 脚本没有可靠的退出清理回调；重启后不会根据桌面名称猜测、删除遗留桌面，遗留桌面可在系统设置中手动删除。桌面切换动画由 KDE 的桌面特效控制。

## 卸载

先取消受管理窗口的最大化，再在 KWin 脚本设置中停用，然后执行：

```sh
kpackagetool6 --type KWin/Script --remove macos-maximize-spaces
```

接口参考：[KDE KWin scripting API](https://develop.kde.org/docs/plasma/kwin/api/)。实现也核对了本机 `/usr/include/kwin/window.h` 中的 `maximizeMode`、`maximizedChanged`、`minimizedChanged` 和 `closed` 声明。
