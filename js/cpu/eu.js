/**
 * 8086 Execution Unit (EU)
 * Features:
 *  - Instruction Decoder & Control Logic
 *  - 16-bit ALU Integration
 *  - Full implementation of the 7 Data Addressing Modes (from Lecture 4)
 *  - Default Segment Rules:
 *      * CS:IP for Instructions
 *      * SS:SP or SS:BP for Stack
 *      * DS:BX, DS:SI, DS:DI or Direct Address for Data
 *      * ES:DI for String destinations
 */

class ExecutionUnit {
    constructor(registers, alu, biu, memory, ioSystem) {
        this.regs = registers;
        this.alu = alu;
        this.biu = biu;
        this.mem = memory;
        this.io = ioSystem;

        this.lastExecuted = null;
        this.lastAddressingMode = {
            name: 'None',
            description: '',
            effectiveAddressFormula: '',
            effectiveAddress: 0,
            segmentUsed: 'DS',
            physicalAddress: 0
        };

        this.onInstructionExecuted = null;
    }

    // --- Resolve Operand Value and Addressing Mode ---
    // Handles Registers, Immediates, and the 7 Memory Addressing Modes
    resolveOperand(operand, is16BitContext = false, isDestination = false) {
        if (!operand) return { value: 0, is16Bit: is16BitContext };

        // 1. Register Addressing
        if (operand.type === 'register') {
            const regName = operand.name.toLowerCase();
            const isReg16 = this.regs.isReg16(regName);
            const val = isReg16 ? this.regs.getReg16(regName) : this.regs.getReg8(regName);
            
            if (!isDestination) {
                this.lastAddressingMode = {
                    name: 'Register Addressing',
                    description: `Data copied directly from register ${regName.toUpperCase()}`,
                    effectiveAddressFormula: 'N/A (Registers)',
                    effectiveAddress: 0,
                    segmentUsed: 'N/A',
                    physicalAddress: 0
                };
            }
            return {
                type: 'register',
                name: regName,
                is16Bit: isReg16,
                value: val,
                setter: (newVal) => {
                    if (isReg16) this.regs.setReg16(regName, newVal);
                    else this.regs.setReg8(regName, newVal);
                }
            };
        }

        // 2. Immediate Addressing
        if (operand.type === 'immediate') {
            const val = operand.value;
            this.lastAddressingMode = {
                name: 'Immediate Addressing',
                description: `Constant value ${val.toString(16).toUpperCase()}h encoded directly in instruction`,
                effectiveAddressFormula: 'Immediate Constant',
                effectiveAddress: 0,
                segmentUsed: 'CS (Instruction Stream)',
                physicalAddress: 0
            };
            return {
                type: 'immediate',
                is16Bit: is16BitContext,
                value: val
            };
        }

        // 3 - 7: Memory Addressing Modes
        if (operand.type === 'memory') {
            const baseReg = operand.base ? operand.base.toLowerCase() : null;
            const indexReg = operand.index ? operand.index.toLowerCase() : null;
            const disp = operand.displacement || 0;
            const segmentOverride = operand.segmentOverride ? operand.segmentOverride.toLowerCase() : null;

            // Default segment rule: if base is BP -> default SS, else default DS
            let segment = segmentOverride || ((baseReg === 'bp') ? 'ss' : 'ds');

            let ea = 0;
            let modeName = '';
            let formula = '';

            const baseVal = baseReg ? this.regs.getReg16(baseReg) : 0;
            const indexVal = indexReg ? this.regs.getReg16(indexReg) : 0;

            if (baseReg && indexReg && disp !== 0) {
                // Mode 7: Base Relative-Plus-Index Addressing (e.g. [BX+SI+100H] or ARRAY[BX+SI])
                modeName = 'Base Relative-Plus-Index Addressing';
                ea = (baseVal + indexVal + disp) & 0xFFFF;
                formula = `${baseReg.toUpperCase()} (${baseVal.toString(16)}h) + ${indexReg.toUpperCase()} (${indexVal.toString(16)}h) + Disp (${disp.toString(16)}h) = ${ea.toString(16).toUpperCase()}h`;
            } else if (baseReg && indexReg) {
                // Mode 5: Base-Plus-Index Addressing (e.g. [BX+SI] or [BX+DI])
                modeName = 'Base-Plus-Index Addressing';
                ea = (baseVal + indexVal) & 0xFFFF;
                formula = `${baseReg.toUpperCase()} (${baseVal.toString(16)}h) + ${indexReg.toUpperCase()} (${indexVal.toString(16)}h) = ${ea.toString(16).toUpperCase()}h`;
            } else if ((baseReg || indexReg) && disp !== 0) {
                // Mode 6: Register Relative Addressing (e.g. [BX+4] or [SI+20H])
                const rName = (baseReg || indexReg).toUpperCase();
                const rVal = baseReg ? baseVal : indexVal;
                modeName = 'Register Relative Addressing';
                ea = (rVal + disp) & 0xFFFF;
                formula = `${rName} (${rVal.toString(16)}h) + Disp (${disp.toString(16)}h) = ${ea.toString(16).toUpperCase()}h`;
            } else if (baseReg || indexReg) {
                // Mode 4: Register Indirect Addressing (e.g. [BX], [BP], [SI], [DI])
                const rName = (baseReg || indexReg).toUpperCase();
                const rVal = baseReg ? baseVal : indexVal;
                modeName = 'Register Indirect Addressing';
                ea = rVal & 0xFFFF;
                formula = `${rName} (${rVal.toString(16)}h) = ${ea.toString(16).toUpperCase()}h`;
            } else {
                // Mode 3: Direct Data Addressing (e.g. [1234H])
                modeName = 'Direct Data Addressing';
                ea = disp & 0xFFFF;
                formula = `Direct Offset = ${ea.toString(16).toUpperCase()}h`;
            }

            const pa = this.biu.calculatePhysicalAddress(segment, ea);

            this.lastAddressingMode = {
                name: modeName,
                description: `Memory access via ${segment.toUpperCase()}:${ea.toString(16).toUpperCase()}h`,
                effectiveAddressFormula: formula,
                effectiveAddress: ea,
                segmentUsed: segment.toUpperCase(),
                physicalAddress: pa
            };

            const is16Bit = operand.is16Bit !== undefined ? operand.is16Bit : is16BitContext;
            const currentMem = this.mem;

            return {
                type: 'memory',
                is16Bit: is16Bit,
                effectiveAddress: ea,
                physicalAddress: pa,
                segment: segment,
                value: is16Bit ? currentMem.readWord(pa) : currentMem.readByte(pa),
                setter: (newVal) => {
                    if (is16Bit) currentMem.writeWord(pa, newVal);
                    else currentMem.writeByte(pa, newVal);
                }
            };
        }

        return { value: 0, is16Bit: is16BitContext };
    }

