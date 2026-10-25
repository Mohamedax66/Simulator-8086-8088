/**
 * 8086 Arithmetic & Logic Unit (ALU)
 * Computes arithmetic/logical operations and accurately updates the 6 Status Flags:
 * CF, PF, AF, ZF, SF, OF (as tested in Tutorial 1 & Lectures 2/4)
 */

class ALU {
    constructor(registers) {
        this.regs = registers;
        this.lastFlagsRationale = {}; // Stores human-readable explanations for why flags changed
    }

    // Parity calculation on lowest 8 bits
    static calculateParity(byteVal) {
        let b = byteVal & 0xFF;
        let count = 0;
        for (let i = 0; i < 8; i++) {
            if ((b >> i) & 1) count++;
        }
        return (count % 2 === 0) ? 1 : 0; // 1 for even parity, 0 for odd
    }

    // --- ADDITION (ADD, ADC, INC) ---
    add(op1, op2, is16Bit = false, withCarry = false) {
        const carryIn = (withCarry && this.regs.flags.cf) ? 1 : 0;
        const mask = is16Bit ? 0xFFFF : 0xFF;
        const signBit = is16Bit ? 0x8000 : 0x80;
        const carryLimit = is16Bit ? 0x10000 : 0x100;

        const rawResult = op1 + op2 + carryIn;
        const result = rawResult & mask;

        // Flags
        const cf = (rawResult >= carryLimit) ? 1 : 0;
        const zf = (result === 0) ? 1 : 0;
        const sf = (result & signBit) ? 1 : 0;
        const pf = ALU.calculateParity(result);

        // AF: Carry from bit 3 to bit 4
        const af = (((op1 & 0x0F) + (op2 & 0x0F) + carryIn) > 0x0F) ? 1 : 0;

        // OF: Signed overflow (two positives yield negative, or two negatives yield positive)
        const of = (!((op1 ^ op2) & signBit) && ((op1 ^ result) & signBit)) ? 1 : 0;

        this.regs.flags.cf = cf;
        this.regs.flags.zf = zf;
        this.regs.flags.sf = sf;
        this.regs.flags.pf = pf;
        this.regs.flags.af = af;
        this.regs.flags.of = of;

        this.lastFlagsRationale = {
            operation: `ADD ${is16Bit ? '16-bit' : '8-bit'}: ${op1.toString(16).toUpperCase()}h + ${op2.toString(16).toUpperCase()}h`,
            cf: cf ? 'Carry out of MSB occurred' : 'No carry out of MSB',
            zf: zf ? 'Result is zero' : 'Result is non-zero',
            sf: sf ? 'MSB is 1 (negative result)' : 'MSB is 0 (positive result)',
            pf: pf ? 'Low byte has EVEN number of 1s' : 'Low byte has ODD number of 1s',
            af: af ? 'Auxiliary Carry from bit 3 to bit 4 (nibble carry)' : 'No nibble carry',
            of: of ? 'Signed overflow detected (sign changed unexpectedly)' : 'No signed overflow'
        };

        return result;
    }

