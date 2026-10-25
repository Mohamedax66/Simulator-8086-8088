/**
 * 8086 Web Simulator & Visual Architecture - Master Application Controller
 */

class AppController {
    constructor() {
        this.cpu = new CPU8086(true); // Default: 8086 mode
        this.io = new IOSystem();
        this.cpu.setIoSystem(this.io);

        this.editor = null;
        this.visualizer = null;
        this.memoryViewer = null;

        this.runTimer = null;
        this.runSpeedMs = 300; // ms per step
        this.assembledData = null;

        this.init();
    }

    init() {
        // Initialize UI components
        this.editor = new CodeEditor('editor-container', 'line-numbers', 'code-editor-textarea', 'diagnostics-container');
        this.visualizer = new ArchitectureVisualizer('arch-visualizer-container');
        this.memoryViewer = new MemoryViewer('memory-viewer-container');

        // Wire Peripherals Callbacks
        this.io.onLedChange = (val) => this.updateLedDisplay(val);
        this.io.onSevenSegChange = (val) => this.updateSevenSegDisplay(val);
        this.io.onTerminalWrite = (char) => this.updateTerminalDisplay(char);

        // Wire CPU Callbacks
        this.cpu.onStateChange = () => this.refreshUI();

        // Populate Samples Dropdown
        this.populateSamples();

        // Load Default Sample
        this.loadSample('flag_addition_demo');

        // Render Initial UI
        this.refreshUI();
        this.initEventListeners();
    }

