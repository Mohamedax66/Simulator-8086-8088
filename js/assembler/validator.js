/**
 * 8086 Assembly Syntax Validator & Smart Corrector
 * Detects syntax errors, operand mismatches, invalid addressing modes,
 * and provides clear explanations and one-click auto-corrections.
 */

class AssemblyValidator {
    static get KNOWN_MNEMONICS() {
        return {
            // 0 operands
            'nop': 0, 'hlt': 0, 'ret': 0, 'clc': 0, 'stc': 0, 'cmc': 0,
            'cld': 0, 'std': 0, 'cli': 0, 'sti': 0, 'iret': 0,

            // 1 operand
            'inc': 1, 'dec': 1, 'neg': 1, 'not': 1, 'mul': 1, 'div': 1,
            'push': 1, 'pop': 1, 'jmp': 1, 'jz': 1, 'je': 1, 'jnz': 1,
            'jne': 1, 'jc': 1, 'jb': 1, 'jnc': 1, 'jnb': 1, 'jae': 1,
            'js': 1, 'jns': 1, 'jo': 1, 'jno': 1, 'loop': 1, 'call': 1, 'int': 1,

            // 2 operands
            'mov': 2, 'add': 2, 'adc': 2, 'sub': 2, 'sbb': 2, 'cmp': 2,
            'and': 2, 'or': 2, 'xor': 2, 'test': 2, 'lea': 2, 'xchg': 2,
            'shl': 2, 'shr': 2, 'rol': 2, 'ror': 2, 'in': 2, 'out': 2
        };
    }

    static get TYPO_MAP() {
        return {
            'move': 'mov', 'mve': 'mov', 'mvo': 'mov', 'load': 'mov', 'set': 'mov',
            'ad': 'add', 'adds': 'add', 'sb': 'sub', 'subs': 'sub',
            'jump': 'jmp', 'jum': 'jmp', 'halt': 'hlt', 'stop': 'hlt',
            'comp': 'cmp', 'cp': 'cmp', 'xch': 'xchg', 'lp': 'loop'
        };
    }

