/**
 * 8086 Interactive Architecture Visualizer
 * Renders the live internal block diagram of the 8086 microprocessor:
 *  - BIU (Segment Regs, IP, 20-bit Adder, FIFO Prefetch Queue)
 *  - EU (Instruction Decoder, ALU, Registers, Flags)
 *  - System Buses (Address, Data, Control)
 *  - Memory Banks (Even Bank / Odd Bank with A0 & BHE# indicators)
 */

class ArchitectureVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    render(cpu) {
        if (!this.container) return;

        const regs = cpu.registers;
        const biu = cpu.biu;
        const alu = cpu.alu;
        const mem = cpu.memory;
        const bus = mem.lastBusActivity;
        const addrCalc = biu.lastGeneratedAddress;
        const lastExec = cpu.eu ? cpu.eu.lastExecuted : null;
        const queue = biu.queue;
        const queueCap = biu.queueCapacity;

        let queueHtml = '';
        for (let i = 0; i < queueCap; i++) {
            const item = queue[i];
            const byteStr = item ? item.byte.toString(16).toUpperCase().padStart(2, '0') + 'h' : '--';
            const isHead = (i === 0 && item);
            queueHtml += `
                <div class="queue-slot ${item ? 'filled' : 'empty'} ${isHead ? 'head' : ''}">
                    <span class="slot-idx">B${i + 1}</span>
                    <span class="slot-val">${byteStr}</span>
                </div>
            `;
        }

        const currentInstr = lastExec ? lastExec.instruction.sourceText : (cpu.program && cpu.program[regs.ip] ? cpu.program[regs.ip].sourceText : 'HLT');

