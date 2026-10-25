/**
 * 8086 Memory & Addressing Modes UI Component
 * Renders:
 *  - Hex Memory Inspector with Jump to Segment targets
 *  - Logical Segment Ranges (CS, DS, SS, ES)
 *  - Active Addressing Mode Explanation
 *  - Direct Memory Byte Editing
 */

class MemoryViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentBaseAddress = 0x20000; // Default: DS base
        this.rowsToShow = 16;
    }

    setBaseAddress(addr) {
        this.currentBaseAddress = Math.max(0, Math.min(0xFFFFF - (this.rowsToShow * 16), addr & 0xFFFFF));
    }

    pagePrev() {
        this.setBaseAddress(this.currentBaseAddress - (this.rowsToShow * 16));
        if (window.app) this.render(window.app.cpu);
    }

    pageNext() {
        this.setBaseAddress(this.currentBaseAddress + (this.rowsToShow * 16));
        if (window.app) this.render(window.app.cpu);
    }

    render(cpu) {
        if (!this.container) return;

        const mem = cpu.memory;
        const regs = cpu.registers;
        const eu = cpu.eu;
        const addressing = eu ? eu.lastAddressingMode : null;

        // Calculate Segment starting and ending addresses
        const csStart = (regs.cs << 4) & 0xFFFFF;
        const csEnd = (csStart + 0xFFFF) & 0xFFFFF;
        const dsStart = (regs.ds << 4) & 0xFFFFF;
        const dsEnd = (dsStart + 0xFFFF) & 0xFFFFF;
        const ssStart = (regs.ss << 4) & 0xFFFFF;
        const ssEnd = (ssStart + 0xFFFF) & 0xFFFFF;
        const esStart = (regs.es << 4) & 0xFFFFF;
        const esEnd = (esStart + 0xFFFF) & 0xFFFFF;

        // Build Hex Dump
        let hexRows = '';
        const base = Math.floor(this.currentBaseAddress / 16) * 16;
        for (let r = 0; r < this.rowsToShow; r++) {
            const rowAddr = (base + (r * 16)) & 0xFFFFF;
            let byteHexes = '';
            let asciiStr = '';

            for (let c = 0; c < 16; c++) {
                const cellAddr = (rowAddr + c) & 0xFFFFF;
                const b = mem.data[cellAddr];
                const hexVal = b.toString(16).toUpperCase().padStart(2, '0');
                const isEven = (cellAddr % 2 === 0);
                
                // Check if this byte was accessed in the last bus activity (supports both 8-bit and 16-bit word access!)
                const bus = mem.lastBusActivity;
                const isAccess = bus && bus.type !== 'IDLE' && (
                    bus.address === cellAddr || 
                    (bus.dataWidth === 16 && (bus.address + 1) === cellAddr)
                );

                byteHexes += `<span class="mem-byte ${isAccess ? 'accessed' : ''} ${isEven ? 'even-bank-byte' : 'odd-bank-byte'}" title="Addr: ${cellAddr.toString(16).toUpperCase()}h (${isEven ? 'Even Bank' : 'Odd Bank'}) - Click to edit" onclick="window.app.onEditMemoryByte(${cellAddr})">${hexVal}</span>`;
                asciiStr += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
            }

            hexRows += `
                <div class="mem-row">
                    <span class="row-addr">${rowAddr.toString(16).toUpperCase().padStart(5, '0')}h:</span>
                    <div class="row-bytes">${byteHexes}</div>
                    <span class="row-ascii">${asciiStr}</span>
                </div>
            `;
        }

        this.container.innerHTML = `
            <div class="memory-inspector-component">
                
                <!-- TOP CONTROLS & SEGMENT SHORTCUTS -->
                <div class="mem-nav-bar">
                    <div class="quick-jump-btns">
                        <button class="btn btn-sm" onclick="window.app.jumpMemoryTo('cs')">CS:IP (${csStart.toString(16).toUpperCase()}h)</button>
                        <button class="btn btn-sm" onclick="window.app.jumpMemoryTo('ds')">DS (${dsStart.toString(16).toUpperCase()}h)</button>
                        <button class="btn btn-sm" onclick="window.app.jumpMemoryTo('ss')">SS:SP (${((ssStart + regs.sp) & 0xFFFFF).toString(16).toUpperCase()}h)</button>
                        <button class="btn btn-sm" onclick="window.app.jumpMemoryTo('es')">ES (${esStart.toString(16).toUpperCase()}h)</button>
                        <button class="btn btn-sm" onclick="window.app.memoryViewer.pagePrev()" title="Previous 256 bytes">&#9664; Prev</button>
                        <button class="btn btn-sm" onclick="window.app.memoryViewer.pageNext()" title="Next 256 bytes">Next &#9654;</button>
                    </div>
                    <div class="addr-input-group">
                        <label>Physical Addr:</label>
                        <input type="text" id="manual-mem-addr" placeholder="e.g. 20000h" value="${this.currentBaseAddress.toString(16).toUpperCase()}h" />
                        <button class="btn btn-sm btn-primary" onclick="window.app.onManualAddressGo()">Go</button>
                    </div>
                </div>

                <!-- ADDRESSING MODE DETAIL CARD -->
                ${addressing && addressing.name !== 'None' ? `
                <div class="addressing-mode-card">
                    <div class="mode-header">
                        <span class="badge badge-accent">8086 Addressing Mode</span>
                        <strong>${addressing.name}</strong>
                    </div>
                    <div class="mode-body">
                        <div class="detail-row"><span>Formula:</span> <code>${addressing.effectiveAddressFormula}</code></div>
                        <div class="detail-row"><span>Effective Address (EA):</span> <strong>${addressing.effectiveAddress.toString(16).toUpperCase().padStart(4, '0')}h</strong></div>
                        <div class="detail-row"><span>Segment & Physical Addr:</span> <strong>${addressing.segmentUsed} &#10142; ${addressing.physicalAddress.toString(16).toUpperCase().padStart(5, '0')}h</strong></div>
                    </div>
                </div>
                ` : ''}

                <!-- ACTIVE SEGMENTS OVERVIEW TABLE -->
                <div class="segments-summary">
                    <table class="segments-table">
                        <thead>
                            <tr>
                                <th>Segment</th>
                                <th>Register</th>
                                <th>Start Address</th>
                                <th>End Address (64KB)</th>
                                <th>Default Offset</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><span class="dot cs-dot"></span> <strong>Code (CS)</strong></td>
                                <td>${regs.cs.toString(16).toUpperCase()}h</td>
                                <td>${csStart.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>${csEnd.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>IP (${regs.ip.toString(16).toUpperCase()}h)</td>
                            </tr>
                            <tr>
                                <td><span class="dot ds-dot"></span> <strong>Data (DS)</strong></td>
                                <td>${regs.ds.toString(16).toUpperCase()}h</td>
                                <td>${dsStart.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>${dsEnd.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>BX, SI, DI, Disp</td>
                            </tr>
                            <tr>
                                <td><span class="dot ss-dot"></span> <strong>Stack (SS)</strong></td>
                                <td>${regs.ss.toString(16).toUpperCase()}h</td>
                                <td>${ssStart.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>${ssEnd.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>SP (${regs.sp.toString(16).toUpperCase()}h), BP</td>
                            </tr>
                            <tr>
                                <td><span class="dot es-dot"></span> <strong>Extra (ES)</strong></td>
                                <td>${regs.es.toString(16).toUpperCase()}h</td>
                                <td>${esStart.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>${esEnd.toString(16).toUpperCase().padStart(5, '0')}h</td>
                                <td>DI (Strings)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- HEX MEMORY VIEW -->
                <div class="hex-grid-container">
                    <div class="hex-header-row">
                        <span class="row-addr">Address</span>
                        <div class="row-bytes">
                            ${[...Array(16).keys()].map(i => `<span>+${i.toString(16).toUpperCase()}</span>`).join('')}
                        </div>
                        <span class="row-ascii">ASCII</span>
                    </div>
                    <div class="hex-dump-rows">
                        ${hexRows}
                    </div>
                </div>

            </div>
        `;
    }
}

if (typeof window !== 'undefined') window.MemoryViewer = MemoryViewer;
if (typeof module !== 'undefined') module.exports = MemoryViewer;
