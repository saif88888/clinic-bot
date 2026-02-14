fetch('https://graph.facebook.com/v22.0/1049532644904270/messages', {
	method: 'POST',
	headers: {
		Authorization:
			'Bearer EAAM3k6XWICQBQifura2K6F6IfGwjw7oZA7NMWa0ZBLIAjeK6DzW6ZAqZASKcQzEmRuXIcZCgPkjdf367eZA9BAUu833K2sZBKHVcxIHvY0IKrgDusN3ONjE42hUM2p4E0Xsd7PCmjElzZBUO4CQrC3POGVha2VR283wB5TmwY04sDMedQv7MJfvzXZBBqxpEJV905AqBmOyaragkhQL2B0LLtVKG68bRoj14IGmpkzK6fdxZBaorZAUZAytKkkz9u0RHw0KQ2Vu70pOnilB5KGT6cl3R',
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		messaging_product: 'whatsapp',
		to: '447474409091',
		type: 'template',
		template: {
			name: 'hello_world',
			language: { code: 'en_US' },
		},
	}),
})
	.then((r) => r.text())
	.then(console.log)
	.catch(console.error);
