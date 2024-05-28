require('./instrument')
const express = require('express');
const expressWs = require('express-ws');
const { Mwn } = require('mwn');
const basicAuth = require('express-basic-auth');
const secure = require('express-force-https');
const got = require('grb');
const path = require('path');
const { collectDefaultMetrics, register } = require('prom-client');
const Sentry = require('@sentry/node');
const lodash = require('lodash');

const { app } = expressWs(express());
require('merida').init();

collectDefaultMetrics({
    label: {
        name: 'nora'
    }
});

const searchResults = (page, query) => {
    if (!page.revisions) {
        console.warn('Page doesn\'t have revisions', page);
        return false;
    }
    const { content } = page.revisions[0].slots.main;
    if (query.startsWith('/')) {
        const parts = query.match(/\/(.*)\/(?!.*\/)(.*)/);
        return new RegExp(parts[1], parts[2]).test(content);
    }
    return content.includes(query);
};

const getPages = async (bot, namespace, ws) => {
    let results = [];
    for await (const json of bot.continuedQueryGen({
        action: 'query',
        generator: 'allpages',
        gapnamespace: namespace,
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main'
    })) {
        if (ws.readyState !== 1) {
            console.log('stopping');
            break;
        }
        if (json.query?.pages) {
            results = results.concat(json.query.pages);
        }
    }
    return results;
};

//https://stackoverflow.com/a/40486595
const mergeByName = arr => lodash(arr)
    .groupBy(item => item.pageid)
    .map(group => lodash.mergeWith(...[{}].concat(group, (obj, src) => {
        if (Array.isArray(obj)) {
            return obj.concat(src);
        }
    })))
    .values()
    .value();

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

app.ws('/search', ws => {
    ws.on('message', async msg => {
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

        let wiki = null;
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

        const bot = new Mwn({
            apiUrl: `https://${wiki}/api.php`,
            userAgent: 'Nora - Contact Sophiedp if issue - https://youtu.be/e35AQK014tI'
        });

        for (const ns of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 828, 829]) {
            if (ws.readyState !== 1) {
                console.log('stopping');
                break;
            }
            const results = await getPages(bot, ns, ws);
            if (ws.readyState !== 1) {
                console.log('stopping');
                break;
            }
            const pages = mergeByName(results);
            if (ws.readyState !== 1) {
                console.log('stopping');
                break;
            }
            for (const page of pages.filter(page => searchResults(page, message.query))) {
                if (ws.readyState !== 1) {
                    console.log('stopping');
                    break;
                }
                ws.send(JSON.stringify({
                    msg: 'result',
                    url: `https://${wiki}/wiki/${page.title}`,
                    title: page.title
                }));
            }
        }

        ws.send(JSON.stringify({
            msg: 'done'
        }));
        ws.close(1000, 'done');
    });

    const heartbeat = setInterval(() => {
        switch (ws.readyState) {
            case 0:
                break;
            case 1:
                ws.ping();
                break;
            case 2:
            case 3:
                clearInterval(heartbeat);
                break;
        }
    }, 20000);
});

Sentry.setupExpressErrorHandler(app);

app.listen(process.env.PORT || 8080, function () {
    console.log('Listening!');
});