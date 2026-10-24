// SPDX-License-Identifier: MIT
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, '../contents/code/main.js'), 'utf8');
function signal() {
    const callbacks = [];
    return {
        connect(callback) { callbacks.push(callback); },
        emit(...args) { callbacks.slice().forEach(callback => callback(...args)); }
    };
}
function session({ count = 4, current = 0, windows = [], creationFails = false,
    removalFails = false } = {}) {
    let now = 0;
    const timers = [];
    const warnings = [];
    class QTimer {
        constructor() { this.timeout = signal(); timers.push(this); }
        start() { this.due = now + this.interval; }
    }
    const desktops = Array.from({ length: count }, (_, i) => ({ id: i }));
    const allWindows = [];
    const removed = [];
    const workspace = {
        desktops: desktops.slice(), currentDesktop: desktops[current],
        windowAdded: signal(), windowList: () => allWindows.slice(),
        createDesktop(position, name) {
            if (!creationFails) this.desktops.splice(position, 0, { name });
        },
        removeDesktop(desktop) {
            assert.ok(this.desktops.length > 1, 'must retain at least one desktop');
            assert.notEqual(this.currentDesktop, desktop, 'switch before deleting current');
            if (removalFails) return;
            removed.push(desktop);
            this.desktops.splice(this.desktops.indexOf(desktop), 1);
            allWindows.forEach(w => {
                if (w.desktops.includes(desktop)) {
                    w.desktops = w.desktops.filter(d => d !== desktop);
                    if (!w.desktops.length) w.desktops = [this.currentDesktop];
                }
            });
        }
    };
    function window(spec = {}) {
        const w = {
            normalWindow: true, transient: false, onAllDesktops: false,
            minimized: false, deleted: false, desktopWindow: false, dock: false,
            maximizeMode: 0, caption: 'Application',
            maximizedChanged: signal(), minimizedChanged: signal(),
            desktopsChanged: signal(), closed: signal(), ...spec
        };
        let assigned = (spec.desktops || [0]).map(i => desktops[i]);
        Object.defineProperty(w, 'desktops', {
            get() { return assigned; },
            set(value) { assigned = value; w.desktopsChanged.emit(); }
        });
        allWindows.push(w);
        return w;
    }
    const initial = windows.map(window);
    runInNewContext(source, { workspace, QTimer, console: { warn: m => warnings.push(m) } });
    return {
        workspace, desktops, initial, removed, timers, warnings,
        add(spec) { const w = window(spec); workspace.windowAdded.emit(w); return w; },
        advance(ms) {
            const until = now + ms;
            let next;
            while ((next = timers.filter(t => t.due <= until).sort((a, b) => a.due - b.due)[0])) {
                now = next.due;
                next.due = next.singleShot ? Infinity : now + next.interval;
                next.timeout.emit();
            }
            now = until;
            assert.deepEqual(warnings, []);
        },
        change(w, key, value) {
            w[key] = value;
            w[key === 'maximizeMode' ? 'maximizedChanged' : 'minimizedChanged'].emit();
            assert.deepEqual(warnings, []);
        },
        close(w) {
            w.deleted = true;
            allWindows.splice(allWindows.indexOf(w), 1);
            w.closed.emit();
            assert.deepEqual(warnings, []);
        }
    };
}

test('startup waits 30 seconds then removes every empty desktop regardless of name', () => {
    const s = session({ windows: [{ desktops: [1] }] });
    s.advance(29999);
    assert.equal(s.removed.length, 0);
    s.advance(1);
    assert.deepEqual(s.workspace.desktops, [s.desktops[1]]);
    assert.equal(s.workspace.currentDesktop, s.desktops[1]);
});

test('all empty: retain exactly the current desktop', () => {
    const s = session({ current: 2 });
    s.advance(30000);
    assert.deepEqual(s.workspace.desktops, [s.desktops[2]]);
});

test('a single desktop is never removed', () => {
    const s = session({ count: 1 });
    s.advance(30000);
    assert.equal(s.removed.length, 0);
});

test('keep occupied current desktop and every other occupied desktop', () => {
    const s = session({ current: 2, windows: [{ desktops: [0, 2] }] });
    s.advance(30000);
    assert.deepEqual(s.workspace.desktops, [s.desktops[0], s.desktops[2]]);
    assert.equal(s.workspace.currentDesktop, s.desktops[2]);
});

test('minimized windows, dialogs, and windows on another output count as occupied', () => {
    const s = session({ windows: [
        { desktops: [1], minimized: true },
        { desktops: [2], normalWindow: false, transient: true },
        { desktops: [3], output: 'secondary' }
    ] });
    s.advance(30000);
    assert.deepEqual(s.workspace.desktops, s.desktops.slice(1));
});

test('backgrounds, panels, deleted windows and sticky windows do not block cleanup', () => {
    const s = session({ windows: [
        { desktops: [1], normalWindow: false, desktopWindow: true },
        { desktops: [2], normalWindow: false, dock: true },
        { desktops: [3], deleted: true },
        { desktops: [0, 1, 2, 3], onAllDesktops: true }
    ] });
    s.advance(30000);
    assert.deepEqual(s.workspace.desktops, [s.desktops[0]]);
});

