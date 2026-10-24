# macOS Maximize Spaces

[简体中文](README.md) | English

A KWin script that gives each maximized window its own temporary virtual desktop, with a workflow inspired by macOS Spaces.

Requires **KWin / KDE Plasma 6.7+**. Implemented against the KWin 6.7.4 header APIs.

## Build from source

```sh
python3 tools/package.py
node tests/lifecycle.cjs
node tests/main.test.cjs
```

The installable package is written to `dist/macos-maximize-spaces.kwinscript`.

## Install and enable

Open **System Settings → Window Management → KWin Scripts → Install from File**, select `macos-maximize-spaces.kwinscript`, then enable **macOS Maximize Spaces** and apply.

Alternatively, install from a terminal:

```sh
kpackagetool6 --type KWin/Script --install /full/path/to/macos-maximize-spaces.kwinscript
```

To update an existing installation, replace `--install` with `--upgrade`. You still need to enable the script in System Settings after installation.

## Behavior

- After login, remove all desktops without application windows, including leftovers from earlier sessions and manually created empty desktops. Always retain at least one desktop. Keep the current desktop if it is occupied; otherwise switch to the first occupied desktop. If all desktops are empty, keep only the current desktop.
- Run cleanup once, 30 seconds after the script loads. Each new window during the wait restarts the 30-second delay to allow session restoration and autostart applications to open. Manually re-enabling the script triggers the same cleanup. Applications that start after cleanup use the resulting desktop layout.
- Minimized windows, windows on other outputs, and transient dialogs count as occupying a desktop. Desktop backgrounds, panels, and windows pinned to all desktops do not block cleanup.
- Fully maximizing a window creates a desktop immediately to the right of its original desktop and moves the window there. If you are on the original desktop, the script switches to the new one.
- Minimizing, closing, or unmaximizing the window removes its temporary desktop. Windows that remain open are returned to their original desktops.
- Restoring a minimized window creates a new temporary desktop if the window is still maximized.
- Horizontal-only or vertical-only maximization does not trigger the script. F11 fullscreen does not trigger it either.
- Windows are managed individually. Other regular windows belonging to the same application stay where they are.
- Enabling the script does not move existing maximized windows. Unmaximize and maximize them again to trigger it.
- Closing a window in the background does not interrupt you if you have already switched to another desktop.
- Manually moving a managed window out of its temporary desktop preserves your chosen location and attempts to remove the empty desktop.
- Windows pinned to all desktops and transient dialogs are excluded.

After startup cleanup, normal window operations only remove temporary desktops created during the current run. If other windows have been placed on a temporary desktop, that desktop is kept and no longer managed. If the original desktop has been deleted, another available desktop is used instead. Startup cleanup also updates return desktops for managed windows.

## Validation and limitations

The original maximize behavior has been tested on a real system. JavaScript syntax checks, nine simulated lifecycle scenarios, and 18 startup cleanup and regression tests pass. The new startup cleanup still needs validation with a real KWin login and session restoration.

When KWin's desktop limit is reached, the window stays in place. Window rules and other desktop management scripts may affect behavior; in particular, “Virtual Desktops Only on Primary” may conflict with this script.

Before disabling or updating the script, or logging out, unmaximize managed windows so their temporary desktops can be cleaned up. KWin scripts do not provide a reliable shutdown cleanup callback. After logging in again, startup cleanup removes leftover empty desktops and retains desktops with windows. Desktop switching animations are controlled by KDE's desktop effects.

## Uninstall

Unmaximize managed windows first, disable the script in KWin Scripts settings, then run:

```sh
kpackagetool6 --type KWin/Script --remove macos-maximize-spaces
```

API reference: [KDE KWin scripting API](https://develop.kde.org/docs/plasma/kwin/api/). The implementation was also checked against the `maximizeMode`, `maximizedChanged`, `minimizedChanged`, and `closed` declarations in the local `/usr/include/kwin/window.h`.
