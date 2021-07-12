/* eslint-disable promise/param-names */
const express = require('express');
const basicAuth = require('express-basic-auth');
const secure = require('express-force-https');
const got = require('got');
const path = require('path');
const pkg = require('./package.json');

const app = express();
let finished = false;

const wait = ms => new Promise(res => setTimeout(res, ms));
const query = (wiki, params, cb, resolve) => {
	if (finished) {
		return;
	}
	return new Promise(async result => { //eslint-disable-line no-async-promise-executor
		return await got(`https://${wiki}.fandom.com/api.php`, {
			searchParams: params,
			headers: {
				'user-agent': `Nora ${pkg.version} - contact Sophiedp if issue`
			}
		}).json().then(data => {
			cb(data);

			if (data['query-continue']) {
				query(
					Object.assign(
						{},
						params,
						...Object.values(data['query-continue'])
					),
					cb,
					resolve || result
				);
			} else {
				resolve();
			}
		});
	});
}
const searchResults = (page, query) => {
	if (page.revisions[0].slots.main['*'].includes(query)) {
		return true;
	}
	return false;
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
	await got.head(`https://${req.body.wiki}.fandom.com/api.php`, {
		headers: {
			'user-agent': `Nora ${pkg.version} - contact Sophiedp if issue`
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

	await query(req.body.wiki, {
		action: 'query',
		generator: 'allpages',
		gaplimit: 50,
		prop: 'revisions',
		rvprop: 'content',
		rvslots: '*',
		format: 'json'
	}, data => {
		for (const page of Object.values(data.query.pages).filter(page => searchResults(page, req.body.query))) {
			res.write(`<a href="https://${req.body.wiki}.fandom.com/wiki/${page.title}">${page.title}</a><br>`);
		}
	}, () => {
		finished = true;
		res.end('All done!');
	});

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