    initEventListeners() {
        // Assemble Button
        document.getElementById('btn-assemble').addEventListener('click', () => this.onAssemble());

        // Debugger Controls
        document.getElementById('btn-run').addEventListener('click', () => this.onRun());
        document.getElementById('btn-step').addEventListener('click', () => this.onStep());
        document.getElementById('btn-step-back').addEventListener('click', () => this.onStepBack());
        document.getElementById('btn-stop').addEventListener('click', () => this.onStop());
        document.getElementById('btn-reset').addEventListener('click', () => this.onReset());

        // Speed Slider
        const speedSlider = document.getElementById('run-speed-slider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.runSpeedMs = parseInt(e.target.value, 10);
                document.getElementById('speed-display').textContent = `${this.runSpeedMs}ms`;
            });
        }

        // Mode Switch (8086 vs 8088)
        const modeSelect = document.getElementById('cpu-mode-select');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                const is8086 = (e.target.value === '8086');
                this.cpu.setMode(is8086);
                this.refreshUI();
            });
        }

        // Sample Selector
        const sampleSelect = document.getElementById('sample-select');
        if (sampleSelect) {
            sampleSelect.addEventListener('change', (e) => {
                this.loadSample(e.target.value);
            });
        }

        // Port 1 User Input
        const port1Input = document.getElementById('port1-input-hex');
        if (port1Input) {
            port1Input.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 16);
                if (!isNaN(val)) this.io.setInputPort1(val);
            });
        }

        // --- Theme Switcher (Light / Dark Mode) ---
        const themeBtn = document.getElementById('btn-theme-toggle');
        if (themeBtn) {
            const updateThemeIcon = (theme) => {
                const iconEl = document.getElementById('theme-icon');
                if (iconEl) iconEl.innerHTML = (theme === 'light') ? '&#9728;' : '&#9790;';
            };
            let currentTheme = 'dark';
            try {
                currentTheme = localStorage.getItem('theme') || (document.documentElement.getAttribute('data-theme') || 'dark');
            } catch (e) {
                currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            }
            updateThemeIcon(currentTheme);

            themeBtn.addEventListener('click', () => {
                const active = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', active);
                try {
                    localStorage.setItem('theme', active);
                } catch (e) {}
                updateThemeIcon(active);
            });
        }

        // --- Copy Code to Clipboard ---
        const copyBtn = document.getElementById('btn-copy-code');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const code = this.editor.getValue();
                try {
                    await navigator.clipboard.writeText(code);
                    const origText = copyBtn.innerHTML;
                    copyBtn.innerHTML = '&#10004; Copied!';
                    setTimeout(() => copyBtn.innerHTML = origText, 1500);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });
        }

        // --- Download .asm File ---
        const downloadBtn = document.getElementById('btn-download-asm');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                const code = this.editor.getValue();
                const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = '8086_program.asm';
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        // --- Upload .asm File ---
        const uploadBtn = document.getElementById('btn-upload-asm');
        const fileInput = document.getElementById('file-input-asm');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.editor.setValue(event.target.result);
                    this.onAssemble();
                };
                reader.readAsText(file);
                fileInput.value = ''; // reset
            });
        }

        // Tab Navigation
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = e.currentTarget.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                e.currentTarget.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }

    populateSamples() {
        const select = document.getElementById('sample-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- Select a Sample 8086 Program --</option>';
        for (const [key, sample] of Object.entries(SAMPLES)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = sample.name;
            select.appendChild(opt);
        }
    }

    loadSample(key) {
        if (!SAMPLES[key]) return;
        this.onStop();
        this.editor.setValue(SAMPLES[key].code);
        this.editor.clearHighlights();
        this.onAssemble();
    }

    onAssemble() {
        this.onStop();
        const code = this.editor.getValue();
        this.assembledData = Assembler.assemble(code);

        const statusEl = document.getElementById('assembly-status');
        if (this.assembledData.errors.length > 0) {
            statusEl.className = 'status-msg error';
            statusEl.textContent = `Assembly Failed: ${this.assembledData.errors.length} error(s) flagged 🚩`;
            this.editor.setErrorDiagnostics(this.assembledData.errors);
            return;
        }

        statusEl.className = 'status-msg success';
        statusEl.textContent = `Assembled Successfully: ${this.assembledData.instructions.length} instructions.`;
        this.editor.clearHighlights();

        this.cpu.loadProgram(this.assembledData);
        this.highlightNextLine();
        this.refreshUI();
    }

    onStep() {
        if (!this.assembledData || this.cpu.isHalted) return;
        const res = this.cpu.step();
        this.highlightNextLine();
        if (res.halted) {
            this.onStop();
            document.getElementById('assembly-status').textContent = `Execution Halted: ${res.reason}`;
        }
    }

    onStepBack() {
        if (!this.assembledData) return;
        const ok = this.cpu.stepBack();
        if (ok) {
            this.highlightNextLine();
        }
    }

    onRun() {
        if (!this.assembledData || this.cpu.isHalted) return;
        if (this.runTimer) return;

        document.getElementById('btn-run').disabled = true;
        document.getElementById('btn-stop').disabled = false;

        this.runTimer = setInterval(() => {
            const ip = this.cpu.registers.ip;
            const currentLine = (this.cpu.program && this.cpu.program[ip]) ? this.cpu.program[ip].sourceLine : -1;

            // Check breakpoint
            if (this.editor.breakpoints.has(currentLine)) {
                this.onStop();
                return;
            }

            const res = this.cpu.step();
            this.highlightNextLine();

            if (res.halted) {
                this.onStop();
                document.getElementById('assembly-status').textContent = `Execution Halted: ${res.reason}`;
            }
        }, this.runSpeedMs);
    }

    onStop() {
        if (this.runTimer) {
            clearInterval(this.runTimer);
            this.runTimer = null;
        }
        document.getElementById('btn-run').disabled = false;
        document.getElementById('btn-stop').disabled = true;
    }

    onReset() {
        this.onStop();
        this.io.clearTerminal();
        this.updateLedDisplay(0);
        this.updateSevenSegDisplay(0);
        this.editor.clearHighlights();
        if (this.assembledData) {
            this.cpu.loadProgram(this.assembledData);
            this.highlightNextLine();
        } else {
            this.cpu.reset();
        }
        this.refreshUI();
    }

    highlightNextLine() {
        const ip = this.cpu.registers.ip;
        if (this.cpu.program && this.cpu.program[ip]) {
            this.editor.setActiveLine(this.cpu.program[ip].sourceLine);
        } else {
            this.editor.setActiveLine(-1);
        }
    }

    refreshUI() {
        this.visualizer.render(this.cpu);
        this.memoryViewer.render(this.cpu);
        this.updateRegistersAndFlagsUI();
    }

    updateRegistersAndFlagsUI() {
        const regs = this.cpu.registers;
        const alu = this.cpu.alu;

        // Update Flag explanations in Tooltip / Status bar
        const rationaleEl = document.getElementById('flags-rationale-box');
        if (rationaleEl && alu.lastFlagsRationale) {
            const r = alu.lastFlagsRationale;
            rationaleEl.innerHTML = `
                <div class="rationale-title">${r.operation || 'Status Flag Breakdown'}</div>
                <div class="rationale-list">
                    <div><strong>CF (${regs.flags.cf}):</strong> ${r.cf || 'Carry flag'}</div>
                    <div><strong>ZF (${regs.flags.zf}):</strong> ${r.zf || 'Zero flag'}</div>
                    <div><strong>SF (${regs.flags.sf}):</strong> ${r.sf || 'Sign flag'}</div>
                    <div><strong>OF (${regs.flags.of}):</strong> ${r.of || 'Overflow flag'}</div>
                    <div><strong>AF (${regs.flags.af}):</strong> ${r.af || 'Auxiliary carry'}</div>
                    <div><strong>PF (${regs.flags.pf}):</strong> ${r.pf || 'Parity flag'}</div>
                </div>
            `;
        }
    }

    // --- Memory Viewer Navigation ---
    jumpMemoryTo(segment) {
        let addr = 0x20000;
        if (segment === 'cs') {
            addr = ((this.cpu.registers.cs << 4) + this.cpu.registers.ip) & 0xFFFFF;
        } else if (segment === 'ds') {
            addr = (this.cpu.registers.ds << 4) & 0xFFFFF;
        } else if (segment === 'ss') {
            // Jump to the active stack top (SS:SP rounded to row boundary)
            addr = ((this.cpu.registers.ss << 4) + (this.cpu.registers.sp & 0xFFF0)) & 0xFFFFF;
        } else if (segment === 'es') {
            addr = (this.cpu.registers.es << 4) & 0xFFFFF;
        }
        this.memoryViewer.setBaseAddress(addr);
        this.memoryViewer.render(this.cpu);
    }

    // Toggle Flag manually when clicked in UI
    toggleFlag(flagName) {
        if (this.cpu.registers.flags[flagName] !== undefined) {
            this.cpu.registers.flags[flagName] = this.cpu.registers.flags[flagName] ? 0 : 1;
            this.refreshUI();
        }
    }

    // Direct Memory Editing from UI
    onEditMemoryByte(cellAddr) {
        const currentVal = this.cpu.memory.data[cellAddr].toString(16).toUpperCase().padStart(2, '0');
        const input = prompt(`Edit Memory Byte at Address ${cellAddr.toString(16).toUpperCase()}h:\nEnter Hex value (00 - FF):`, currentVal);
        if (input !== null) {
            const val = parseInt(input.trim(), 16);
            if (!isNaN(val)) {
                this.cpu.memory.writeByte(cellAddr, val & 0xFF);
                this.refreshUI();
            }
        }
    }

    onManualAddressGo() {
        const input = document.getElementById('manual-mem-addr');
        if (!input) return;
        const n = AssemblyParser.parseNumber(input.value);
        if (!isNaN(n)) {
            this.memoryViewer.setBaseAddress(n);
            this.memoryViewer.render(this.cpu);
        }
    }

    // --- Peripherals UI updates ---
    updateLedDisplay(val) {
        for (let i = 0; i < 8; i++) {
            const ledEl = document.getElementById(`led-bit-${i}`);
            if (ledEl) {
                const isOn = ((val >> i) & 1) === 1;
                ledEl.classList.toggle('led-on', isOn);
            }
        }
        const hexEl = document.getElementById('led-hex-display');
        if (hexEl) hexEl.textContent = `${val.toString(16).toUpperCase().padStart(2, '0')}h (${val})`;
    }

    updateSevenSegDisplay(nibble) {
        const segMap = {
            0x0: [1,1,1,1,1,1,0], 0x1: [0,1,1,0,0,0,0], 0x2: [1,1,0,1,1,0,1],
            0x3: [1,1,1,1,0,0,1], 0x4: [0,1,1,0,0,1,1], 0x5: [1,0,1,1,0,1,1],
            0x6: [1,0,1,1,1,1,1], 0x7: [1,1,1,0,0,0,0], 0x8: [1,1,1,1,1,1,1],
            0x9: [1,1,1,1,0,1,1], 0xA: [1,1,1,0,1,1,1], 0xB: [0,0,1,1,1,1,1],
            0xC: [1,0,0,1,1,1,0], 0xD: [0,1,1,1,1,0,1], 0xE: [1,0,0,1,1,1,1],
            0xF: [1,0,0,0,1,1,1]
        };
        const segs = segMap[nibble & 0x0F] || [0,0,0,0,0,0,0];
        const segIds = ['seg-a','seg-b','seg-c','seg-d','seg-e','seg-f','seg-g'];
        segIds.forEach((id, idx) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('seg-active', segs[idx] === 1);
        });
        const charEl = document.getElementById('sevenseg-char');
        if (charEl) charEl.textContent = (nibble & 0x0F).toString(16).toUpperCase();
    }

    updateTerminalDisplay(char) {
        const termEl = document.getElementById('terminal-screen');
        if (!termEl) return;
        if (char === null) {
            termEl.textContent = '';
        } else {
            termEl.textContent += char;
            termEl.scrollTop = termEl.scrollHeight;
        }
    }
}

// Bootstrap when DOM is ready
function startApp() {
    if (!window.app) {
        try {
            window.app = new AppController();
            console.log('8086 Simulator initialized successfully.');
        } catch (e) {
            console.error('Fatal initialization error:', e);
        }
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
}
