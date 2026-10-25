/**
 * 8086 Physical & Logical Memory System
 * Features:
 *  - 1 MB Physical Address Space (00000H - FFFFFH)
 *  - Dual-Bank Hardware Organization for 8086:
 *      * Even Bank (Low Bank - 512 KB) activated by A0 = 0 (Data D0..D7)
 *      * Odd Bank (High Bank - 512 KB) activated by BHE# = 0 (Data D8..D15)
 *  - Bus cycle simulation: Aligned word access (1 cycle) vs Misaligned word (2 cycles)
 *  - 8088 compatibility mode (Single 1 MB bank with 8-bit bus)
 *  - Little-Endian storage for Words and Double Words
 */

class MemorySystem {
    constructor(is8086 = true) {
        this.is8086 = is8086; // true = 8086 (2 banks), false = 8088 (1 bank)
        this.size = 1048576; // 1 MB = 2^20 bytes
        this.data = new Uint8Array(this.size);
        
        // Bus lines state for visualizer
        this.lastBusActivity = {
            type: 'IDLE', // 'READ' or 'WRITE'
            address: 0,
            dataWidth: 8, // 8 or 16 bits
            dataValue: 0,
            a0: 0,
            bhe_n: 1, // Active LOW (0 = asserted, 1 = negated)
            evenBankActive: false,
            oddBankActive: false,
            cyclesTaken: 1
        };

        this.onBusActivity = null; // UI hook
    }

    setCpuMode(is8086) {
        this.is8086 = is8086;
    }

    reset() {
        this.data.fill(0);
        this.lastBusActivity.type = 'IDLE';
    }

    // --- Read 8-bit Byte from Physical Address (20-bit) ---
    readByte(physicalAddr) {
        physicalAddr = physicalAddr & 0xFFFFF; // Wrap within 1MB
        const val = this.data[physicalAddr];
        const isEven = (physicalAddr % 2 === 0);

        if (this.is8086) {
            this.lastBusActivity = {
                type: 'READ',
                address: physicalAddr,
                dataWidth: 8,
                dataValue: val,
                a0: isEven ? 0 : 1,
                bhe_n: isEven ? 1 : 0,
                evenBankActive: isEven,
                oddBankActive: !isEven,
                cyclesTaken: 1
            };
        } else {
            // 8088 mode: Single bank, 8-bit bus
            this.lastBusActivity = {
                type: 'READ',
                address: physicalAddr,
                dataWidth: 8,
                dataValue: val,
                a0: isEven ? 0 : 1,
                bhe_n: 1,
                evenBankActive: true,
                oddBankActive: false,
                cyclesTaken: 1
            };
        }

        if (this.onBusActivity) this.onBusActivity(this.lastBusActivity);
        return val;
    }

    // --- Write 8-bit Byte to Physical Address ---
    writeByte(physicalAddr, val) {
        physicalAddr = physicalAddr & 0xFFFFF;
        val = val & 0xFF;
        this.data[physicalAddr] = val;
        const isEven = (physicalAddr % 2 === 0);

        if (this.is8086) {
            this.lastBusActivity = {
                type: 'WRITE',
                address: physicalAddr,
                dataWidth: 8,
                dataValue: val,
                a0: isEven ? 0 : 1,
                bhe_n: isEven ? 1 : 0,
                evenBankActive: isEven,
                oddBankActive: !isEven,
                cyclesTaken: 1
            };
        } else {
            this.lastBusActivity = {
                type: 'WRITE',
                address: physicalAddr,
                dataWidth: 8,
                dataValue: val,
                a0: isEven ? 0 : 1,
                bhe_n: 1,
                evenBankActive: true,
                oddBankActive: false,
                cyclesTaken: 1
            };
        }

        if (this.onBusActivity) this.onBusActivity(this.lastBusActivity);
    }