    // Levenshtein distance helper
    static distance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    }

    static validateLine(lineNum, rawLine, mnemonic, operands, labels = {}, variables = {}) {
        const errors = [];
        const m = mnemonic.toLowerCase();

        // 1. Check known mnemonic
        const knownCount = this.KNOWN_MNEMONICS[m];
        if (knownCount === undefined) {
            let suggestion = this.TYPO_MAP[m];
            if (!suggestion) {
                // Find closest match
                for (const validM of Object.keys(this.KNOWN_MNEMONICS)) {
                    if (this.distance(m, validM) <= 2) {
                        suggestion = validM;
                        break;
                    }
                }
            }

            const fix = suggestion ? rawLine.replace(new RegExp(`\\b${m}\\b`, 'i'), suggestion.toUpperCase()) : null;

            errors.push({
                line: lineNum,
                code: rawLine,
                message: `Unknown or unsupported instruction: '${mnemonic.toUpperCase()}'`,
                suggestion: suggestion ? `Did you mean '${suggestion.toUpperCase()}'?` : 'Check the 8086 instruction reference for valid mnemonics.',
                fixedLine: fix
            });
            return errors;
        }

        // 2. Check operand count
        if (operands.length !== knownCount) {
            let msg = `Instruction '${m.toUpperCase()}' expects ${knownCount} operand(s), but found ${operands.length}.`;
            let fix = null;
            if (knownCount === 2 && operands.length === 1) {
                fix = `${rawLine}, 0`;
            }
            errors.push({
                line: lineNum,
                code: rawLine,
                message: msg,
                suggestion: `Format: ${m.toUpperCase()} ${knownCount === 2 ? 'Destination, Source' : (knownCount === 1 ? 'Operand' : '(no operands)')}`,
                fixedLine: fix
            });
            return errors;
        }

        // 3. For 2-operand instructions
        if (knownCount === 2) {
            const dst = operands[0];
            const src = operands[1];

            // A) Destination cannot be Immediate (except for OUT port, accumulator)
            if (dst.type === 'immediate' && m !== 'out') {
                errors.push({
                    line: lineNum,
                    code: rawLine,
                    message: `Invalid Destination: A constant number (${dst.value.toString(16)}h) cannot be a destination.`,
                    suggestion: `Swap operands to store value into register/memory: ${m.toUpperCase()} ${src.name ? src.name.toUpperCase() : '[BX]'}, ${dst.value.toString(16).toUpperCase()}H`,
                    fixedLine: `${m.toUpperCase()} ${src.name ? src.name.toUpperCase() : '[BX]'}, ${dst.value.toString(16).toUpperCase()}H`
                });
            }

            // B) Memory to Memory transfer is not allowed in 8086 (except MOVS)
            if (dst.type === 'memory' && src.type === 'memory') {
                errors.push({
                    line: lineNum,
                    code: rawLine,
                    message: `Invalid Transfer: 8086 architecture does not support direct Memory-to-Memory operations (${m.toUpperCase()} [mem], [mem]).`,
                    suggestion: `Transfer via a register (e.g. MOV AX, [source] then ${m.toUpperCase()} [dest], AX).`,
                    fixedLine: null
                });
            }

            // C) CS cannot be destination of MOV
            if (m === 'mov' && dst.type === 'register' && dst.name === 'cs') {
                errors.push({
                    line: lineNum,
                    code: rawLine,
                    message: `Illegal Register: CS (Code Segment) cannot be modified with MOV.`,
                    suggestion: `Use JMP or CALL to change Code Segment / Instruction Pointer.`,
                    fixedLine: null
                });
            }

            // D) Size Mismatch between Registers
            if (dst.type === 'register' && src.type === 'register') {
                if (dst.is16Bit !== src.is16Bit) {
                    const dstSize = dst.is16Bit ? '16-bit' : '8-bit';
                    const srcSize = src.is16Bit ? '16-bit' : '8-bit';
                    
                    let fixed = null;
                    if (dst.is16Bit && !src.is16Bit) {
                        // e.g. MOV AX, BL -> MOV AX, BX or MOV AL, BL
                        fixed = `${m.toUpperCase()} ${dst.name.toUpperCase()}, ${src.name[0].toUpperCase()}X`;
                    } else {
                        // e.g. MOV AL, BX -> MOV AX, BX
                        fixed = `${m.toUpperCase()} ${dst.name[0].toUpperCase()}X, ${src.name.toUpperCase()}`;
                    }

                    errors.push({
                        line: lineNum,
                        code: rawLine,
                        message: `Operand Size Mismatch: Destination ${dst.name.toUpperCase()} is ${dstSize}, but Source ${src.name.toUpperCase()} is ${srcSize}.`,
                        suggestion: `Both operands must be the same size (${dstSize} or ${srcSize}).`,
                        fixedLine: fixed
                    });
                }
            }

            // E) 8-Bit Register Overflow with Immediate Value
            if (dst.type === 'register' && !dst.is16Bit && src.type === 'immediate') {
                if (src.value > 255 || src.value < -128) {
                    errors.push({
                        line: lineNum,
                        code: rawLine,
                        message: `Value Overflow: ${src.value.toString(16).toUpperCase()}h (${src.value}) exceeds 8-bit register ${dst.name.toUpperCase()} capacity (Max: 255 / 0FFh).`,
                        suggestion: `Use a 16-bit register (e.g. ${dst.name[0].toUpperCase()}X) or limit value between 0 and 255.`,
                        fixedLine: `${m.toUpperCase()} ${dst.name[0].toUpperCase()}X, ${src.value.toString(16).toUpperCase()}H`
                    });
                }
            }
        }

        // 4. Memory Addressing Validations (inside brackets [ ... ])
        for (const op of operands) {
            if (op.type === 'memory') {
                // In 8086, only BX, BP, SI, DI can be used for addressing!
                // If user wrote [AX] or [CX] or [DX] or [SP]
                if (op.invalidReg) {
                    errors.push({
                        line: lineNum,
                        code: rawLine,
                        message: `Illegal Memory Register: In 8086, register '${op.invalidReg.toUpperCase()}' cannot be used inside brackets [ ]. Only BX, BP, SI, or DI are allowed.`,
                        suggestion: `Change [${op.invalidReg.toUpperCase()}] to [BX] or [SI].`,
                        fixedLine: rawLine.replace(new RegExp(`\\[\\s*${op.invalidReg}\\s*\\]`, 'i'), '[BX]')
                    });
                }
            }
        }

        // 5. Jump / Branch Label Validation
        if (['jmp', 'jz', 'je', 'jnz', 'jne', 'jc', 'jb', 'jnc', 'jnb', 'jae', 'js', 'jns', 'jo', 'jno', 'loop', 'call'].includes(m)) {
            if (operands.length > 0 && operands[0].isLabel) {
                const targetName = operands[0].labelName;
                if (labels[targetName] === undefined) {
                    errors.push({
                        line: lineNum,
                        code: rawLine,
                        message: `Undefined Label: Jump destination label '${targetName.toUpperCase()}' was not found in the code.`,
                        suggestion: `Make sure to declare label '${targetName.toUpperCase()}:' before or after this instruction.`,
                        fixedLine: null
                    });
                }
            }
        }

        return errors;
    }
}

if (typeof window !== 'undefined') window.AssemblyValidator = AssemblyValidator;
if (typeof module !== 'undefined') module.exports = AssemblyValidator;
