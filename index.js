const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
	res.send('Bot is running');
});

app.post('/webhook', (req, res) => {
	console.log('Incoming:', req.body);
	res.sendStatus(200);
});

app.listen(3000, () => console.log('Server running on port 3000'));
