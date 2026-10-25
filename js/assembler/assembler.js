/**
 * 8086 Two-Pass Assembler
 * Produces structured instruction objects ready for execution by EU and BIU.
 */

if (typeof require !== 'undefined') {
    if (typeof AssemblyParser === 'undefined') global.AssemblyParser = require('./parser.js');
    if (typeof AssemblyValidator === 'undefined') global.AssemblyValidator = require('./validator.js');
}

class Assembler {
    static assemble(sourceCode) {
        const lines = sourceCode.split('\n');
        const errors = [];
        const labels = {};       // labelName -> instructionIndex
        const variables = {};    // varName -> { offset, is16Bit, size }
        const dataBytes = [];    // Raw data segment bytes
        let currentSegment = 'code'; // 'code' or 'data'

        const rawCodeLines = []; // { lineNum, text, raw }

        // --- PASS 1: Parse Directives, Variables, and Labels ---
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const commentIdx = line.indexOf(';');
            if (commentIdx !== -1) {
                line = line.substring(0, commentIdx);
            }
            line = line.trim();
            if (!line) continue;

            const lower = line.toLowerCase();

            // Segment directives
            if (lower === '.data' || lower.startsWith('data segment')) {
                currentSegment = 'data';
                continue;
            }
            if (lower === '.code' || lower.startsWith('code segment')) {
                currentSegment = 'code';
                continue;
            }
            if (lower.startsWith('.model') || lower.startsWith('.stack') || lower === 'end' || lower.startsWith('ends')) {
                continue;
            }

            // Variable definitions in Data Segment:
            // e.g. VAR1 DB 12H, 34H
            //      MSG DB 'Hello, World!$'
            //      NUM1 DW 1234H
            //      DWORD1 DD 00567CFFH
            if (currentSegment === 'data') {
                const parts = line.split(/\s+/);
                if (parts.length >= 3) {
                    const varName = parts[0].toLowerCase();
                    const type = parts[1].toUpperCase();
                    const valueStr = line.substring(line.indexOf(parts[1]) + parts[1].length).trim();

                    if (type === 'DB' || type === 'DW' || type === 'DD') {
                        const is16Bit = (type === 'DW');
                        const is32Bit = (type === 'DD');
                        variables[varName] = {
                            offset: dataBytes.length,
                            is16Bit: is16Bit,
                            is32Bit: is32Bit,
                            type: type
                        };

                        // Check DUP syntax: count DUP(val)
                        const dupMatch = valueStr.match(/^(\d+)\s+dup\s*\(\s*(.*?)\s*\)$/i);
                        if (dupMatch) {
                            const count = parseInt(dupMatch[1], 10);
                            const valToken = dupMatch[2].trim();
                            const val = (valToken === '?' || valToken === '') ? 0 : AssemblyParser.parseNumber(valToken);
                            const cleanVal = isNaN(val) ? 0 : val;
                            for (let c = 0; c < count; c++) {
                                if (is32Bit) {
                                    dataBytes.push(cleanVal & 0xFF);
                                    dataBytes.push((cleanVal >> 8) & 0xFF);
                                    dataBytes.push((cleanVal >> 16) & 0xFF);
                                    dataBytes.push((cleanVal >>> 24) & 0xFF);
                                } else if (is16Bit) {
                                    dataBytes.push(cleanVal & 0xFF);
                                    dataBytes.push((cleanVal >> 8) & 0xFF);
                                } else {
                                    dataBytes.push(cleanVal & 0xFF);
                                }
                            }
                            continue;
                        }

                        // Parse comma separated values or string
                        if (valueStr.startsWith("'") || valueStr.startsWith('"')) {
                            const quoteChar = valueStr[0];
                            const endQuote = valueStr.lastIndexOf(quoteChar);
                            const strContent = valueStr.substring(1, endQuote);
                            for (let ch = 0; ch < strContent.length; ch++) {
                                dataBytes.push(strContent.charCodeAt(ch) & 0xFF);
                            }
                            // Check for remaining commas after string (e.g. 'msg', 13, 10, '$')
                            const rest = valueStr.substring(endQuote + 1).trim();
                            if (rest.startsWith(',')) {
                                const restTokens = rest.substring(1).split(',').map(t => t.trim());
                                for (const rt of restTokens) {
                                    const n = AssemblyParser.parseNumber(rt);
                                    if (!isNaN(n)) dataBytes.push(n & 0xFF);
                                }
                            }
                        } else {
                            const valTokens = valueStr.split(',').map(t => t.trim());
                            for (const vt of valTokens) {
                                const n = AssemblyParser.parseNumber(vt);
                                if (!isNaN(n)) {
                                    if (is32Bit) {
                                        dataBytes.push(n & 0xFF); // Little-endian
                                        dataBytes.push((n >> 8) & 0xFF);
                                        dataBytes.push((n >> 16) & 0xFF);
                                        dataBytes.push((n >>> 24) & 0xFF);
                                    } else if (is16Bit) {
                                        dataBytes.push(n & 0xFF); // Little-endian
                                        dataBytes.push((n >> 8) & 0xFF);
                                    } else {
                                        dataBytes.push(n & 0xFF);
                                    }
                                }
                            }
                        }
                        continue;
                    }
                }
            }

            // Code Segment: Check for Labels (LABEL:)
            if (currentSegment === 'code') {
                const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
                if (labelMatch) {
                    const lblName = labelMatch[1].toLowerCase();
                    labels[lblName] = rawCodeLines.length; // points to next instruction index
                    line = labelMatch[2].trim();
                }
                if (line) {
                    rawCodeLines.push({
                        lineNum: i + 1,
                        text: line
                    });
                }
            }
        }

