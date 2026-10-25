/**
 * 8086 Assembly Parser & Lexer
 * Full support for 8086 syntax, Directives, and the 7 Data Addressing Modes
 */

class AssemblyParser {
    static parseNumber(str) {
        if (!str) return NaN;
        str = str.trim();
        // Hexadecimal: 0x1234 or 1234h / 1234H
        if (/^0x[0-9a-fA-F]+$/i.test(str)) return parseInt(str, 16);
        if (/^[0-9a-fA-F]+h$/i.test(str)) return parseInt(str.slice(0, -1), 16);
        // Binary: 1010b / 1010B
        if (/^[01]+b$/i.test(str)) return parseInt(str.slice(0, -1), 2);
        // Octal: 17o / 17q
        if (/^[0-7]+[oq]$/i.test(str)) return parseInt(str.slice(0, -1), 8);
        // Decimal
        if (/^-?[0-9]+$/.test(str)) return parseInt(str, 10);
        // Character literal: 'A'
        if (/^'(.?)'$/.test(str)) return str.charCodeAt(1);
        return NaN;
    }

    // Parse operand: register, immediate, or memory bracket expression
    static parseOperand(opStr, labels = {}, variables = {}) {
        opStr = opStr.trim();
        if (!opStr) return null;

        const REGISTERS_8 = ['al','ah','bl','bh','cl','ch','dl','dh'];
        const REGISTERS_16 = ['ax','bx','cx','dx','sp','bp','si','di','ip','cs','ds','ss','es'];

        const lower = opStr.toLowerCase();

        // 1. Register
        if (REGISTERS_8.includes(lower)) {
            return { type: 'register', name: lower, is16Bit: false };
        }
        if (REGISTERS_16.includes(lower)) {
            return { type: 'register', name: lower, is16Bit: true };
        }

        // Special Symbols: @data, @code
        if (lower === '@data') {
            return { type: 'immediate', value: 0x2000, is16Bit: true };
        }
        if (lower === '@code') {
            return { type: 'immediate', value: 0x1000, is16Bit: true };
        }

        // 2. Immediate number or label offset
        if (lower.startsWith('offset ')) {
            const lbl = lower.replace('offset ', '').trim();
            if (labels[lbl] !== undefined) {
                return { type: 'immediate', value: labels[lbl], is16Bit: true };
            }
            if (variables[lbl] !== undefined) {
                return { type: 'immediate', value: variables[lbl].offset, is16Bit: true };
            }
        }

        // Direct numeric immediate
        const num = this.parseNumber(opStr);
        if (!isNaN(num)) {
            return { type: 'immediate', value: num, is16Bit: num > 255 || num < -128 };
        }

        // Label as immediate target (for JMP, CALL)
        if (labels[lower] !== undefined) {
            return { type: 'immediate', value: labels[lower], is16Bit: true, isLabel: true, labelName: lower };
        }

        // Variable name direct address (e.g. MOV AX, VAR1 or MOV VAR1, AX)
        if (variables[lower] !== undefined) {
            const v = variables[lower];
            return {
                type: 'memory',
                base: null,
                index: null,
                displacement: v.offset,
                is16Bit: v.is16Bit,
                variableName: lower
            };
        }

        // 3. Memory Brackets: [...] or VAR[BX+SI]
        // Example forms:
        // [1234H]
        // [BX]
        // [BX+SI]
        // [BX+4]
        // [BX+SI+100H]
        // ARRAY[BX+SI]
        // ES:[DI]
        let segmentOverride = null;
        let memExp = opStr;

        // Check segment override: CS:, DS:, SS:, ES:
        const segMatch = memExp.match(/^(cs|ds|ss|es)\s*:\s*(.*)$/i);
        if (segMatch) {
            segmentOverride = segMatch[1].toLowerCase();
            memExp = segMatch[2].trim();
        }

        // Check VAR[...] syntax: ARRAY[BX+SI] -> VAR displacement
        let varDisp = 0;
        let is16BitContext = undefined;
        const prefixVarMatch = memExp.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\[(.*)\]$/);
        if (prefixVarMatch) {
            const varName = prefixVarMatch[1].toLowerCase();
            if (variables[varName]) {
                varDisp = variables[varName].offset;
                is16BitContext = variables[varName].is16Bit;
            }
            memExp = '[' + prefixVarMatch[2] + ']';
        }

        if (memExp.startsWith('[') && memExp.endsWith(']')) {
            const inner = memExp.slice(1, -1).trim();
            // Split tokens by + or -
            const tokens = inner.replace(/-/g, '+-').split('+').map(t => t.trim()).filter(t => t.length > 0);

            let base = null;
            let index = null;
            let displacement = varDisp;
            let invalidReg = null;

            for (const token of tokens) {
                const tLower = token.toLowerCase();
                if (['bx', 'bp'].includes(tLower)) {
                    base = tLower;
                } else if (['si', 'di'].includes(tLower)) {
                    index = tLower;
                } else if (['ax', 'cx', 'dx', 'sp', 'al', 'ah', 'bl', 'bh', 'cl', 'ch', 'dl', 'dh', 'ip', 'cs', 'ds', 'ss', 'es'].includes(tLower)) {
                    invalidReg = tLower;
                } else {
                    const parsedDisp = this.parseNumber(token);
                    if (!isNaN(parsedDisp)) {
                        displacement += parsedDisp;
                    } else if (variables[tLower]) {
                        displacement += variables[tLower].offset;
                        if (is16BitContext === undefined) is16BitContext = variables[tLower].is16Bit;
                    }
                }
            }

            return {
                type: 'memory',
                base,
                index,
                displacement: displacement & 0xFFFF,
                segmentOverride,
                invalidReg,
                is16Bit: is16BitContext !== undefined ? is16BitContext : true
            };
        }

        return { type: 'unknown', raw: opStr };
    }
}

if (typeof window !== 'undefined') window.AssemblyParser = AssemblyParser;
if (typeof module !== 'undefined') module.exports = AssemblyParser;