        this.container.innerHTML = `
            <div class="arch-diagram">
                <!-- TOP HEADER: CPU MODE & PIPELINE STATUS -->
                <div class="arch-header">
                    <div class="mode-badge ${cpu.is8086 ? 'mode-8086' : 'mode-8088'}">
                        Mode: <strong>${cpu.is8086 ? 'Intel 8086 (16-bit Bus, 6B Queue)' : 'Intel 8088 (8-bit Bus, 4B Queue)'}</strong>
                    </div>
                    <div class="cycle-badge">
                        Clock Cycles: <strong>${cpu.clockCycles}</strong> | Instructions Executed: <strong>${cpu.instructionCount}</strong>
                    </div>
                </div>

                <!-- MAIN DUAL-UNIT GRID -->
                <div class="units-grid">
                    
                    <!-- [1] BUS INTERFACE UNIT (BIU) -->
                    <div class="unit-card biu-card">
                        <div class="unit-title">
                            <span>Bus Interface Unit (BIU)</span>
                            <span class="sub-title">Fetch & Address Generation</span>
                        </div>

                        <!-- Segment Registers & IP -->
                        <div class="reg-group biu-regs">
                            <div class="reg-badge"><span>CS:</span> <strong>${regs.cs.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                            <div class="reg-badge"><span>DS:</span> <strong>${regs.ds.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                            <div class="reg-badge"><span>SS:</span> <strong>${regs.ss.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                            <div class="reg-badge"><span>ES:</span> <strong>${regs.es.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                            <div class="reg-badge ip-reg"><span>IP:</span> <strong>${regs.ip.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                        </div>

                        <!-- 20-Bit Address Generation Adder -->
                        <div class="address-adder-box">
                            <div class="box-label">20-Bit Dedicated Adder (Segment * 10H + Offset)</div>
                            <div class="adder-formula">${addrCalc ? addrCalc.formula : 'CS * 10H + IP'}</div>
                            <div class="pa-result">Physical Address: <strong>${addrCalc ? addrCalc.physicalAddr.toString(16).toUpperCase().padStart(5, '0') : '00000'}h</strong></div>
                        </div>

                        <!-- Instruction Prefetch Queue (FIFO) -->
                        <div class="prefetch-queue-box">
                            <div class="box-label">Instruction Prefetch Queue (FIFO - ${queueCap} Bytes)</div>
                            <div class="queue-slots-container">
                                ${queueHtml}
                            </div>
                            <div class="queue-flow-arrow">
                                <span>FIFO to EU Decoder</span> &#10142;
                            </div>
                        </div>
                    </div>

                    <!-- [2] EXECUTION UNIT (EU) -->
                    <div class="unit-card eu-card">
                        <div class="unit-title">
                            <span>Execution Unit (EU)</span>
                            <span class="sub-title">Decode & Execute</span>
                        </div>

                        <!-- Instruction Decoder -->
                        <div class="decoder-box">
                            <div class="box-label">Instruction Decoder & Control Logic</div>
                            <div class="current-opcode">Active: <code>${currentInstr}</code></div>
                        </div>

                        <!-- General Purpose Registers -->
                        <div class="reg-group eu-regs">
                            <div class="reg-badge"><span>AX:</span> <strong>${regs.ax.toString(16).toUpperCase().padStart(4, '0')}h</strong> <small>(${regs.getReg8('ah').toString(16).padStart(2,'0')}:${regs.getReg8('al').toString(16).padStart(2,'0')})</small></div>
                            <div class="reg-badge"><span>BX:</span> <strong>${regs.bx.toString(16).toUpperCase().padStart(4, '0')}h</strong> <small>(${regs.getReg8('bh').toString(16).padStart(2,'0')}:${regs.getReg8('bl').toString(16).padStart(2,'0')})</small></div>
                            <div class="reg-badge"><span>CX:</span> <strong>${regs.cx.toString(16).toUpperCase().padStart(4, '0')}h</strong> <small>(${regs.getReg8('ch').toString(16).padStart(2,'0')}:${regs.getReg8('cl').toString(16).padStart(2,'0')})</small></div>
                            <div class="reg-badge"><span>DX:</span> <strong>${regs.dx.toString(16).toUpperCase().padStart(4, '0')}h</strong> <small>(${regs.getReg8('dh').toString(16).padStart(2,'0')}:${regs.getReg8('dl').toString(16).padStart(2,'0')})</small></div>
                            <div class="reg-badge"><span>SP:</span> <strong>${regs.sp.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                            <div class="reg-badge"><span>BP:</span> <strong>${regs.bp.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                            <div class="reg-badge"><span>SI:</span> <strong>${regs.si.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                            <div class="reg-badge"><span>DI:</span> <strong>${regs.di.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                        </div>

                        <!-- 16-Bit ALU -->
                        <div class="alu-box">
                            <div class="box-label">16-Bit ALU (Arithmetic & Logic Unit)</div>
                            <div class="alu-status">${alu.lastFlagsRationale.operation || 'Ready for operations'}</div>
                        </div>

                        <!-- Status & Control Flags -->
                        <div class="flags-box">
                            <div class="box-label">Flag Register (16-bit): Status & Control (Click to Toggle)</div>
                            <div class="flag-badges">
                                <span class="flag-pill ${regs.flags.of ? 'on' : ''}" title="Overflow Flag (Click to toggle)" onclick="window.app.toggleFlag('of')">OF: ${regs.flags.of}</span>
                                <span class="flag-pill ${regs.flags.df ? 'on' : ''}" title="Direction Flag (Click to toggle)" onclick="window.app.toggleFlag('df')">DF: ${regs.flags.df}</span>
                                <span class="flag-pill ${regs.flags.if ? 'on' : ''}" title="Interrupt Flag (Click to toggle)" onclick="window.app.toggleFlag('if')">IF: ${regs.flags.if}</span>
                                <span class="flag-pill ${regs.flags.tf ? 'on' : ''}" title="Trap Flag (Click to toggle)" onclick="window.app.toggleFlag('tf')">TF: ${regs.flags.tf}</span>
                                <span class="flag-pill ${regs.flags.sf ? 'on' : ''}" title="Sign Flag (Click to toggle)" onclick="window.app.toggleFlag('sf')">SF: ${regs.flags.sf}</span>
                                <span class="flag-pill ${regs.flags.zf ? 'on' : ''}" title="Zero Flag (Click to toggle)" onclick="window.app.toggleFlag('zf')">ZF: ${regs.flags.zf}</span>
                                <span class="flag-pill ${regs.flags.af ? 'on' : ''}" title="Auxiliary Carry Flag (Click to toggle)" onclick="window.app.toggleFlag('af')">AF: ${regs.flags.af}</span>
                                <span class="flag-pill ${regs.flags.pf ? 'on' : ''}" title="Parity Flag (Click to toggle)" onclick="window.app.toggleFlag('pf')">PF: ${regs.flags.pf}</span>
                                <span class="flag-pill ${regs.flags.cf ? 'on' : ''}" title="Carry Flag (Click to toggle)" onclick="window.app.toggleFlag('cf')">CF: ${regs.flags.cf}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SYSTEM BUSES & PHYSICAL MEMORY BANKS -->
                <div class="buses-and-memory-section">
                    <div class="bus-lines-card">
                        <div class="unit-title">
                            <span>System Interconnect Buses</span>
                            <span class="sub-title">Connecting CPU with Memory & I/O</span>
                        </div>

                        <div class="buses-display">
                            <!-- Address Bus: 20 Lines, Unidirectional -->
                            <div class="bus-line address-bus active">
                                <span class="bus-tag">Address Bus (20-bit, Unidirectional A0 - A19):</span>
                                <span class="bus-data">${bus ? bus.address.toString(16).toUpperCase().padStart(5, '0') + 'h' : '00000h'}</span>
                            </div>

                            <!-- Data Bus: 16-bit for 8086, 8-bit for 8088, Bidirectional -->
                            <div class="bus-line data-bus ${bus.type !== 'IDLE' ? 'active' : ''}">
                                <span class="bus-tag">Data Bus (${cpu.is8086 ? '16-bit D0 - D15' : '8-bit D0 - D7'}, Bidirectional):</span>
                                <span class="bus-data">${bus.type !== 'IDLE' ? (bus.dataValue.toString(16).toUpperCase() + 'h [' + bus.type + ']') : 'High-Z (Idle)'}</span>
                            </div>

                            <!-- Control Bus: RD#, WR#, A0, BHE# -->
                            <div class="bus-line control-bus">
                                <span class="bus-tag">Control Bus Signals:</span>
                                <span class="ctrl-sig ${bus.type === 'READ' ? 'sig-on' : ''}">RD# = ${bus.type === 'READ' ? '0' : '1'}</span>
                                <span class="ctrl-sig ${bus.type === 'WRITE' ? 'sig-on' : ''}">WR# = ${bus.type === 'WRITE' ? '0' : '1'}</span>
                                <span class="ctrl-sig ${bus.a0 === 0 ? 'sig-on' : ''}">A0 = ${bus.a0}</span>
                                ${cpu.is8086 ? `<span class="ctrl-sig ${bus.bhe_n === 0 ? 'sig-on' : ''}">BHE# = ${bus.bhe_n}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Physical Memory Organization: Two Banks (Lecture 2) -->
                    <div class="memory-banks-card">
                        <div class="unit-title">
                            <span>Physical Memory Organization</span>
                            <span class="sub-title">${cpu.is8086 ? 'Two 512KB Banks (1MB Total)' : 'Single 1MB Bank'}</span>
                        </div>