        // --- PASS 2: Assemble Instructions and Resolve Operands ---
        const instructions = [];
        const allCodeBytes = [];

        const REG_MAP_16 = { ax: 0, cx: 1, dx: 2, bx: 3, sp: 4, bp: 5, si: 6, di: 7 };
        const REG_MAP_8  = { al: 0, cl: 1, dl: 2, bl: 3, ah: 4, ch: 5, dh: 6, bh: 7 };

        for (let idx = 0; idx < rawCodeLines.length; idx++) {
            const item = rawCodeLines[idx];
            const line = item.text;

            // Separate mnemonic and operands
            const firstSpace = line.search(/\s/);
            let mnemonic = '';
            let operandStr = '';

            if (firstSpace === -1) {
                mnemonic = line.toLowerCase();
            } else {
                mnemonic = line.substring(0, firstSpace).toLowerCase();
                operandStr = line.substring(firstSpace).trim();
            }

            // Parse operands split by comma (taking brackets into account)
            const rawOps = [];
            if (operandStr) {
                let insideBrackets = false;
                let currentOp = '';
                for (let c = 0; c < operandStr.length; c++) {
                    const char = operandStr[c];
                    if (char === '[') insideBrackets = true;
                    if (char === ']') insideBrackets = false;
                    if (char === ',' && !insideBrackets) {
                        rawOps.push(currentOp.trim());
                        currentOp = '';
                    } else {
                        currentOp += char;
                    }
                }
                if (currentOp.trim()) rawOps.push(currentOp.trim());
            }

            const parsedOperands = [];
            for (const op of rawOps) {
                const parsed = AssemblyParser.parseOperand(op, labels, variables);
                parsedOperands.push(parsed);
            }

            // --- SYNTAX & SEMANTIC VALIDATION ---
            if (typeof AssemblyValidator !== 'undefined') {
                const lineErrors = AssemblyValidator.validateLine(item.lineNum, item.text, mnemonic, parsedOperands, labels, variables);
                if (lineErrors.length > 0) {
                    errors.push(...lineErrors);
                }
            }

            // Jump / Loop target resolution
            let targetIp = undefined;
            if (['jmp', 'jz', 'je', 'jnz', 'jne', 'jc', 'jb', 'jnc', 'jnb', 'jae', 'js', 'jns', 'jo', 'jno', 'loop', 'call'].includes(mnemonic)) {
                if (parsedOperands.length > 0) {
                    const op = parsedOperands[0];
                    if (op.isLabel && labels[op.labelName] !== undefined) {
                        targetIp = labels[op.labelName];
                    } else if (op.type === 'immediate') {
                        targetIp = op.value;
                    }
                }
            }

            // Assign base clock cycles
            let baseCycles = 2;
            if (['mul', 'div'].includes(mnemonic)) baseCycles = 70;
            else if (['jmp', 'call', 'loop'].includes(mnemonic)) baseCycles = 8;
            else if (parsedOperands.some(op => op && op.type === 'memory')) baseCycles = 8;

            // Generate Machine Code Bytes for Code Segment
            let mBytes = [0x90]; // default NOP
            const op0 = parsedOperands[0];
            const op1 = parsedOperands[1];

            if (mnemonic === 'nop') mBytes = [0x90];
            else if (mnemonic === 'hlt') mBytes = [0xF4];
            else if (mnemonic === 'clc') mBytes = [0xF8];
            else if (mnemonic === 'stc') mBytes = [0xF9];
            else if (mnemonic === 'cmc') mBytes = [0xF5];
            else if (mnemonic === 'cld') mBytes = [0xFC];
            else if (mnemonic === 'std') mBytes = [0xFD];
            else if (mnemonic === 'cli') mBytes = [0xFA];
            else if (mnemonic === 'sti') mBytes = [0xFB];
            else if (mnemonic === 'ret') mBytes = [0xC3];
            else if (mnemonic === 'iret') mBytes = [0xCF];
            else if (mnemonic === 'int' && op0 && op0.type === 'immediate') {
                mBytes = [0xCD, op0.value & 0xFF];
            }
            else if (mnemonic === 'in' && op1) {
                const p = op1.value || 0;
                mBytes = [0xE4, p & 0xFF];
            }
            else if (mnemonic === 'out' && op0) {
                const p = op0.value || 0;
                mBytes = [0xE6, p & 0xFF];
            }
            else if (mnemonic === 'mov' && op0 && op1) {
                if (op0.type === 'register' && op1.type === 'immediate') {
                    if (op0.is16Bit) {
                        const r = REG_MAP_16[op0.name] || 0;
                        mBytes = [0xB8 + r, op1.value & 0xFF, (op1.value >> 8) & 0xFF];
                    } else {
                        const r = REG_MAP_8[op0.name] || 0;
                        mBytes = [0xB0 + r, op1.value & 0xFF];
                    }
                } else if (op0.type === 'register' && op1.type === 'register') {
                    if (op0.is16Bit) {
                        const dst = REG_MAP_16[op0.name] || 0;
                        const src = REG_MAP_16[op1.name] || 0;
                        mBytes = [0x89, 0xC0 + (src << 3) + dst];
                    } else {
                        const dst = REG_MAP_8[op0.name] || 0;
                        const src = REG_MAP_8[op1.name] || 0;
                        mBytes = [0x88, 0xC0 + (src << 3) + dst];
                    }
                } else if (op0.type === 'register' && op1.type === 'memory') {
                    mBytes = [0x8B, 0x06, (op1.displacement || 0) & 0xFF, ((op1.displacement || 0) >> 8) & 0xFF];
                } else if (op0.type === 'memory' && op1.type === 'register') {
                    mBytes = [0x89, 0x06, (op0.displacement || 0) & 0xFF, ((op0.displacement || 0) >> 8) & 0xFF];
                }
            }
            else if (mnemonic === 'add' && op0 && op1 && op0.type === 'register' && op1.type === 'register') {
                const dst = REG_MAP_16[op0.name] || 0;
                const src = REG_MAP_16[op1.name] || 0;
                mBytes = [0x01, 0xC0 + (src << 3) + dst];
            }
            else if (mnemonic === 'sub' && op0 && op1 && op0.type === 'register' && op1.type === 'register') {
                const dst = REG_MAP_16[op0.name] || 0;
                const src = REG_MAP_16[op1.name] || 0;
                mBytes = [0x29, 0xC0 + (src << 3) + dst];
            }
            else if (mnemonic === 'cmp' && op0 && op1) {
                mBytes = [0x39, 0xC0];
            }
            else if (mnemonic === 'inc' && op0 && op0.type === 'register' && op0.is16Bit) {
                mBytes = [0x40 + (REG_MAP_16[op0.name] || 0)];
            }
            else if (mnemonic === 'dec' && op0 && op0.type === 'register' && op0.is16Bit) {
                mBytes = [0x48 + (REG_MAP_16[op0.name] || 0)];
            }
            else if (mnemonic === 'loop') {
                mBytes = [0xE2, 0xFE];
            }
            else if (mnemonic === 'jmp') {
                mBytes = [0xEB, 0x00];
            }

            const codeOffset = allCodeBytes.length;
            for (const b of mBytes) allCodeBytes.push(b);

            instructions.push({
                index: idx,
                sourceLine: item.lineNum,
                sourceText: item.text,
                mnemonic: mnemonic,
                operands: parsedOperands,
                targetIp: targetIp,
                baseCycles: baseCycles,
                codeBytes: mBytes,
                codeOffset: codeOffset
            });
        }

        return {
            instructions,
            labels,
            variables,
            dataBytes,
            codeBytes: allCodeBytes,
            errors,
            sourceLines: lines
        };
    }
}

if (typeof window !== 'undefined') window.Assembler = Assembler;
if (typeof module !== 'undefined') module.exports = Assembler;