    // --- Execute One Instruction ---
    execute(instruction) {
        if (!instruction) return { halted: true };
        const mnemonic = instruction.mnemonic.toLowerCase();
        const operands = instruction.operands || [];

        let is16Bit = false;
        // Determine bit width from destination or source
        if (operands.length > 0 && operands[0].type === 'register') {
            is16Bit = this.regs.isReg16(operands[0].name);
        } else if (operands.length > 1 && operands[1].type === 'register') {
            is16Bit = this.regs.isReg16(operands[1].name);
        } else if (operands.length > 0 && operands[0].is16Bit !== undefined) {
            is16Bit = operands[0].is16Bit;
        }

        let branchTaken = false;

        switch (mnemonic) {
            case 'nop':
                break;

            case 'hlt':
                return { halted: true, reason: 'HLT (Processor halted)' };

            // --- DATA MOVEMENT ---
            case 'mov': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                if (dst.setter) dst.setter(src.value);
                break;
            }

            case 'xchg': {
                const op1 = this.resolveOperand(operands[0], is16Bit, true);
                const op2 = this.resolveOperand(operands[1], is16Bit, true);
                const temp = op1.value;
                if (op1.setter) op1.setter(op2.value);
                if (op2.setter) op2.setter(temp);
                break;
            }

            case 'lea': {
                // Load Effective Address: load EA into register
                const dst = this.resolveOperand(operands[0], true, true);
                const src = this.resolveOperand(operands[1], true, false);
                if (dst.setter && src.effectiveAddress !== undefined) {
                    dst.setter(src.effectiveAddress);
                }
                break;
            }

            // --- ARITHMETIC ---
            case 'add': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.add(dst.value, src.value, is16Bit, false);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'adc': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.add(dst.value, src.value, is16Bit, true);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'sub': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.sub(dst.value, src.value, is16Bit, false, false);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'sbb': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.sub(dst.value, src.value, is16Bit, true, false);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'cmp': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, false);
                this.alu.sub(dst.value, src.value, is16Bit, false, true); // CMP updates flags without storing
                break;
            }

            case 'inc': {
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.inc(dst.value, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'dec': {
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.dec(dst.value, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'neg': {
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.neg(dst.value, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'mul': {
                const src = this.resolveOperand(operands[0], is16Bit, false);
                this.alu.mul(src.value, is16Bit);
                break;
            }

            case 'div': {
                const src = this.resolveOperand(operands[0], is16Bit, false);
                this.alu.div(src.value, is16Bit);
                break;
            }

            // --- LOGICAL ---
            case 'and': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.and(dst.value, src.value, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'or': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.or(dst.value, src.value, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'xor': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.xor(dst.value, src.value, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'not': {
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const res = this.alu.not(dst.value, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'test': {
                const src = this.resolveOperand(operands[1], is16Bit, false);
                const dst = this.resolveOperand(operands[0], is16Bit, false);
                this.alu.and(dst.value, src.value, is16Bit);
                break;
            }

            // --- SHIFTS ---
            case 'shl': {
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const count = (operands[1].name && operands[1].name.toLowerCase() === 'cl') ? this.regs.getReg8('cl') : operands[1].value;
                const res = this.alu.shl(dst.value, count, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            case 'shr': {
                const dst = this.resolveOperand(operands[0], is16Bit, true);
                const count = (operands[1].name && operands[1].name.toLowerCase() === 'cl') ? this.regs.getReg8('cl') : operands[1].value;
                const res = this.alu.shr(dst.value, count, is16Bit);
                if (dst.setter) dst.setter(res);
                break;
            }

            // --- JUMPS & CONTROL FLOW ---
            case 'jmp': {
                const target = instruction.targetIp !== undefined ? instruction.targetIp : operands[0].value;
                this.regs.ip = target & 0xFFFF;
                this.biu.flushQueue(); // Pipeline flushed on branch!
                branchTaken = true;
                break;
            }

            case 'jz': case 'je': {
                if (this.regs.flags.zf === 1) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'jnz': case 'jne': {
                if (this.regs.flags.zf === 0) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'jc': case 'jb': {
                if (this.regs.flags.cf === 1) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'jnc': case 'jnb': case 'jae': {
                if (this.regs.flags.cf === 0) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'js': {
                if (this.regs.flags.sf === 1) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'jns': {
                if (this.regs.flags.sf === 0) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'jo': {
                if (this.regs.flags.of === 1) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'jno': {
                if (this.regs.flags.of === 0) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            case 'loop': {
                let cx = (this.regs.getReg16('cx') - 1) & 0xFFFF;
                this.regs.setReg16('cx', cx);
                if (cx !== 0) {
                    this.regs.ip = instruction.targetIp & 0xFFFF;
                    this.biu.flushQueue();
                    branchTaken = true;
                }
                break;
            }

            // --- STACK OPERATIONS ---
            case 'push': {
                const op = this.resolveOperand(operands[0], true, false);
                let sp = (this.regs.sp - 2) & 0xFFFF;
                this.regs.sp = sp;
                this.biu.writeDataWord('ss', sp, op.value);
                break;
            }

            case 'pop': {
                const dst = this.resolveOperand(operands[0], true, true);
                let sp = this.regs.sp;
                const val = this.biu.readDataWord('ss', sp);
                this.regs.sp = (sp + 2) & 0xFFFF;
                if (dst.setter) dst.setter(val);
                break;
            }

            case 'call': {
                // Push return IP to stack
                let sp = (this.regs.sp - 2) & 0xFFFF;
                this.regs.sp = sp;
                this.biu.writeDataWord('ss', sp, this.regs.ip);
                this.regs.ip = instruction.targetIp & 0xFFFF;
                this.biu.flushQueue();
                branchTaken = true;
                break;
            }

            case 'ret': {
                let sp = this.regs.sp;
                const returnIp = this.biu.readDataWord('ss', sp);
                this.regs.sp = (sp + 2) & 0xFFFF;
                this.regs.ip = returnIp;
                this.biu.flushQueue();
                branchTaken = true;
                break;
            }

            // --- I/O PORTS ---
            case 'in': {
                // IN AL/AX, Port
                const portVal = (operands[1].name && operands[1].name.toLowerCase() === 'dx') ? this.regs.getReg16('dx') : operands[1].value;
                const val = this.io.readPort(portVal);
                if (operands[0].name.toLowerCase() === 'al') this.regs.setReg8('al', val & 0xFF);
                else this.regs.setReg16('ax', val & 0xFFFF);
                break;
            }

            case 'out': {
                // OUT Port, AL/AX
                const portVal = (operands[0].name && operands[0].name.toLowerCase() === 'dx') ? this.regs.getReg16('dx') : operands[0].value;
                const dataVal = (operands[1].name.toLowerCase() === 'al') ? this.regs.getReg8('al') : this.regs.getReg16('ax');
                this.io.writePort(portVal, dataVal);
                break;
            }

            // --- FLAG CONTROL ---
            case 'clc': this.regs.flags.cf = 0; break;
            case 'stc': this.regs.flags.cf = 1; break;
            case 'cmc': this.regs.flags.cf = this.regs.flags.cf ? 0 : 1; break;
            case 'cld': this.regs.flags.df = 0; break;
            case 'std': this.regs.flags.df = 1; break;
            case 'cli': this.regs.flags.if = 0; break;
            case 'sti': this.regs.flags.if = 1; break;

            // --- INTERRUPTS ---
            case 'int': {
                const intNum = operands[0].value;
                if (intNum === 0x21) {
                    const ah = this.regs.getReg8('ah');
                    if (ah === 0x4C) {
                        return { halted: true, reason: 'Program Terminated (INT 21h, AH=4Ch)' };
                    }
                    this.io.handleDosInterrupt(this.regs, this.mem);
                }
                break;
            }
        }

        this.lastExecuted = {
            instruction,
            branchTaken,
            addressingMode: { ...this.lastAddressingMode }
        };

        if (this.onInstructionExecuted) this.onInstructionExecuted(this.lastExecuted);
        return { halted: false, branchTaken };
    }
}

if (typeof window !== 'undefined') window.ExecutionUnit = ExecutionUnit;
if (typeof module !== 'undefined') module.exports = ExecutionUnit;
