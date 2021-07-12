/* eslint-disable promise/param-names */
const express = require('express');
const basicAuth = require('express-basic-auth');
const secure = require('express-force-https');
const got = require('got');
const path = require('path');
const pkg = require('./package.json');

const app = express();

const wait = ms => new Promise(res => setTimeout(res, ms));
const query = ({
    wiki,
    params,
    onResult
}) => {
    return new Promise(async resolve => { //eslint-disable-line no-async-promise-executor
        const searchParams = { ...params };

        while (true) {
            const data = await got(`https://${wiki}.fandom.com/api.php`, {
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
        if (query.test(content)) {
            return true;
        }
        return false;
    } else {
        if (content.includes(query)) {
            return true;
        }
        return false;
    }
}

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
    res.sendFile(path.resolve('index.html'));
});

app.get('/search', (req, res) => {
    res.redirect('/');
});

app.post('/search', async (req, res) => {
    let finished = false;

    await got.head(`https://${req.body.wiki}.fandom.com/api.php`, {
        headers: {
            'user-agent': `Nora ${pkg.version} - contact Sophiedp if issue - https://youtu.be/e35AQK014tI`
        }
    }).catch(result => {
        finished = true;
        res.end(result);
    });
    if (finished) {
        return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.write(`
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Karla:wght@300&display=swap');
            body {
                background-color: black;
                color: hotpink;
                font-family: 'Karla'
            }
            a {
                color: #ff3f8b;
            }
        </style>
    `);
    res.write('Thinking...<br>');

    for (const ns in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 828, 829]) {
        await query({
            finished,
            wiki: 'dev',
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
                if (finished) {
                    return true;
                }
                try {
                    for (const page of Object.values(data.query.pages).filter(page => searchResults(page, req.body.query))) {
                        res.write(`<a href="https://${req.body.wiki}.fandom.com/wiki/${page.title}">${page.title}</a><br>`);
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

    while (true) {
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
    }
});

app.listen(process.env.PORT || 8080, function () {
    console.log('Listening!');
});