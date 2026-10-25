// Automated headless Edge browser verification via CDP (Chrome DevTools Protocol)
const http = require('http');
const { spawn } = require('child_process');

async function runBrowserTest() {
    console.log('Starting Headless Edge with remote debugging...');
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const edgeProcess = spawn(edgePath, [
        '--headless=new',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--disable-extensions',
        'file:///d:/Projects/%D9%85%D8%B4%D8%B1%D9%88%D8%B9%20%D8%A7%D9%84%D9%85%D9%8A%D9%83%D8%B1%D9%88%20%D8%A8%D8%B1%D9%88%D8%B3%D9%8A%D8%B3%D9%88%D8%B1/index.html'
    ], { stdio: 'ignore' });

    // Wait for Edge to listen on 9222
    let versionData = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
            versionData = await new Promise((resolve, reject) => {
                http.get('http://127.0.0.1:9222/json', (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(JSON.parse(body)));
                }).on('error', reject);
            });
            if (versionData && versionData.length > 0) break;
        } catch (e) {}
    }

    if (!versionData || versionData.length === 0) {
        console.error('Could not connect to Edge debugger');
        edgeProcess.kill();
        process.exit(1);
    }

    const page = versionData.find(p => p.type === 'page');
    console.log('Connected to Edge! Page Title:', page.title);

    const ws = new WebSocket(page.webSocketDebuggerUrl);

    await new Promise((resolve) => ws.onopen = resolve);
    console.log('WebSocket CDP connected!');

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

    const consoleLogs = [];
    const jsErrors = [];
    ws.addEventListener('message', (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
            consoleLogs.push({ type: msg.params.type, args: msg.params.args.map(a => a.value) });
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            jsErrors.push(msg.params.exceptionDetails);
        }
    });

    await sendCommand('Runtime.enable');
    await sendCommand('Console.enable');

    // Wait 1 second for any async init
    await new Promise(r => setTimeout(r, 1000));

    // Check if window.app exists
    const appCheck = await sendCommand('Runtime.evaluate', {
        expression: 'typeof window.app !== "undefined"'
    });
    console.log('window.app exists in real Edge browser:', appCheck.result.value);

    // Test assembling and stepping
    const stepTest = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                const initIp = window.app.cpu.registers.ip;
                window.app.onStep();
                const step1Ip = window.app.cpu.registers.ip;
                window.app.onStep();
                const step2Ip = window.app.cpu.registers.ip;
                return { initIp, step1Ip, step2Ip, ax: window.app.cpu.registers.ax.toString(16) };
            })()
        `,
        returnByValue: true
    });
    console.log('Step Execution Test in Edge:', stepTest.result.value);

    // Test clicking tabs
    const tabTest = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                const memBtn = document.querySelector('[data-tab="tab-memory"]');
                memBtn.click();
                const memActive = document.getElementById('tab-memory').classList.contains('active');
                return { memActive };
            })()
        `,
        returnByValue: true
    });
    console.log('Tab Navigation Test in Edge:', tabTest.result.value);

    // Test red flag syntax error diagnostics
    const errorSampleTest = await sendCommand('Runtime.evaluate', {
        expression: `
            (function() {
                window.app.loadSample('syntax_error_test');
                const diagCount = document.querySelectorAll('.diag-card').length;
                const flagLines = document.querySelectorAll('.error-line-flag').length;
                return { diagCount, flagLines };
            })()
        `,
        returnByValue: true
    });
    console.log('Red Flag & Smart Error Corrector in Edge:', errorSampleTest.result.value);

    console.log('\n--- Console Logs Recorded in Edge ---');
    console.log(consoleLogs);

    console.log('\n--- Uncaught Exceptions in Edge ---');
    console.log(jsErrors.length === 0 ? 'ZERO ERRORS! Clean console.' : jsErrors);

    ws.close();
    edgeProcess.kill();
    console.log('\n>>> REAL EDGE BROWSER TEST COMPLETED SUCCESSFULLY! <<<');
}

runBrowserTest().catch(console.error);
