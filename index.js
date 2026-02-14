const express = require('express');
const app = express();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(express.json());

// In-memory user state (per WhatsApp number)
const userState = {};
// Structure:
// userState[from] = {
//   step: "idle" | "ask_name" | "ask_service" | "ask_date" | "ask_time" | "confirm",
//   name: "",
//   service: "",
//   date: "",
//   time: ""
// };

// ------------------------------
// Helper: Send WhatsApp Message
// ------------------------------
async function sendMessage(to, message) {
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
					to,
					text: { body: message },
				}),
			},
		);

		const result = await response.text();
		console.log('WhatsApp API response:', result);
	} catch (err) {
		console.error('Error sending message:', err);
	}
}

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 587,
	secure: false,
	family: 4,
	auth: {
		user: process.env.NOTIFY_EMAIL_USER,
		pass: process.env.NOTIFY_EMAIL_PASS,
	},
	tls: {
		rejectUnauthorized: false,
	},
});

async function notifyClinic(booking) {
	await resend.emails.send({
		from: 'Clinic <notifications@yourdomain.com>',
		to: process.env.CLINIC_EMAIL,
		subject: `New booking request from ${booking.name}`,
		text: `New booking request:

Name: ${booking.name}
Treatment: ${booking.service}
Date: ${booking.date}
Time: ${booking.time}
WhatsApp: ${booking.from}`,
	});
}

// ------------------------------
// Webhook Verification (GET)
// ------------------------------
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

// ------------------------------
// Helper: Reset user state
// ------------------------------
function resetState(from) {
	userState[from] = {
		step: 'idle',
		name: '',
		service: '',
		date: '',
		time: '',
	};
}

// ------------------------------
// Main Menu Message
// ------------------------------
function getMainMenu() {
	return `👋 Welcome to our Clinic!

How can I help you today?

1️⃣ Book an appointment  
2️⃣ Opening hours  
3️⃣ Speak to reception  

Reply with a number to continue.`;
}

// ------------------------------
// Incoming Messages (POST)
// ------------------------------
app.post('/webhook', async (req, res) => {
	const data = req.body;

	if (data.object === 'whatsapp_business_account') {
		const entry = data.entry?.[0];
		const changes = entry?.changes?.[0];
		const message = changes?.value?.messages?.[0];

		if (message) {
			const from = message.from;
			const text = (message.text?.body || '').trim();

			console.log('User said:', text);

			// Ensure state exists
			if (!userState[from]) {
				resetState(from);
			}

			const state = userState[from];

			// ------------------------------
			// If user types "menu" at any time → reset and show menu
			// ------------------------------
			if (text.toLowerCase() === 'menu') {
				resetState(from);
				await sendMessage(from, getMainMenu());
				return res.sendStatus(200);
			}

			// ------------------------------
			// If user is in the middle of booking, handle steps
			// ------------------------------
			if (state.step === 'ask_name') {
				state.name = text;
				state.step = 'ask_service';
				await sendMessage(
					from,
					`Thanks, ${state.name}. What treatment would you like to book?

For example:
- Anti-wrinkle injections
- Dermal fillers
- Skin consultation`,
				);
				return res.sendStatus(200);
			}

			if (state.step === 'ask_service') {
				state.service = text;
				state.step = 'ask_date';
				await sendMessage(
					from,
					`Great. What date would you like to come in?

For example:
- 20 Feb
- Next Monday`,
				);
				return res.sendStatus(200);
			}

			if (state.step === 'ask_date') {
				state.date = text;
				state.step = 'ask_time';
				await sendMessage(
					from,
					`And what time works best for you on ${state.date}?

For example:
- 10:00
- 3pm`,
				);
				return res.sendStatus(200);
			}

			if (state.step === 'ask_time') {
				state.time = text;
				state.step = 'confirm';

				await sendMessage(
					from,
					`Perfect. Please confirm your booking:

Name: ${state.name}
Treatment: ${state.service}
Date: ${state.date}
Time: ${state.time}

Reply:
1️⃣ to confirm
2️⃣ to cancel`,
				);
				return res.sendStatus(200);
			}

			if (state.step === 'confirm') {
				if (text === '1') {
					await notifyClinic({
						from,
						name: state.name,
						service: state.service,
						date: state.date,
						time: state.time,
					});
					await sendMessage(
						from,
						`✅ Your appointment request has been received. We will confirm your booking shortly. If you need anything else, reply "menu" to see options again.`,
					);
					resetState(from);
					return res.sendStatus(200);
				} else if (text === '2') {
					await sendMessage(
						from,
						`❌ Your booking has been cancelled.

If you’d like to start again, reply "menu".`,
					);
					resetState(from);
					return res.sendStatus(200);
				} else {
					await sendMessage(
						from,
						`Please reply:
1️⃣ to confirm
2️⃣ to cancel`,
					);
					return res.sendStatus(200);
				}
			}

			// ------------------------------
			// If not in a flow → handle main menu / first contact
			// ------------------------------
			if (
				!text ||
				text.toLowerCase() === 'hi' ||
				text.toLowerCase() === 'hello'
			) {
				await sendMessage(from, getMainMenu());
				return res.sendStatus(200);
			}

			// Main menu options (only when idle)
			if (state.step === 'idle') {
				if (text === '1') {
					state.step = 'ask_name';
					await sendMessage(
						from,
						`Great! Let's book your appointment.

What’s your full name?`,
					);
					return res.sendStatus(200);
				}

				if (text === '2') {
					await sendMessage(
						from,
						`We’re open Monday–Saturday, 9am–6pm.

Reply "menu" to go back to the main menu.`,
					);
					return res.sendStatus(200);
				}

				if (text === '3') {
					await sendMessage(
						from,
						`Connecting you to reception…

Someone from the clinic will reply to you shortly.

Reply "menu" to go back to the main menu.`,
					);
					return res.sendStatus(200);
				}
			}

			// ------------------------------
			// Fallback: unknown input
			// ------------------------------
			await sendMessage(
				from,
				`I didn’t quite catch that.

${getMainMenu()}

(You can also reply "menu" at any time.)`,
			);
			return res.sendStatus(200);
		}
	}

	res.sendStatus(200);
});

// ------------------------------
// Root Route
// ------------------------------
app.get('/', (req, res) => {
	res.send('Bot is running');
});

// ------------------------------
app.listen(3000, () => console.log('Server running on port 3000'));
console.log('Redeploy');
