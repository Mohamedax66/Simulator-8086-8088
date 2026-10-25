/**
 * 8086 Registers & Flags Implementation
 * Accurate model based on Intel 8086 Architecture (as taught in university lectures)
 */

class Registers {
    constructor() {
        this.reset();
    }

    reset() {
        // General Purpose & Index/Pointer Registers (16-bit)
        this.ax = 0x0000;
        this.bx = 0x0000;
        this.cx = 0x0000;
        this.dx = 0x0000;
        this.sp = 0xFFFE; // Top of stack segment
        this.bp = 0x0000;
        this.si = 0x0000;
        this.di = 0x0000;

        // Instruction Pointer
        this.ip = 0x0000;

        // Segment Registers (16-bit)
        this.cs = 0x1000; // Code Segment base (10000H)
        this.ds = 0x2000; // Data Segment base (20000H)
        this.ss = 0x3000; // Stack Segment base (30000H)
        this.es = 0x4000; // Extra Segment base (40000H)

        // 16-bit Flag Register: 6 Status Flags + 3 Control Flags
        this.flags = {
            cf: 0, // Carry Flag (bit 0)
            pf: 0, // Parity Flag (bit 2)
            af: 0, // Auxiliary Carry Flag (bit 4)
            zf: 0, // Zero Flag (bit 6)
            sf: 0, // Sign Flag (bit 7)
            tf: 0, // Trap Flag (bit 8)
            if: 0, // Interrupt Flag (bit 9) - 0 on RESET (enabled via STI, disabled via CLI)
            df: 0, // Direction Flag (bit 10) - 0 = up (increment), 1 = down
            of: 0  // Overflow Flag (bit 11)
        };
    }

    // --- 16-Bit Register Accessors ---
    getReg16(name) {
        name = name.toLowerCase();
        if (this[name] !== undefined) {
            return this[name] & 0xFFFF;
        }
        throw new Error(`Unknown 16-bit register: ${name}`);
    }

    setReg16(name, val) {
        name = name.toLowerCase();
        val = val & 0xFFFF;
        if (this[name] !== undefined) {
            this[name] = val;
            return;
        }
        throw new Error(`Unknown 16-bit register: ${name}`);
    }

    // --- 8-Bit Register Accessors (AH, AL, BH, BL, CH, CL, DH, DL) ---
    getReg8(name) {
        name = name.toLowerCase();
        switch (name) {
            case 'al': return this.ax & 0xFF;
            case 'ah': return (this.ax >> 8) & 0xFF;
            case 'bl': return this.bx & 0xFF;
            case 'bh': return (this.bx >> 8) & 0xFF;
            case 'cl': return this.cx & 0xFF;
            case 'ch': return (this.cx >> 8) & 0xFF;
            case 'dl': return this.dx & 0xFF;
            case 'dh': return (this.dx >> 8) & 0xFF;
            default:
                throw new Error(`Unknown 8-bit register: ${name}`);
        }
    }

    setReg8(name, val) {
        name = name.toLowerCase();
        val = val & 0xFF;
        switch (name) {
            case 'al': this.ax = (this.ax & 0xFF00) | val; break;
            case 'ah': this.ax = (this.ax & 0x00FF) | (val << 8); break;
            case 'bl': this.bx = (this.bx & 0xFF00) | val; break;
            case 'bh': this.bx = (this.bx & 0x00FF) | (val << 8); break;
            case 'cl': this.cx = (this.cx & 0xFF00) | val; break;
            case 'ch': this.cx = (this.cx & 0x00FF) | (val << 8); break;
            case 'dl': this.dx = (this.dx & 0xFF00) | val; break;
            case 'dh': this.dx = (this.dx & 0x00FF) | (val << 8); break;
            default:
                throw new Error(`Unknown 8-bit register: ${name}`);
        }
    }

    // Check register types
    isReg8(name) {
        return ['al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh'].includes(name.toLowerCase());
    }

    isReg16(name) {
        return ['ax', 'bx', 'cx', 'dx', 'sp', 'bp', 'si', 'di', 'ip', 'cs', 'ds', 'ss', 'es'].includes(name.toLowerCase());
    }

    isSegmentReg(name) {
        return ['cs', 'ds', 'ss', 'es'].includes(name.toLowerCase());
    }

    // --- Flag Register as full 16-bit word ---
    getFlagsWord() {
        let f = 0x0002; // Bit 1 is always 1 in 8086
        if (this.flags.cf) f |= (1 << 0);
        if (this.flags.pf) f |= (1 << 2);
        if (this.flags.af) f |= (1 << 4);
        if (this.flags.zf) f |= (1 << 6);
        if (this.flags.sf) f |= (1 << 7);
        if (this.flags.tf) f |= (1 << 8);
        if (this.flags.if) f |= (1 << 9);
        if (this.flags.df) f |= (1 << 10);
        if (this.flags.of) f |= (1 << 11);
        return f & 0xFFFF;
    }

    setFlagsWord(word) {
        this.flags.cf = (word & (1 << 0)) ? 1 : 0;
        this.flags.pf = (word & (1 << 2)) ? 1 : 0;
        this.flags.af = (word & (1 << 4)) ? 1 : 0;
        this.flags.zf = (word & (1 << 6)) ? 1 : 0;
        this.flags.sf = (word & (1 << 7)) ? 1 : 0;
        this.flags.tf = (word & (1 << 8)) ? 1 : 0;
        this.flags.if = (word & (1 << 9)) ? 1 : 0;
        this.flags.df = (word & (1 << 10)) ? 1 : 0;
        this.flags.of = (word & (1 << 11)) ? 1 : 0;
    }

    // Snapshots for Undo / Time-Travel Debugging
    getSnapshot() {
        return {
            ax: this.ax, bx: this.bx, cx: this.cx, dx: this.dx,
            sp: this.sp, bp: this.bp, si: this.si, di: this.di,
            ip: this.ip,
            cs: this.cs, ds: this.ds, ss: this.ss, es: this.es,
            flags: { ...this.flags }
        };
    }

    restoreSnapshot(snap) {
        this.ax = snap.ax; this.bx = snap.bx; this.cx = snap.cx; this.dx = snap.dx;
        this.sp = snap.sp; this.bp = snap.bp; this.si = snap.si; this.di = snap.di;
        this.ip = snap.ip;
        this.cs = snap.cs; this.ds = snap.ds; this.ss = snap.ss; this.es = snap.es;
        this.flags = { ...snap.flags };
    }
}

// Export for module or browser window
if (typeof window !== 'undefined') window.Registers = Registers;
if (typeof module !== 'undefined') module.exports = Registers;
