const express = require('express');
const basicAuth = require('express-basic-auth');
const secure = require('express-force-https');
const got = require('got');
const path = require('path');
const pkg = require('./package.json');
const { collectDefaultMetrics, register } = require('prom-client');
const Sentry = require('@sentry/node');

const app = express();

Sentry.init({
    dsn: process.env.DSN
});
app.use(Sentry.Handlers.requestHandler());

collectDefaultMetrics({
    label: {
        name: 'nora'
    }
});

const wait = ms => new Promise(res => setTimeout(res, ms));
const query = ({
    wiki,
    params,
    onResult
}) => {
    return new Promise(async resolve => { //eslint-disable-line no-async-promise-executor
        const searchParams = { ...params };

        while (true) {
            const data = await got(`https://${wiki}/api.php`, {
                searchParams,
                headers: {
                    'user-agent': `Nora ${pkg.version} - contact Sophiedp if issue - https://youtu.be/e35AQK014tI`
                }
            }).json();

            const shouldStop = onResult(data);

            if (shouldStop !== true && data.continue) {
                Object.assign(
                    searchParams,
                    data.continue
                );
            } else {
                resolve();
                break;
            }
        }
    });
}
const searchResults = (page, query) => {
    const content = page.revisions[0].slots.main['*'];
    if (query.startsWith('/')) {
        return query.test(content);
    }
    return content.includes(query);
}

app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.staus(500).end(err);
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
app.use(express.urlencoded({
    extended: false
}));

app.get('/', (req, res) => {
    res.sendFile(path.resolve('/public/index.html'));
});

app.get('/search', (req, res) => {
    res.redirect('/');
});

app.post('/search', async (req, res) => {
    let wiki;
    let finished = false;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.write('<link rel="stylesheet" href="results.css"/>');

    if (req.body.wiki.includes('.')) {
        wiki = req.body.wiki.split('.')[1] + '.fandom.com/' + req.body.wiki.split('.')[0];
    } else {
        wiki = req.body.wiki;
    }

    await got.head(`https://${wiki}/api.php`, {
        headers: {
            'user-agent': `Nora ${pkg.version} - contact Sophiedp if issue - https://youtu.be/e35AQK014tI`
        }
    }).catch(result => {
        finished = true;
        const code = result.response.statusCode;
        res.end(`Wiki returned: <a href="https://developer.mozilla.org/docs/Web/HTTP/Status/${code}">${code}</a>`);
    });
    if (finished) {
        return;
    }

    res.write('Thinking...<br>');

    for (const ns of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 828, 829]) {
        await query({
            finished,
            wiki: wiki,
            params: {
                action: 'query',
                generator: 'allpages',
                prop: 'revisions',
                rvprop: 'content',
                rvslots: '*',
                gaplimit: 50,
                gapnamespace: ns,
                format: 'json'
            },
            onResult: data => {
                if (finished || !data.query) {
                    return true;
                }
                try {
                    for (const page of Object.values(data.query.pages).filter(page => searchResults(page, req.body.query))) {
                        res.write(`<a href="https://${wiki}/wiki/${page.title}">${page.title}</a><br>`);
                    }
                } catch (error) {
                    console.error(error, data, ns);
                }
            }
        });
    }

    finished = true;
    res.end('All done!');

    req.on('aborted', () => {
        console.log('aborting connection');
        finished = true;
    });

    req.on('close', () => {
        console.log('closing connection');
        finished = true;
    });

    req.on('end', () => {
        console.log('ending connection');
        finished = true;
    });

    /*while (true) {
        await wait(40000);
        if (finished) break;

        res.write('...<br>');
        if (process.env.PORT) {
            (async function () {
                await got('https://a-nora.herokuapp.com', {
                    username: 'admin',
                    password: process.env.PASSWORD
                });
            })();
        }
    }*/
});

app.use(Sentry.Handlers.errorHandler());

app.listen(process.env.PORT || 8080, function () {
    console.log('Listening!');
});