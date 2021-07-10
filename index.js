const express = require('express');
const app = express();
const basicAuth = require('express-basic-auth');
const got = require('got');
const path = require('path');

app.use(express.urlencoded());
app.use(basicAuth({
	users: {
		admin: process.env.PASSWORD
	},
	challenge: true
}))

app.get('/', (req, res) => {
	res.sendFile(path.resolve('index.html'));
});

app.post('/search', async (req, res) => {
	await new Promise(resolve => setTimeout(resolve, 5000));
	res.status(200).send(req.body);
});

app.listen(8080, function () {
	console.log('Listening!');
});