/**
 * Complete 8086 Microprocessor Coordinator
 * Manages the interaction between BIU, EU, Memory, Registers, and System Buses.
 * Implements:
 *  - Fetch / Decode / Execute Cycle
 *  - Pipelining simulation (Prefetch Queue fill while executing)
 *  - Clock Cycle counting (with bus penalties for 8086 vs 8088)
 *  - Step Back / Undo history snapshots
 */

if (typeof require !== 'undefined') {
    if (typeof Registers === 'undefined') global.Registers = require('./registers.js');
    if (typeof ALU === 'undefined') global.ALU = require('./alu.js');
    if (typeof MemorySystem === 'undefined') global.MemorySystem = require('./memory.js');
    if (typeof BusInterfaceUnit === 'undefined') global.BusInterfaceUnit = require('./biu.js');
    if (typeof ExecutionUnit === 'undefined') global.ExecutionUnit = require('./eu.js');
}

class CPU8086 {
    constructor(is8086 = true) {
        this.is8086 = is8086;
        this.registers = new Registers();
        this.alu = new ALU(this.registers);
        this.memory = new MemorySystem(is8086);
        this.biu = new BusInterfaceUnit(this.registers, this.memory, is8086);
        this.io = null; // Injected later
        this.eu = null; // Initialized in init()

        this.program = null; // Assembled instructions array
        this.assembledSourceLines = [];

        this.clockCycles = 0;
        this.instructionCount = 0;
        this.isHalted = false;
        this.haltReason = '';

        this.history = []; // Snapshots for Step Back
        this.maxHistory = 100;

        this.onStateChange = null;
    }

    setIoSystem(io) {
        this.io = io;
        this.eu = new ExecutionUnit(this.registers, this.alu, this.biu, this.memory, this.io);
    }

    setMode(is8086) {
        this.is8086 = is8086;
        this.memory.setCpuMode(is8086);
        this.biu.setCpuMode(is8086);
    }

    reset() {
        this.registers.reset();
        this.memory.reset();
        this.biu.flushQueue();
        this.clockCycles = 0;
        this.instructionCount = 0;
        this.isHalted = false;
        this.haltReason = '';
        this.history = [];
        if (this.onStateChange) this.onStateChange();
    }

    loadProgram(assembled) {
        this.reset();
        this.program = assembled.instructions;
        this.assembledSourceLines = assembled.sourceLines || [];
        this.registers.ip = 0;
        this.biu.flushQueue(0);

        // Load code segment into memory at CS:0000h (e.g. 10000H)
        if (assembled.codeBytes && assembled.codeBytes.length > 0) {
            const codeBasePa = (this.registers.cs << 4) & 0xFFFFF;
            for (let i = 0; i < assembled.codeBytes.length; i++) {
                this.memory.data[codeBasePa + i] = assembled.codeBytes[i];
            }
        }

        // Load data segment image into memory if present at DS:0000h (e.g. 20000H)
        if (assembled.dataBytes && assembled.dataBytes.length > 0) {
            const dataBasePa = (this.registers.ds << 4) & 0xFFFFF;
            for (let i = 0; i < assembled.dataBytes.length; i++) {
                this.memory.data[dataBasePa + i] = assembled.dataBytes[i];
            }
        }

        // Fill BIU prefetch queue
        this.biu.fillQueue();

        if (this.onStateChange) this.onStateChange();
    }

    saveSnapshot() {
        if (this.history.length >= this.maxHistory) {
            this.history.shift();
        }
        this.history.push({
            registers: this.registers.getSnapshot(),
            memory: this.memory.getSnapshot(),
            biu: this.biu.getSnapshot(),
            clockCycles: this.clockCycles,
            instructionCount: this.instructionCount,
            isHalted: this.isHalted,
            haltReason: this.haltReason
        });
    }

    stepBack() {
        if (this.history.length === 0) return false;
        const snap = this.history.pop();
        this.registers.restoreSnapshot(snap.registers);
        this.memory.restoreSnapshot(snap.memory);
        this.biu.restoreSnapshot(snap.biu);
        this.clockCycles = snap.clockCycles;
        this.instructionCount = snap.instructionCount;
        this.isHalted = snap.isHalted;
        this.haltReason = snap.haltReason;

        if (this.onStateChange) this.onStateChange();
        return true;
    }

    // --- Single Step Execution (Fetch -> Decode -> Execute) ---
    step() {
        if (this.isHalted || !this.program || this.program.length === 0) {
            return { halted: true, reason: this.haltReason || 'No program loaded' };
        }

        const ip = this.registers.ip;
        if (ip >= this.program.length) {
            this.isHalted = true;
            this.haltReason = 'End of program reached';
            if (this.onStateChange) this.onStateChange();
            return { halted: true, reason: this.haltReason };
        }

        // 1. Save state for Step Back
        this.saveSnapshot();

        // 2. Fetch from Program (Simulating queue popping)
        const instruction = this.program[ip];

        // 3. Increment IP before execution
        this.registers.ip = ip + 1;

        // 4. Execute instruction in EU
        const execResult = this.eu.execute(instruction);

        // 5. Update Clock Cycles
        // Base cycles for instruction + bus penalties
        const busCycles = this.memory.lastBusActivity ? this.memory.lastBusActivity.cyclesTaken : 1;
        this.clockCycles += (instruction.baseCycles || 2) + (busCycles - 1);
        this.instructionCount++;

        // 6. Refill BIU Prefetch Queue (Pipelining in background)
        this.biu.fillQueue();

        if (execResult.halted) {
            this.isHalted = true;
            this.haltReason = execResult.reason;
        }

        if (this.onStateChange) this.onStateChange();
        return {
            halted: this.isHalted,
            instruction,
            execResult
        };
    }
}

if (typeof window !== 'undefined') window.CPU8086 = CPU8086;
if (typeof module !== 'undefined') module.exports = CPU8086;
