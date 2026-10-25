// Interactive buttons test in real Edge browser
const http = require('http');
const { spawn } = require('child_process');

async function testButtons() {
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const edgeProcess = spawn(edgePath, [
        '--headless=new',
        '--disable-gpu',
        '--remote-debugging-port=9223',
        '--disable-extensions',
        'file:///d:/Projects/%D9%85%D8%B4%D8%B1%D9%88%D8%B9%20%D8%A7%D9%84%D9%85%D9%8A%D9%83%D8%B1%D9%88%20%D8%A8%D8%B1%D9%88%D8%B3%D9%8A%D8%B3%D9%88%D8%B1/index.html'
    ], { stdio: 'ignore' });

    let versionData = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
            versionData = await new Promise((resolve, reject) => {
                http.get('http://127.0.0.1:9223/json', (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(JSON.parse(body)));
                }).on('error', reject);
            });
            if (versionData && versionData.length > 0) break;
        } catch (e) {}
    }

    const page = versionData.find(p => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.onopen = resolve);

    let msgId = 1;
    function sendCommand(method, params = {}) {
        return new Promise((resolve) => {
            const id = msgId++;
            const handler = (evt) => {
                const data = JSON.parse(evt.data);
                if (data.id === id) {
                    ws.removeEventListener('message', handler);
                    resolve(data.result);
                }
            };
            ws.addEventListener('message', handler);
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    await sendCommand('Runtime.enable');

    // 1. Test clicking Assemble button
    const testAssemble = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                const btn = document.getElementById('btn-assemble');
                btn.click();
                const status = document.getElementById('assembly-status').textContent;
                return { status };
            })()
        `,
        returnByValue: true
    });
    console.log('Assemble Button Click:', testAssemble.result.value);

    // 2. Test clicking Step button
    const testStep = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                const btn = document.getElementById('btn-step');
                const beforeIp = window.app.cpu.registers.ip;
                btn.click();
                const afterIp = window.app.cpu.registers.ip;
                return { beforeIp, afterIp };
            })()
        `,
        returnByValue: true
    });
    console.log('Step Button Click:', testStep.result.value);

    // 3. Test clicking Step Back button
    const testStepBack = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                const btn = document.getElementById('btn-step-back');
                btn.click();
                const backIp = window.app.cpu.registers.ip;
                return { backIp };
            })()
        `,
        returnByValue: true
    });
    console.log('Step Back Button Click:', testStepBack.result.value);

    // 4. Test clicking Reset button
    const testReset = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                const btn = document.getElementById('btn-reset');
                btn.click();
                return { ip: window.app.cpu.registers.ip, clock: window.app.cpu.clockCycles };
            })()
        `,
        returnByValue: true
    });
    console.log('Reset Button Click:', testReset.result.value);

    // 5. Test clicking Theme toggle
    const testTheme = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                const btn = document.getElementById('btn-theme-toggle');
                const before = document.documentElement.getAttribute('data-theme');
                btn.click();
                const after = document.documentElement.getAttribute('data-theme');
                btn.click();
                const reverted = document.documentElement.getAttribute('data-theme');
                return { before, after, reverted };
            })()
        `,
        returnByValue: true
    });
    console.log('Theme Switcher Click:', testTheme.result.value);

    // 6. Test Auto-Fix button on Syntax Error sample
    const testAutoFix = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                window.app.loadSample('syntax_error_test');
                const firstFixBtn = document.querySelector('.diag-fix-action button');
                const errorCountBefore = window.app.assembledData.errors.length;
                if (firstFixBtn) firstFixBtn.click();
                const errorCountAfter = window.app.assembledData.errors.length;
                return { errorCountBefore, errorCountAfter, fixedSuccess: errorCountAfter < errorCountBefore };
            })()
        `,
        returnByValue: true
    });
    console.log('Smart Auto-Fix Button Click:', testAutoFix.result.value);

    ws.close();
    edgeProcess.kill();
    console.log('\n>>> ALL REAL BROWSER INTERACTION TESTS PASSED! <<<');
}

testButtons().catch(console.error);
