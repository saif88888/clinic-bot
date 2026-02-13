const express = require('express');
const app = express();

app.use(express.json());

// Verification route (GET)
app.get('/webhook', (req, res) => {
	const VERIFY_TOKEN = 'my_verify_token';

	const mode = req.query['hub.mode'];
	const token = req.query['hub.verify_token'];
	const challenge = req.query['hub.challenge'];

	if (mode && token) {
		if (mode === 'subscribe' && token === VERIFY_TOKEN) {
			console.log('Webhook verified!');
			return res.status(200).send(challenge);
		} else {
			return res.sendStatus(403);
		}
	}
});

// Incoming messages (POST)
app.post('/webhook', async (req, res) => {
	const data = req.body;

	if (data.object === 'whatsapp_business_account') {
		const entry = data.entry?.[0];
		const changes = entry?.changes?.[0];
		const message = changes?.value?.messages?.[0];

		if (message) {
			const from = message.from;
			const text = message.text?.body;

			console.log('User said:', text);

			try {
				const response = await fetch(
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

				const result = await response.text();
				console.log('WhatsApp API response:', result);
			} catch (err) {
				console.error('Error sending message:', err);
			}
		}
	}

	res.sendStatus(200);
});

// Root route
app.get('/', (req, res) => {
	res.send('Bot is running');
});

app.listen(3000, () => console.log('Server running on port 3000'));
