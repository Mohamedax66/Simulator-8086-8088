/**
 * 8086 I/O System & Peripherals
 * Handles I/O Ports and DOS Interrupts (INT 21h)
 */

class IOSystem {
    constructor() {
        this.inputPort1Val = 0x00; // Port 1: User input switches
        this.ledPort2Val = 0x00;   // Port 2: 8 LEDs
        this.sevenSegPort3Val = 0x00; // Port 3: 7-Segment
        this.terminalOutput = '';
        this.keyboardBuffer = [];

        this.onLedChange = null;
        this.onSevenSegChange = null;
        this.onTerminalWrite = null;
    }

    setInputPort1(val) {
        this.inputPort1Val = val & 0xFF;
    }

    readPort(port) {
        port = port & 0xFFFF;
        if (port === 1) {
            return this.inputPort1Val;
        }
        if (port === 5) {
            // Read from keyboard buffer
            return this.keyboardBuffer.length > 0 ? this.keyboardBuffer.shift() : 0;
        }
        if (port === 6) {
            return this.keyboardBuffer.length;
        }
        if (port === 8) {
            return this.keyboardBuffer.length > 0 ? this.keyboardBuffer.shift() : 0;
        }
        if (port === 9) {
            return this.keyboardBuffer.length > 0 ? 1 : 0;
        }
        return 0xFF;
    }

    writePort(port, val) {
        port = port & 0xFFFF;
        val = val & 0xFF;

        if (port === 2) {
            // LEDs
            this.ledPort2Val = val;
            if (this.onLedChange) this.onLedChange(val);
        } else if (port === 3) {
            // 7-Segment Display
            this.sevenSegPort3Val = val & 0x0F;
            if (this.onSevenSegChange) this.onSevenSegChange(val & 0x0F);
        } else if (port === 8) {
            // Terminal output
            const char = String.fromCharCode(val);
            this.terminalOutput += char;
            if (this.onTerminalWrite) this.onTerminalWrite(char);
        }
    }

    // --- DOS Interrupt 21h Simulation ---
    handleDosInterrupt(regs, memory) {
        const ah = regs.getReg8('ah');

        if (ah === 0x01) {
            // Read character with echo
            const ch = this.keyboardBuffer.length > 0 ? this.keyboardBuffer.shift() : 0x0D;
            regs.setReg8('al', ch);
            this.writePort(8, ch); // echo to terminal
        } else if (ah === 0x02) {
            // Write character in DL to terminal
            const dl = regs.getReg8('dl');
            this.writePort(8, dl);
        } else if (ah === 0x09) {
            // Write string at DS:DX ending with '$'
            const ds = regs.getReg16('ds');
            const dx = regs.getReg16('dx');
            let offset = dx;
            let safetyCount = 0;
            while (safetyCount < 2000) {
                const pa = ((ds << 4) + offset) & 0xFFFFF;
                const byteVal = memory.readByte(pa);
                if (byteVal === 0x24) break; // '$' character
                this.writePort(8, byteVal);
                offset = (offset + 1) & 0xFFFF;
                safetyCount++;
            }
        }
    }

    clearTerminal() {
        this.terminalOutput = '';
        if (this.onTerminalWrite) this.onTerminalWrite(null); // clears
    }
}

if (typeof window !== 'undefined') window.IOSystem = IOSystem;
if (typeof module !== 'undefined') module.exports = IOSystem;
