/**
 * 8086 Assembly Code Editor with Breakpoints, Live Line Highlighting,
 * Red-Flag Error Indicators (🚩), and Smart Auto-Corrector
 */

class CodeEditor {
    constructor(editorContainerId, lineNumbersId, textareaId, diagnosticsContainerId = 'diagnostics-container') {
        this.container = document.getElementById(editorContainerId);
        this.lineNumbersEl = document.getElementById(lineNumbersId);
        this.textarea = document.getElementById(textareaId);
        this.diagnosticsEl = document.getElementById(diagnosticsContainerId);

        this.breakpoints = new Set();
        this.activeLine = -1;
        this.errorsMap = new Map(); // lineNum -> error object

        this.initEvents();
    }

    initEvents() {
        if (!this.textarea) return;

        this.textarea.addEventListener('input', () => {
            this.updateLineNumbers();
        });

        this.textarea.addEventListener('scroll', () => {
            if (this.lineNumbersEl) {
                this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
            }
        });

        // Tab key support
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.textarea.selectionStart;
                const end = this.textarea.selectionEnd;
                this.textarea.value = this.textarea.value.substring(0, start) + '    ' + this.textarea.value.substring(end);
                this.textarea.selectionStart = this.textarea.selectionEnd = start + 4;
                this.updateLineNumbers();
            }
        });

        this.updateLineNumbers();
    }

    setValue(text) {
        if (this.textarea) {
            this.textarea.value = text;
            this.errorsMap.clear();
            this.updateLineNumbers();
            this.renderDiagnostics([]);
        }
    }

    getValue() {
        return this.textarea ? this.textarea.value : '';
    }

    toggleBreakpoint(lineNum) {
        if (this.breakpoints.has(lineNum)) {
            this.breakpoints.delete(lineNum);
        } else {
            this.breakpoints.add(lineNum);
        }
        this.updateLineNumbers();
    }

    setActiveLine(lineNum) {
        this.activeLine = lineNum;
        this.updateLineNumbers();
    }

    setErrorDiagnostics(errorsList) {
        this.errorsMap.clear();
        for (const err of errorsList) {
            this.errorsMap.set(err.line, err);
        }
        this.updateLineNumbers();
        this.renderDiagnostics(errorsList);
    }

    clearHighlights() {
        this.activeLine = -1;
        this.errorsMap.clear();
        this.updateLineNumbers();
        this.renderDiagnostics([]);
    }

    // Auto-fix: replaces line content with corrected code
    applyFix(lineNum, fixedLine) {
        if (!this.textarea || !fixedLine) return;
        const lines = this.textarea.value.split('\n');
        if (lineNum > 0 && lineNum <= lines.length) {
            lines[lineNum - 1] = fixedLine;
            this.textarea.value = lines.join('\n');
            this.updateLineNumbers();
            // Trigger assemble to re-validate
            if (window.app) window.app.onAssemble();
        }
    }

    updateLineNumbers() {
        if (!this.lineNumbersEl || !this.textarea) return;

        const lines = this.textarea.value.split('\n');
        const count = Math.max(lines.length, 1);
        let html = '';

        for (let i = 1; i <= count; i++) {
            const hasBp = this.breakpoints.has(i);
            const isActive = (this.activeLine === i);
            const errorObj = this.errorsMap.get(i);
            const isError = !!errorObj;

            let classes = 'line-num';
            if (hasBp) classes += ' has-bp';
            if (isActive) classes += ' active-line';
            if (isError) classes += ' error-line-flag';

            let symbol = hasBp ? '●' : i;
            if (isError) {
                symbol = '🚩'; // Red Flag indicator!
            }

            const title = errorObj ? `Line ${i}: ${errorObj.message}` : `Line ${i}`;

            html += `<div class="${classes}" title="${title}" onclick="window.app.editor.onLineClick(${i})">${symbol}</div>`;
        }

        this.lineNumbersEl.innerHTML = html;
        this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
    }

    onLineClick(lineNum) {
        const err = this.errorsMap.get(lineNum);
        if (err) {
            const card = document.getElementById(`diag-card-${lineNum}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                card.classList.add('highlight-pulse');
                setTimeout(() => card.classList.remove('highlight-pulse'), 1500);
            }
        } else {
            this.toggleBreakpoint(lineNum);
        }
    }

    // Safe HTML Escape helper to prevent XSS
    static escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    renderDiagnostics(errorsList) {
        if (!this.diagnosticsEl) return;

        if (!errorsList || errorsList.length === 0) {
            this.diagnosticsEl.innerHTML = `
                <div class="diag-empty">
                    <span style="color: var(--accent-green); font-weight: 600;">&#10004; No syntax errors detected - Code is valid</span>
                </div>
            `;
            return;
        }

        let html = `<div class="diag-header"><span class="badge-flag">🚩 ${errorsList.length} Syntax Error(s) Detected</span></div><div class="diag-list">`;

        for (const err of errorsList) {
            const safeCode = CodeEditor.escapeHtml(err.code);
            const safeMsg = CodeEditor.escapeHtml(err.message);
            const safeSuggestion = CodeEditor.escapeHtml(err.suggestion);
            const safeFixedLine = CodeEditor.escapeHtml(err.fixedLine);
            const escapedJsFix = err.fixedLine ? err.fixedLine.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';

            html += `
                <div class="diag-card" id="diag-card-${err.line}">
                    <div class="diag-card-top">
                        <span class="diag-flag-icon">🚩</span>
                        <strong>Line ${err.line}:</strong>
                        <code>${safeCode}</code>
                    </div>
                    <div class="diag-msg">${safeMsg}</div>
                    ${err.suggestion ? `<div class="diag-suggestion">&#128161; <strong>Tip:</strong> ${safeSuggestion}</div>` : ''}
                    ${err.fixedLine ? `
                        <div class="diag-fix-action">
                            <span>Correction: <code>${safeFixedLine}</code></span>
                            <button class="btn btn-sm btn-primary" onclick="window.app.editor.applyFix(${err.line}, '${escapedJsFix}')">&#9889; Apply Fix</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        html += `</div>`;
        this.diagnosticsEl.innerHTML = html;
    }
}

if (typeof window !== 'undefined') window.CodeEditor = CodeEditor;
if (typeof module !== 'undefined') module.exports = CodeEditor;
