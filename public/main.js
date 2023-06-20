const ws = new WebSocket('wss://nora.janey.cf/search');

document.querySelector('#entry input[type="submit"]').addEventListener('click', () => {
    const wiki = document.querySelector('#entry #wiki').value.trim();
    const query = document.querySelector('#entry #query').value.trim();
    if (!wiki || !query) {
        alert('no wiki or query');
        return;
    }


    ws.addEventListener('close', event => {
        if (event.code === 1000) {
            return;
        }

        alert(`websocket closed\ncode: ${event.code}\nreason: ${event.reason}`);
    });

    ws.addEventListener('message', event => {
        if (event.data === 'pong') {
            return;
        }

        const data = JSON.parse(event.data);
        switch (data.msg) {
            case 'ack': {
                document.body.classList.add('results');
                const span = document.createElement('span');
                span.id = 'thinking';
                span.textContent = 'Thinking...';
                const br = document.createElement('br');
                document.getElementById('results').append(span, br);
                break;
            }
            case 'result': {
                const link = document.createElement('a');
                link.href = data.url;
                link.innerText = data.title;
                const br = document.createElement('br');
                document.getElementById('results').append(link, br);
                break;
            }
            case 'done':
                document.body.classList.add('done');
                if (!document.getElementById('results').querySelector('a')) {
                    const span = document.createElement('span');
                    span.innerText('No results');
                    document.getElementById('results').append(span);
                }
                alert('Done!');
                break;
        }
    });

    ws.send(JSON.stringify({
        wiki,
        query
    }));

    document.addEventListener('beforeunload', () => {
        ws.close(1001, 'user leaving');
    });

    const heartbeat = setInterval(() => {
        switch (ws.readyState) {
            case 0:
                break;
            case 1:
                ws.send('ping');
                break;
            case 2:
            case 3:
                clearInterval(heartbeat);
                break;
        }
    }, 20000);
});