    // --- Read 16-bit Word (Little-Endian: Low byte at Address, High byte at Address + 1) ---
    readWord(physicalAddr) {
        physicalAddr = physicalAddr & 0xFFFFF;
        const lowByte = this.data[physicalAddr];
        const nextAddr = (physicalAddr + 1) & 0xFFFFF;
        const highByte = this.data[nextAddr];
        const wordVal = (highByte << 8) | lowByte;

        const isEven = (physicalAddr % 2 === 0);

        if (this.is8086) {
            if (isEven) {
                // Aligned Word Access: Read simultaneously in 1 Clock Cycle!
                // Even Bank: A0=0 (Data D0-D7), Odd Bank: BHE#=0 (Data D8-D15)
                this.lastBusActivity = {
                    type: 'READ',
                    address: physicalAddr,
                    dataWidth: 16,
                    dataValue: wordVal,
                    a0: 0,
                    bhe_n: 0,
                    evenBankActive: true,
                    oddBankActive: true,
                    cyclesTaken: 1
                };
            } else {
                // Misaligned Word Access: Starts at odd address -> Requires 2 Clock Cycles!
                // Cycle 1: Read high byte from Odd Bank (Address, BHE#=0, A0=1)
                // Cycle 2: Read low byte from Even Bank (Address+1, BHE#=1, A0=0)
                this.lastBusActivity = {
                    type: 'READ',
                    address: physicalAddr,
                    dataWidth: 16,
                    dataValue: wordVal,
                    a0: 1,
                    bhe_n: 0,
                    evenBankActive: true,
                    oddBankActive: true,
                    cyclesTaken: 2 // 2 cycles penalty
                };
            }
        } else {
            // 8088: Always takes 2 bus cycles to read 16-bit word!
            this.lastBusActivity = {
                type: 'READ',
                address: physicalAddr,
                dataWidth: 16,
                dataValue: wordVal,
                a0: isEven ? 0 : 1,
                bhe_n: 1,
                evenBankActive: true,
                oddBankActive: false,
                cyclesTaken: 2
            };
        }

        if (this.onBusActivity) this.onBusActivity(this.lastBusActivity);
        return wordVal;
    }

    // --- Write 16-bit Word (Little-Endian) ---
    writeWord(physicalAddr, val) {
        physicalAddr = physicalAddr & 0xFFFFF;
        val = val & 0xFFFF;
        const lowByte = val & 0xFF;
        const highByte = (val >> 8) & 0xFF;

        this.data[physicalAddr] = lowByte;
        this.data[(physicalAddr + 1) & 0xFFFFF] = highByte;

        const isEven = (physicalAddr % 2 === 0);

        if (this.is8086) {
            this.lastBusActivity = {
                type: 'WRITE',
                address: physicalAddr,
                dataWidth: 16,
                dataValue: val,
                a0: isEven ? 0 : 1,
                bhe_n: isEven ? 0 : 0,
                evenBankActive: true,
                oddBankActive: true,
                cyclesTaken: isEven ? 1 : 2
            };
        } else {
            this.lastBusActivity = {
                type: 'WRITE',
                address: physicalAddr,
                dataWidth: 16,
                dataValue: val,
                a0: isEven ? 0 : 1,
                bhe_n: 1,
                evenBankActive: true,
                oddBankActive: false,
                cyclesTaken: 2
            };
        }

        if (this.onBusActivity) this.onBusActivity(this.lastBusActivity);
    }

    // --- Write Double-Word (4 Bytes - 32 bits) ---
    writeDoubleWord(physicalAddr, val) {
        physicalAddr = physicalAddr & 0xFFFFF;
        const b0 = val & 0xFF;
        const b1 = (val >>> 8) & 0xFF;
        const b2 = (val >>> 16) & 0xFF;
        const b3 = (val >>> 24) & 0xFF;

        this.data[physicalAddr] = b0;
        this.data[(physicalAddr + 1) & 0xFFFFF] = b1;
        this.data[(physicalAddr + 2) & 0xFFFFF] = b2;
        this.data[(physicalAddr + 3) & 0xFFFFF] = b3;
    }

    // Snapshot for Time-Travel Debugging
    getSnapshot() {
        return new Uint8Array(this.data);
    }

    restoreSnapshot(snap) {
        this.data.set(snap);
    }
}

if (typeof window !== 'undefined') window.MemorySystem = MemorySystem;
if (typeof module !== 'undefined') module.exports = MemorySystem;
