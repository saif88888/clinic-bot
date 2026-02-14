const express = require('express');
const app = express();
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Your clinic ID from Supabase
const CLINIC_ID = '348cd187-1f0f-45aa-85e5-103ddd23e44d';

app.use(express.json());

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

async function notifyClinic(booking) {
	await resend.emails.send({
		from: 'Clinic Booking System <onboarding@resend.dev>',
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
			const messageId = message.id;

			console.log('User said:', text);

			// 1) Load state from DB
			let { data: state, error } = await supabase
				.from('message_state')
				.select('*')
				.eq('phone', from)
				.single();

			if (error && error.code !== 'PGRST116') {
				console.error('Error loading state:', error);
			}

			// 2) If no state exists → create it
			if (!state) {
				const { data: newState, error: insertError } =
					await supabase
						.from('message_state')
						.insert({
							phone: from,
							clinic_id: CLINIC_ID,
							step: 'idle',
							name: null,
							service: null,
							date: null,
							time: null,
							last_message_id: null,
						})
						.select()
						.single();

				if (insertError) {
					console.error('Error creating state:', insertError);
					return res.sendStatus(500);
				}

				state = newState;
			}

			// 3) Deduplicate WhatsApp retries using DB
			if (state.last_message_id === messageId) {
				console.log('Duplicate message ignored:', messageId);
				return res.sendStatus(200);
			}

			// Update last_message_id
			await supabase
				.from('message_state')
				.update({ last_message_id: messageId })
				.eq('id', state.id);

			// ------------------------------
			// If user types "menu" at any time → reset and show menu
			// ------------------------------
			if (text.toLowerCase() === 'menu') {
				await supabase
					.from('message_state')
					.update({
						step: 'idle',
						name: null,
						service: null,
						date: null,
						time: null,
					})
					.eq('id', state.id);

				await sendMessage(from, getMainMenu());
				return res.sendStatus(200);
			}

			// ------------------------------
			// Booking flow steps
			// ------------------------------
			if (state.step === 'ask_name') {
				const name = text;

				await supabase
					.from('message_state')
					.update({ step: 'ask_service', name })
					.eq('id', state.id);

				await sendMessage(
					from,
					`Thanks, ${name}. What treatment would you like to book?`,
				);
				return res.sendStatus(200);
			}

			if (state.step === 'ask_service') {
				const service = text;

				await supabase
					.from('message_state')
					.update({ step: 'ask_date', service })
					.eq('id', state.id);

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
				const date = text;

				await supabase
					.from('message_state')
					.update({ step: 'ask_time', date })
					.eq('id', state.id);

				await sendMessage(
					from,
					`And what time works best for you on ${date}?

For example:
- 10:00
- 3pm`,
				);
				return res.sendStatus(200);
			}

			if (state.step === 'ask_time') {
				const time = text;

				await supabase
					.from('message_state')
					.update({ step: 'confirm', time })
					.eq('id', state.id);

				// Reload state to get latest values
				const { data: updatedState } = await supabase
					.from('message_state')
					.select('*')
					.eq('id', state.id)
					.single();

				await sendMessage(
					from,
					`Perfect. Please confirm your booking:

Name: ${updatedState.name}
Treatment: ${updatedState.service}
Date: ${updatedState.date}
Time: ${updatedState.time}

Reply:
1️⃣ to confirm
2️⃣ to cancel`,
				);
				return res.sendStatus(200);
			}

			if (state.step === 'confirm') {
				if (text === '1') {
					// Reload state to be safe
					const { data: latestState } = await supabase
						.from('message_state')
						.select('*')
						.eq('id', state.id)
						.single();

					// Create / upsert customer
					const { data: customer, error: customerError } =
						await supabase
							.from('customers')
							.upsert(
								{ phone: from, name: latestState.name },
								{ onConflict: 'phone' },
							)
							.select()
							.single();

					if (customerError) {
						console.error(
							'Error upserting customer:',
							customerError,
						);
					}

					// Create booking
					const { error: bookingError } = await supabase
						.from('bookings')
						.insert({
							clinic_id: CLINIC_ID,
							customer_id: customer?.id || null,
							service: latestState.service,
							date: latestState.date,
							time: latestState.time,
							status: 'pending',
						});

					if (bookingError) {
						console.error(
							'Error creating booking:',
							bookingError,
						);
					}

					// Notify clinic
					await notifyClinic({
						from,
						name: latestState.name,
						service: latestState.service,
						date: latestState.date,
						time: latestState.time,
					});

					// Reset state
					await supabase
						.from('message_state')
						.update({
							step: 'idle',
							name: null,
							service: null,
							date: null,
							time: null,
						})
						.eq('id', state.id);

					await sendMessage(
						from,
						`✅ Your booking request has been sent to the clinic.

They will confirm your appointment shortly.

Reply "menu" to see options again.`,
					);
					return res.sendStatus(200);
				} else if (text === '2') {
					await supabase
						.from('message_state')
						.update({
							step: 'idle',
							name: null,
							service: null,
							date: null,
							time: null,
						})
						.eq('id', state.id);

					await sendMessage(
						from,
						`❌ Your booking has been cancelled.

If you’d like to start again, reply "menu".`,
					);
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
			// First contact / main menu
			// ------------------------------
			if (
				!text ||
				['hi', 'hello', 'hey'].includes(text.toLowerCase())
			) {
				await sendMessage(from, getMainMenu());
				return res.sendStatus(200);
			}

			if (state.step === 'idle') {
				if (text === '1') {
					await supabase
						.from('message_state')
						.update({ step: 'ask_name' })
						.eq('id', state.id);

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

app.listen(3000, () => console.log('Server running on port 3000'));
console.log('Redeploy');