                        <div class="banks-container">
                            <!-- Even Bank (Low Bank) -->
                            <div class="bank-box ${bus.evenBankActive ? 'bank-active' : ''}">
                                <div class="bank-title">Even Bank (Low Bank)</div>
                                <div class="bank-specs">512 KB | Addresses: Even (0, 2, 4...)</div>
                                <div class="bank-control">Selected by: <strong>A0 = 0</strong></div>
                                <div class="bank-lines">Data Lines: <strong>D0 - D7</strong></div>
                                <div class="bank-state">${bus.evenBankActive ? 'ACTIVE (Reading/Writing)' : 'Standby'}</div>
                            </div>

                            <!-- Odd Bank (High Bank) - in 8086 mode only -->
                            ${cpu.is8086 ? `
                            <div class="bank-box ${bus.oddBankActive ? 'bank-active' : ''}">
                                <div class="bank-title">Odd Bank (High Bank)</div>
                                <div class="bank-specs">512 KB | Addresses: Odd (1, 3, 5...)</div>
                                <div class="bank-control">Selected by: <strong>BHE# = 0</strong></div>
                                <div class="bank-lines">Data Lines: <strong>D8 - D15</strong></div>
                                <div class="bank-state">${bus.oddBankActive ? 'ACTIVE (Reading/Writing)' : 'Standby'}</div>
                            </div>
                            ` : `
                            <div class="bank-box disabled-bank">
                                <div class="bank-title">8088 Single Bank Mode</div>
                                <div class="bank-specs">8088 has only one 1MB bank and 8-bit data bus</div>
                            </div>
                            `}
                        </div>
                    </div>
                </div>

            </div>
        `;
    }
}

if (typeof window !== 'undefined') window.ArchitectureVisualizer = ArchitectureVisualizer;
if (typeof module !== 'undefined') module.exports = ArchitectureVisualizer;
