const express = require('express');
const app = express();
const basicAuth = require('express-basic-auth');
const secure = require('express-force-https');
const got = require('got');
const path = require('path');

app.use(secure);
app.use(express.static('public'))
app.use(express.urlencoded({
	extended: false
}));
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
	res.status(200).send(req.body);
});

app.listen(process.env.PORT || 8080, function () {
	console.log('Listening!');
});