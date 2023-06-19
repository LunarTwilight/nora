const express = require('express');
const expressWs = require('express-ws');
const { mwn } = require('mwn');
const basicAuth = require('express-basic-auth');
const secure = require('express-force-https');
const got = require('grb');
const path = require('path');
const { collectDefaultMetrics, register } = require('prom-client');
const Sentry = require('@sentry/node');

const { app } = expressWs(express());
require('merida').init();

Sentry.init({
    dsn: process.env.DSN
});
app.use(Sentry.Handlers.requestHandler());

collectDefaultMetrics({
    label: {
        name: 'nora'
    }
});

const searchResults = (page, query) => {
    const content = page.revisions[0].slots.main['*'];
    if (query.startsWith('/')) {
        const parts = query.match(/\/(.*)\/(?!.*\/)(.*)/);
        return new RegExp(parts[1], parts[2]).test(content);
    }
    return content.includes(query);
};

app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).end(err);
    }
});

app.use(secure);
app.use(basicAuth({
    users: {
        admin: process.env.PASSWORD
    },
    challenge: true
}));
app.use(express.static('public', {
    maxAge: '3600000'
}));

app.get('/', (req, res) => {
    res.sendFile(path.resolve('/public/index.html'));
});

app.get('/search', (req, res) => {
    res.redirect('/');
});

app.ws('/search', (ws, req) => {
    ws.on('message', async msg => {
        let wiki = null;
        try {
            JSON.parse(msg);
        } catch {
            ws.close(1008, 'Invalid message');
            return;
        }

        const message = JSON.parse(msg);
        if (!message.wiki || !message.query) {
            ws.close(1008, 'no wiki or query provided');
            return;
        }

        if (message.wiki.includes('.')) {
            wiki = message.wiki.split('.')[1] + '.fandom.com/' + message.wiki.split('.')[0];
        } else {
            wiki = message.wiki + '.fandom.com';
        }

        try {
            await got.head(`https://${wiki}/api.php`, {
                headers: {
                    'user-agent': 'Nora - Contact Sophiedp if issue - https://youtu.be/e35AQK014tI'
                }
            });
        } catch (error) {
            ws.close(1008, `wiki check request returned ${error.response.statusCode}`);
            return;
        }

        ws.send(JSON.stringify({
            msg: 'ack'
        }));

        const bot = new mwn({
            apiUrl: `https://${wiki}/api.php`,
            userAgent: 'Nora - Contact Sophiedp if issue - https://youtu.be/e35AQK014tI'
        });

        for (const ns of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 828, 829]) {
            for await (const json of bot.continuedQueryGen({
                action: 'query',
                generator: 'allpages',
                prop: 'revisions',
                rvprop: 'content',
                rvslots: '*',
                gaplimit: 'max',
                gapnamespace: ns
            })) {
                if (json.query?.pages) {
                    for (const page of Object.values(json.query.pages).filter(page => searchResults(page, message.query))) {
                        ws.send(JSON.stringify({
                            msg: 'result',
                            url: `https://${wiki}/wiki/${page.title}`,
                            title: page.title
                        }));
                    }
                }
            }
        }

        ws.send(JSON.stringify({
            msg: 'done'
        }));
        ws.close(1000, 'done');
    });

    req.on('aborted', () => {
        console.log('aborting connection');
        ws.close(1001, 'client aborted connection');
    });

    req.on('close', () => {
        console.log('closing connection');
        ws.close(1001, 'client closed connection');
    });

    req.on('end', () => {
        console.log('ending connection');
        ws.close(1001, 'client ended connection');
    });
});

app.use(Sentry.Handlers.errorHandler());

app.listen(process.env.PORT || 8080, function () {
    console.log('Listening!');
});