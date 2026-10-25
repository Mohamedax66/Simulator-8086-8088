const { spawn } = require('child_process');
const http = require('http');

async function test() {
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const edge = spawn(edgePath, [
        '--headless=new',
        '--disable-gpu',
        '--remote-debugging-port=9225',
        'file:///d:/Projects/Simulator-8086-8088/index.html'
    ], { stdio: 'ignore' });

    let data = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        try {
            data = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9225/json', (r) => {
                    let b = '';
                    r.on('data', c => b += c);
                    r.on('end', () => res(JSON.parse(b)));
                }).on('error', rej);
            });
            if (data && data.length) break;
        } catch(e) {}
    }

    const page = data.find(p => p.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 1;
    function send(m, p = {}) {
        return new Promise(res => {
            const curId = id++;
            const h = (e) => {
                const d = JSON.parse(e.data);
                if (d.id === curId) { ws.removeEventListener('message', h); res(d.result); }
            };
            ws.addEventListener('message', h);
            ws.send(JSON.stringify({ id: curId, method: m, params: p }));
        });
    }

    await send('Runtime.enable');
    const res = await send('Runtime.evaluate', {
        expression: '({ appReady: typeof window.app !== "undefined", title: document.title, instructions: window.app.assembledData ? window.app.assembledData.instructions.length : 0 })',
        returnByValue: true
    });
    console.log('Result from Simulator-8086-8088:', res.result.value);
    ws.close();
    edge.kill();
}

test().catch(console.error);