    // --- SUBTRACTION (SUB, SBB, CMP, DEC) ---
    sub(op1, op2, is16Bit = false, withBorrow = false, isCmp = false) {
        const borrowIn = (withBorrow && this.regs.flags.cf) ? 1 : 0;
        const mask = is16Bit ? 0xFFFF : 0xFF;
        const signBit = is16Bit ? 0x8000 : 0x80;

        const rawResult = op1 - op2 - borrowIn;
        const result = rawResult & mask;

        const cf = (rawResult < 0) ? 1 : 0;
        const zf = (result === 0) ? 1 : 0;
        const sf = (result & signBit) ? 1 : 0;
        const pf = ALU.calculateParity(result);

        // AF: Borrow from bit 4 to bit 3
        const af = (((op1 & 0x0F) - (op2 & 0x0F) - borrowIn) < 0) ? 1 : 0;

        // OF: Signed overflow on subtraction
        const of = (((op1 ^ op2) & signBit) && ((op1 ^ result) & signBit)) ? 1 : 0;

        this.regs.flags.cf = cf;
        this.regs.flags.zf = zf;
        this.regs.flags.sf = sf;
        this.regs.flags.pf = pf;
        this.regs.flags.af = af;
        this.regs.flags.of = of;

        this.lastFlagsRationale = {
            operation: `${isCmp ? 'CMP' : 'SUB'} ${is16Bit ? '16-bit' : '8-bit'}: ${op1.toString(16).toUpperCase()}h - ${op2.toString(16).toUpperCase()}h`,
            cf: cf ? 'Borrow required (op1 < op2)' : 'No borrow required',
            zf: zf ? 'Operands are equal (Result = 0)' : 'Operands not equal',
            sf: sf ? 'Signed difference is negative' : 'Signed difference is positive',
            pf: pf ? 'Low byte has EVEN parity' : 'Low byte has ODD parity',
            af: af ? 'Auxiliary borrow from lower nibble' : 'No auxiliary borrow',
            of: of ? 'Signed subtraction overflow' : 'No signed overflow'
        };

        return result;
    }

    // --- INC / DEC (Affect all status flags EXCEPT CF!) ---
    inc(op, is16Bit = false) {
        const oldCf = this.regs.flags.cf;
        const res = this.add(op, 1, is16Bit, false);
        this.regs.flags.cf = oldCf; // 8086 Rule: INC does not affect CF
        return res;
    }

    dec(op, is16Bit = false) {
        const oldCf = this.regs.flags.cf;
        const res = this.sub(op, 1, is16Bit, false, false);
        this.regs.flags.cf = oldCf; // 8086 Rule: DEC does not affect CF
        return res;
    }

    // --- LOGIC OPERATIONS (AND, OR, XOR, TEST) ---
    // Rule: Always clear CF and OF to 0. AF is undefined (cleared). SF, ZF, PF updated.
    and(op1, op2, is16Bit = false) {
        const mask = is16Bit ? 0xFFFF : 0xFF;
        const signBit = is16Bit ? 0x8000 : 0x80;
        const result = (op1 & op2) & mask;

        this.regs.flags.cf = 0;
        this.regs.flags.of = 0;
        this.regs.flags.af = 0;
        this.regs.flags.zf = (result === 0) ? 1 : 0;
        this.regs.flags.sf = (result & signBit) ? 1 : 0;
        this.regs.flags.pf = ALU.calculateParity(result);

        return result;
    }

    or(op1, op2, is16Bit = false) {
        const mask = is16Bit ? 0xFFFF : 0xFF;
        const signBit = is16Bit ? 0x8000 : 0x80;
        const result = (op1 | op2) & mask;

        this.regs.flags.cf = 0;
        this.regs.flags.of = 0;
        this.regs.flags.af = 0;
        this.regs.flags.zf = (result === 0) ? 1 : 0;
        this.regs.flags.sf = (result & signBit) ? 1 : 0;
        this.regs.flags.pf = ALU.calculateParity(result);

        return result;
    }

    xor(op1, op2, is16Bit = false) {
        const mask = is16Bit ? 0xFFFF : 0xFF;
        const signBit = is16Bit ? 0x8000 : 0x80;
        const result = (op1 ^ op2) & mask;

        this.regs.flags.cf = 0;
        this.regs.flags.of = 0;
        this.regs.flags.af = 0;
        this.regs.flags.zf = (result === 0) ? 1 : 0;
        this.regs.flags.sf = (result & signBit) ? 1 : 0;
        this.regs.flags.pf = ALU.calculateParity(result);

        return result;
    }

    not(op, is16Bit = false) {
        const mask = is16Bit ? 0xFFFF : 0xFF;
        // NOT instruction does NOT affect any flags in 8086
        return (~op) & mask;
    }

    neg(op, is16Bit = false) {
        // Two's complement: 0 - op
        return this.sub(0, op, is16Bit, false, false);
    }