test('each restored window restarts the grace period, and newly occupied desktops survive', () => {
    const s = session();
    s.advance(20000);
    s.add({ desktops: [1] });
    s.advance(20000);
    s.add({ desktops: [2] });
    s.advance(29999);
    assert.equal(s.removed.length, 0);
    s.advance(1);
    assert.deepEqual(s.workspace.desktops, [s.desktops[1], s.desktops[2]]);
});

test('occupancy is checked at cleanup time after a manual window move', () => {
    const s = session({ windows: [{}] });
    s.initial[0].desktops = [s.desktops[2]];
    s.advance(30000);
    assert.deepEqual(s.workspace.desktops, [s.desktops[2]]);
});

test('cleanup runs once and later window activity leaves manual empty desktops alone', () => {
    const s = session({ windows: [{}] });
    s.advance(30000);
    const manual = { name: 'Manual' };
    s.workspace.desktops.push(manual);
    const w = s.add({});
    s.close(w);
    s.close(s.initial[0]);
    s.advance(120000);
    assert.deepEqual(s.workspace.desktops, [s.desktops[0], manual]);
    assert.equal(s.timers[0].due, Infinity);
});

test('startup cleanup repairs return paths for maximized windows opened during login', () => {
    const s = session();
    const w = s.add({ maximizeMode: 3 });
    const temporary = w.desktops[0];
    s.advance(30000);
    assert.deepEqual(s.workspace.desktops, [temporary]);
    s.change(w, 'maximizeMode', 0);
    assert.deepEqual(Array.from(w.desktops), [temporary]);
    assert.deepEqual(s.workspace.desktops, [temporary]);
});

test('repaired return path uses another occupied desktop when available', () => {
    const s = session({ current: 1, windows: [{ desktops: [1] }] });
    const w = s.add({ desktops: [0], maximizeMode: 3 });
    const temporary = w.desktops[0];
    s.advance(30000);
    s.change(w, 'maximizeMode', 0);
    assert.deepEqual(Array.from(w.desktops), [s.desktops[1]]);
    assert.ok(!s.workspace.desktops.includes(temporary));
});

test('existing maximized windows are left in place on script load', () => {
    const s = session({ windows: [{ desktops: [1], maximizeMode: 3 }] });
    s.advance(30000);
    assert.deepEqual(s.workspace.desktops, [s.desktops[1]]);
    assert.deepEqual(s.initial[0].desktops, [s.desktops[1]]);
});

test('maximize, minimize, restore and unmaximize preserve the original lifecycle', () => {
    const s = session({ windows: [{}] });
    const w = s.initial[0];
    s.change(w, 'maximizeMode', 3);
    assert.equal(s.workspace.desktops.length, 5);
    assert.equal(s.workspace.currentDesktop, w.desktops[0]);
    s.change(w, 'minimized', true);
    assert.equal(s.workspace.desktops.length, 4);
    assert.deepEqual(Array.from(w.desktops), [s.desktops[0]]);
    s.change(w, 'minimized', false);
    assert.equal(s.workspace.desktops.length, 5);
    s.change(w, 'maximizeMode', 0);
    assert.equal(s.workspace.desktops.length, 4);
    assert.deepEqual(Array.from(w.desktops), [s.desktops[0]]);
});

test('closing a background managed window does not switch desktops', () => {
    const s = session();
    const w = s.add({ maximizeMode: 3 });
    s.workspace.currentDesktop = s.desktops[2];
    s.close(w);
    assert.equal(s.workspace.currentDesktop, s.desktops[2]);
    assert.equal(s.workspace.desktops.length, 4);
});

test('keep a temporary desktop that another window occupies', () => {
    const s = session();
    const w = s.add({ maximizeMode: 3 });
    const temporary = w.desktops[0];
    const other = s.add({});
    other.desktops = [temporary];
    s.change(w, 'maximizeMode', 0);
    assert.ok(s.workspace.desktops.includes(temporary));
});

test('manual move away releases the temporary desktop and respects destination', () => {
    const s = session();
    const w = s.add({ maximizeMode: 3 });
    w.desktops = [s.desktops[3]];
    assert.equal(s.workspace.desktops.length, 4);
    assert.deepEqual(Array.from(w.desktops), [s.desktops[3]]);
});

test('desktop creation limit leaves window in place', () => {
    const s = session({ creationFails: true });
    const w = s.add({ maximizeMode: 3 });
    assert.deepEqual(Array.from(w.desktops), [s.desktops[0]]);
    assert.equal(s.workspace.desktops.length, 4);
});

test('failed desktop removal does not corrupt a managed window return path', () => {
    const s = session({ removalFails: true, current: 1, windows: [{ desktops: [1] }] });
    const w = s.add({ maximizeMode: 3 });
    s.advance(30000);
    s.change(w, 'maximizeMode', 0);
    assert.deepEqual(Array.from(w.desktops), [s.desktops[0]]);
});
