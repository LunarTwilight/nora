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
	return new Promise(async result => {
		return await got(`https://${wiki}.fandom.com/api.php`, {
			searchParams: params,
			'user-agent': `Nora ${pkg.version} - contact Sophiedp if issue`
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
const search = async params => {
	let result;
	await query(params.wiki, {
		action: 'query',
		generator: 'allpages',
		gaplimit: 50,
		prop: 'revisions',
		rvprop: 'content',
		format: 'json'
	}, data => {
		result = data;
	}, () => {});
	return result;
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
		</style>
	`);
	res.write('Thinking...<br>');

	search(req.body).then(data => {
		finished = true;
		res.end(data);
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
		(async function () {
			await got('https://a-nora.herokuapp.com', {
				username: 'admin',
				password: process.env.PASSWORD
			});
		})();
	}
});

app.listen(process.env.PORT || 8080, function () {
	console.log('Listening!');
});