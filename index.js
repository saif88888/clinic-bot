const express = require('express');
const fetch = require('node-fetch');
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
app.post('/webhook', async (req, res) => {
	const data = req.body;

	// Check if this is a message
	if (data.object === 'whatsapp_business_account') {
		const entry = data.entry?.[0];
		const changes = entry?.changes?.[0];
		const message = changes?.value?.messages?.[0];

		if (message) {
			const from = message.from; // User's phone number
			const text = message.text?.body; // User's message text

			console.log('User said:', text);

			// Send a reply
			await fetch(
				`https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						messaging_product: 'whatsapp',
						to: from,
						text: { body: 'Thanks for your message!' },
					}),
				},
			);
		}
	}

	res.sendStatus(200);
});

app.get('/', (req, res) => {
	res.send('Bot is running');
});

app.listen(3000, () => console.log('Server running on port 3000'));
