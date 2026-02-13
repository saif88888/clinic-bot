const express = require('express');
const app = express();

app.use(express.json());

// Verification route (GET)
app.get('/webhook', (req, res) => {
	const VERIFY_TOKEN = 'my_verify_token'; // choose your token

	const mode = req.query['hub.mode'];
	const token = req.query['hub.verify_token'];
	const challenge = req.query['hub.challenge'];

	if (mode && token) {
		if (mode === 'subscribe' && token === VERIFY_TOKEN) {
			console.log('Webhook verified!');
			res.status(200).send(challenge);
		} else {
			res.sendStatus(403);
		}
	}
});

// Incoming messages (POST)
app.post('/webhook', (req, res) => {
	console.log('Incoming:', req.body);
	res.sendStatus(200);
});

app.get('/', (req, res) => {
	res.send('Bot is running');
});

app.listen(3000, () => console.log('Server running on port 3000'));
