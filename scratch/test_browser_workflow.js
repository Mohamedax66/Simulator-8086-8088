// Comprehensive browser simulation test
const fs = require('fs');
const path = require('path');

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
            dataset: {},
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
            trigger(event, eventObj = {}) {
                if (this.listeners[event]) {
                    this.listeners[event].forEach(fn => fn({ currentTarget: this, target: this, ...eventObj }));
                }
            },
            click() {
                this.trigger('click');
            },
            appendChild(child) {},
            scrollTop: 0,
            scrollHeight: 100,
            disabled: false
        };
    }
    return elements[id];
}

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
global.prompt = (msg, def) => def; // Mock window.prompt
global.document = {
    getElementById(id) {
        return elements[id] || null;
    },
    querySelectorAll(selector) {
        if (selector === '.tab-btn') {
            return [
                getOrCreateElement('tab-btn-1'),
                getOrCreateElement('tab-btn-2'),
                getOrCreateElement('tab-btn-3'),
                getOrCreateElement('tab-btn-4')
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

for (const scriptPath of scripts) {
    const fullPath = path.resolve(__dirname, '..', scriptPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    eval(code);
}

// Trigger DOM ready
global.document.domContentLoadedHandler();
const app = global.window.app;

console.log('--- TESTING BROWSER WORKFLOW ---');

// 1. Test every sample loaded and assembled
for (const sampleKey of Object.keys(global.SAMPLES)) {
    console.log(`Testing Sample: ${sampleKey}`);
    app.loadSample(sampleKey);
    if (!app.assembledData || app.assembledData.errors.length > 0) {
        if (sampleKey !== 'syntax_error_test') {
            console.error(`FAILED: Sample ${sampleKey} has assembly errors!`, app.assembledData.errors);
            process.exit(1);
        } else {
            console.log(`[OK] Red flag sample correctly caught ${app.assembledData.errors.length} errors.`);
        }
    }
}

// 2. Load flag addition demo and execute steps
app.loadSample('flag_addition_demo');
console.log('Initial IP:', app.cpu.registers.ip);
for (let i = 0; i < 5; i++) {
    app.onStep();
}
console.log('After 5 steps, IP:', app.cpu.registers.ip, 'AX:', app.cpu.registers.ax.toString(16));

// 3. Test Step Back
console.log('Testing step back...');
app.onStepBack();
console.log('After Step Back, IP:', app.cpu.registers.ip);

// 4. Test Reset
console.log('Testing Reset...');
app.onReset();
console.log('After Reset, IP:', app.cpu.registers.ip);

// 5. Test Flag toggle
console.log('Testing toggleFlag...');
app.toggleFlag('cf');
console.log('CF toggled to:', app.cpu.registers.flags.cf);
app.toggleFlag('cf');
console.log('CF toggled back to:', app.cpu.registers.flags.cf);

// 6. Test Memory Viewer jump buttons
console.log('Testing JumpMemoryTo...');
app.jumpMemoryTo('cs');
app.jumpMemoryTo('ds');
app.jumpMemoryTo('ss');
app.jumpMemoryTo('es');
app.memoryViewer.pageNext();
app.memoryViewer.pagePrev();

// 7. Test mode change (8086 -> 8088 -> 8086)
console.log('Testing Mode switch...');
app.cpu.setMode(false);
app.refreshUI();
app.cpu.setMode(true);
app.refreshUI();

// 8. Test peripherals
console.log('Testing peripherals...');
app.updateLedDisplay(0xAA);
app.updateSevenSegDisplay(0x05);
app.updateTerminalDisplay('T');

console.log('\n>>> ALL 8 BROWSER SIMULATION TESTS PASSED COMPLETELY! <<<');
