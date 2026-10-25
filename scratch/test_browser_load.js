// Test simulating browser load of all scripts in exact index.html order
const fs = require('fs');
const path = require('path');

// Setup mock browser window and document
const elements = {};
function getOrCreateElement(id) {
    if (!elements[id]) {
        elements[id] = {
            id,
            tagName: 'DIV',
            innerHTML: '',
            textContent: '',
            value: '',
            style: {},
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                toggle(c, v) { if (v === undefined) { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); } else { if (v) this.classes.add(c); else this.classes.delete(c); } },
                contains(c) { return this.classes.has(c); }
            },
            listeners: {},
            addEventListener(event, fn) {
                if (!this.listeners[event]) this.listeners[event] = [];
                this.listeners[event].push(fn);
            },
            click() {
                if (this.listeners['click']) {
                    this.listeners['click'].forEach(fn => fn({ currentTarget: this }));
                }
            },
            appendChild(child) {},
            scrollTop: 0,
            scrollHeight: 100,
            disabled: false
        };
    }
    return elements[id];
}

// Pre-create known elements from index.html
const knownIds = [
    'btn-theme-toggle', 'theme-icon', 'cpu-mode-select', 'sample-select',
    'btn-assemble', 'btn-run', 'btn-step', 'btn-step-back', 'btn-stop', 'btn-reset',
    'run-speed-slider', 'speed-display', 'file-input-asm', 'btn-upload-asm',
    'btn-download-asm', 'btn-copy-code', 'assembly-status', 'line-numbers',
    'code-editor-textarea', 'diagnostics-container', 'arch-visualizer-container',
    'flags-rationale-box', 'memory-viewer-container', 'led-hex-display',
    'sevenseg-char', 'port1-input-hex', 'terminal-screen', 'manual-mem-addr',
    'tab-architecture', 'tab-memory', 'tab-peripherals', 'tab-notes'
];
knownIds.forEach(id => getOrCreateElement(id));
for (let i = 0; i < 8; i++) getOrCreateElement(`led-bit-${i}`);
['seg-a', 'seg-b', 'seg-c', 'seg-d', 'seg-e', 'seg-f', 'seg-g'].forEach(id => getOrCreateElement(id));

global.window = global;
global.document = {
    getElementById(id) {
        return elements[id] || null;
    },
    querySelectorAll(selector) {
        if (selector === '.tab-btn') {
            return [
                { dataset: { tab: 'tab-architecture' }, classList: getOrCreateElement('tab-btn-1').classList, addEventListener(e, fn) {} },
                { dataset: { tab: 'tab-memory' }, classList: getOrCreateElement('tab-btn-2').classList, addEventListener(e, fn) {} },
                { dataset: { tab: 'tab-peripherals' }, classList: getOrCreateElement('tab-btn-3').classList, addEventListener(e, fn) {} },
                { dataset: { tab: 'tab-notes' }, classList: getOrCreateElement('tab-btn-4').classList, addEventListener(e, fn) {} }
            ];
        }
        if (selector === '.tab-pane') {
            return [
                getOrCreateElement('tab-architecture'),
                getOrCreateElement('tab-memory'),
                getOrCreateElement('tab-peripherals'),
                getOrCreateElement('tab-notes')
            ];
        }
        return [];
    },
    createElement(tag) {
        const el = getOrCreateElement('created-' + Math.random());
        el.tagName = tag.toUpperCase();
        return el;
    },
    documentElement: {
        getAttribute(attr) { return 'dark'; },
        setAttribute(attr, val) {}
    },
    addEventListener(event, fn) {
        if (event === 'DOMContentLoaded') {
            this.domContentLoadedHandler = fn;
        }
    }
};

global.localStorage = {
    getItem(k) { return null; },
    setItem(k, v) {}
};

global.navigator = {
    clipboard: {
        writeText(text) { return Promise.resolve(); }
    }
};

const scripts = [
    'js/cpu/registers.js',
    'js/cpu/alu.js',
    'js/cpu/memory.js',
    'js/cpu/biu.js',
    'js/cpu/eu.js',
    'js/cpu/cpu_8086.js',
    'js/assembler/validator.js',
    'js/assembler/parser.js',
    'js/assembler/assembler.js',
    'js/peripherals/io_system.js',
    'js/ui/samples.js',
    'js/ui/arch_visualizer.js',
    'js/ui/memory_view.js',
    'js/ui/editor.js',
    'js/app.js'
];

console.log('Loading scripts...');
for (const scriptPath of scripts) {
    try {
        const fullPath = path.resolve(__dirname, '..', scriptPath);
        const code = fs.readFileSync(fullPath, 'utf8');
        // Execute in global context
        eval(code);
        console.log(`[OK] Loaded: ${scriptPath}`);
    } catch (err) {
        console.error(`[ERROR] Failed to load ${scriptPath}:`, err);
        process.exit(1);
    }
}

console.log('\nTriggering DOMContentLoaded...');
try {
    if (global.document.domContentLoadedHandler) {
        global.document.domContentLoadedHandler();
        console.log('[OK] DOMContentLoaded executed successfully.');
        console.log('[OK] window.app created:', !!global.window.app);
    }
} catch (err) {
    console.error('[ERROR] DOMContentLoaded failed:', err);
    process.exit(1);
}
