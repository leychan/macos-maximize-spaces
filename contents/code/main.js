// SPDX-License-Identifier: MIT
// KWin 6.7+: maximizeMode is the committed (not requested) state.
(function () {
    'use strict';
    const records = new Map();
    const watched = new Set();
    const startupCleanupTimer = new QTimer();
    let startupCleanupPending = true;
    let busy = false;
    function exists(d) { return workspace.desktops.indexOf(d) !== -1; }
    function fallback(r) {
        return r.original.filter(exists)[0] || workspace.desktops.filter(d => d !== r.desktop)[0];
    }
    function occupied(desktop, ignored) {
        return workspace.windowList().some(w =>
            w !== ignored && !w.deleted && !w.desktopWindow && !w.dock &&
            !w.onAllDesktops && w.desktops.indexOf(desktop) !== -1);
    }
    function removeDesktop(desktop, target) {
        if (!exists(desktop) || !exists(target) || desktop === target ||
            workspace.desktops.length <= 1) return;
        if (workspace.currentDesktop === desktop) workspace.currentDesktop = target;
        workspace.removeDesktop(desktop);
        if (exists(desktop)) return;
        // Preserve return paths, including homes removed by startup cleanup.
        records.forEach(r => {
            r.original = r.original.map(d => d === desktop ? target : d);
        });
    }
    function cleanupEmptyDesktops() {
        const desktops = workspace.desktops.slice();
        // Keep the current desktop when possible; if all are empty, keep it alone.
        const target = desktops.filter(d => d === workspace.currentDesktop && occupied(d))[0] ||
            desktops.filter(d => occupied(d))[0] || workspace.currentDesktop;
        desktops.forEach(d => {
            if (d !== target && !occupied(d)) removeDesktop(d, target);
        });
    }
    function release(w, closed, restore) {
        const r = records.get(w);
        if (!r) return;
        records.delete(w);
        const target = fallback(r);
        if (!target) return;
        if (!closed && restore) {
            const original = r.original.filter(exists);
            w.desktops = original.length ? original : [target];
        }
        // A background window closing must not interrupt another desktop.
        if (workspace.currentDesktop === r.desktop) workspace.currentDesktop = target;
        // Keep a desktop if the user has moved other windows into it.
        if (!occupied(r.desktop, w)) removeDesktop(r.desktop, target);
    }
    function enter(w) {
        if (records.has(w) || !w.normalWindow || w.transient || w.onAllDesktops ||
            w.minimized || w.deleted || Number(w.maximizeMode) !== 3) return;
        const before = workspace.desktops.slice();
        const original = w.desktops.slice();
        if (!original.length) return;
        const current = workspace.currentDesktop;
        const home = original.indexOf(current) !== -1 ? current : original[0];
        const position = before.indexOf(home) + 1;
        workspace.createDesktop(position, 'Space · ' + (w.caption || 'Window').slice(0, 48));
        const added = workspace.desktops.filter(d => before.indexOf(d) === -1);
        if (added.length !== 1) return; // Desktop limit or creation failure.
        const desktop = added[0];
        records.set(w, { desktop: desktop, original: original });
        w.desktops = [desktop];
        // Window rules or another script may reject the move.
        if (w.onAllDesktops || w.desktops.indexOf(desktop) === -1) {
            release(w, false, false);
            return;
        }
        if (current === home) workspace.currentDesktop = desktop;
    }
    function run(action) {
        if (busy) return;
        busy = true;
        try { action(); } catch (e) { console.warn('macos-maximize-spaces: ' + e); }
        finally { busy = false; }
    }
    function update(w) {
        run(function () {
            if (w.minimized || Number(w.maximizeMode) !== 3) release(w, false, true);
            else enter(w);
        });
    }
    function watch(w, isNew) {
        if (watched.has(w) || !w.normalWindow) return;
        if (typeof w.maximizeMode === 'undefined') {
            console.warn('macos-maximize-spaces requires KWin 6.7+');
            return;
        }
        watched.add(w);
        w.maximizedChanged.connect(() => update(w));
        w.minimizedChanged.connect(() => update(w));
        w.desktopsChanged.connect(() => run(function () {
            const r = records.get(w);
            if (r && (w.onAllDesktops || w.desktops.indexOf(r.desktop) === -1))
                release(w, false, false);
        }));
        w.closed.connect(() => {
            run(() => release(w, true, false));
            watched.delete(w);
        });
        if (isNew) update(w);
    }
    workspace.windowAdded.connect(w => {
        // Let restored/autostart applications finish opening before checking emptiness.
        if (startupCleanupPending) startupCleanupTimer.start();
        watch(w, true);
    });
    // Do not rearrange already-open windows just by enabling the script.
    workspace.windowList().forEach(w => watch(w, false));
    // Run once per script load (login or manual re-enable), never on later closes.
    startupCleanupTimer.interval = 30000;
    startupCleanupTimer.singleShot = true;
    startupCleanupTimer.timeout.connect(() => {
        startupCleanupPending = false;
        run(cleanupEmptyDesktops);
    });
    startupCleanupTimer.start();
})();