    // --- MULTIPLICATION & DIVISION ---
    mul(op, is16Bit = false) {
        if (!is16Bit) {
            // AL * op (8-bit) -> AX (16-bit)
            const al = this.regs.getReg8('al');
            const prod = (al * (op & 0xFF)) & 0xFFFF;
            this.regs.setReg16('ax', prod);
            const highByte = (prod >> 8) & 0xFF;
            const flag = (highByte !== 0) ? 1 : 0;
            this.regs.flags.cf = flag;
            this.regs.flags.of = flag;
            return prod;
        } else {
            // AX * op (16-bit) -> DX:AX (32-bit)
            const ax = this.regs.getReg16('ax');
            const prod = (ax * (op & 0xFFFF)) >>> 0;
            const low = prod & 0xFFFF;
            const high = (prod >>> 16) & 0xFFFF;
            this.regs.setReg16('ax', low);
            this.regs.setReg16('dx', high);
            const flag = (high !== 0) ? 1 : 0;
            this.regs.flags.cf = flag;
            this.regs.flags.of = flag;
            return prod;
        }
    }

    div(op, is16Bit = false) {
        if (op === 0) throw new Error('Divide by zero (INT 0)');
        if (!is16Bit) {
            // AX / op (8-bit) -> Quotient in AL, Remainder in AH
            const ax = this.regs.getReg16('ax');
            const quot = Math.floor(ax / (op & 0xFF));
            const rem = ax % (op & 0xFF);
            if (quot > 255) throw new Error('Divide Error (Quotient overflow in AL)');
            this.regs.setReg8('al', quot);
            this.regs.setReg8('ah', rem);
            return { quot, rem };
        } else {
            // DX:AX / op (16-bit) -> Quotient in AX, Remainder in DX
            const dx = this.regs.getReg16('dx');
            const ax = this.regs.getReg16('ax');
            const num = ((dx << 16) | ax) >>> 0;
            const quot = Math.floor(num / (op & 0xFFFF));
            const rem = num % (op & 0xFFFF);
            if (quot > 65535) throw new Error('Divide Error (Quotient overflow in AX)');
            this.regs.setReg16('ax', quot);
            this.regs.setReg16('dx', rem);
            return { quot, rem };
        }
    }

    // --- SHIFTS & ROTATES ---
    shl(val, count, is16Bit = false) {
        if (count === 0) return val;
        const mask = is16Bit ? 0xFFFF : 0xFF;
        const msb = is16Bit ? 0x8000 : 0x80;
        let lastOutBit = 0;
        let res = val & mask;

        for (let i = 0; i < count; i++) {
            lastOutBit = (res & msb) ? 1 : 0;
            res = (res << 1) & mask;
        }

        this.regs.flags.cf = lastOutBit;
        this.regs.flags.zf = (res === 0) ? 1 : 0;
        this.regs.flags.sf = (res & msb) ? 1 : 0;
        this.regs.flags.pf = ALU.calculateParity(res);
        if (count === 1) {
            this.regs.flags.of = (((res & msb) ? 1 : 0) ^ lastOutBit);
        }
        return res;
    }

    shr(val, count, is16Bit = false) {
        if (count === 0) return val;
        const mask = is16Bit ? 0xFFFF : 0xFF;
        const msb = is16Bit ? 0x8000 : 0x80;
        let lastOutBit = 0;
        let res = val & mask;

        for (let i = 0; i < count; i++) {
            lastOutBit = res & 1;
            res = (res >>> 1) & mask;
        }

        this.regs.flags.cf = lastOutBit;
        this.regs.flags.zf = (res === 0) ? 1 : 0;
        this.regs.flags.sf = 0;
        this.regs.flags.pf = ALU.calculateParity(res);
        if (count === 1) {
            this.regs.flags.of = (val & msb) ? 1 : 0;
        }
        return res;
    }
}

if (typeof window !== 'undefined') window.ALU = ALU;
if (typeof module !== 'undefined') module.exports = ALU;
