const express = require('express');
const basicAuth = require('express-basic-auth');
const secure = require('express-force-https');
const got = require('got');
const path = require('path');
const pkg = require('./package.json');

const app = express();
const heartbeat = (response, counter) => {
	if (!counter) {
		let counter = 1;
	}
	response.write(' ;i=' + counter);
	counter++;
	setTimeout(() => {
		heartbeat(response, counter);
	}, 1000);
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
	res.write('Thinking...');
	heartbeat(res);

	function query (params, cb, resolve) {
		return new Promise(result => { //eslint-disable-line promise/param-names
			return got(`https://${req.body.wiki}.fandom.com/api.php`, {
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

	function filterResults (page) {
		var content = page.revisions[0]['*'];

		if (content.includes(req.body.query)) {
			return true;
		}

		return false;
	}

	async function main () {
		var pages = [];

		await query({
			action: 'query',
			generator: 'allpages',
			gaplimit: 50,
			prop: 'revisions',
			rvprop: 'content',
			format: 'json'
		}, (data) => {
			for (const page of Object.values(data.query.pages).filter(filterResults)) {
				pages.push(page);
			}
		}, () => {});

		res.write(pages.map(page => `* [[${page.title}]]`).join('\n'));
	}

	main();
});

app.listen(process.env.PORT || 8080, function () {
	console.log('Listening!');
});