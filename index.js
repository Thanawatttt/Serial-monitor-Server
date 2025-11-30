const express = require('express');
const line = require('@line/bot-sdk');
const path = require('path');
const fs = require('fs');

const USER_FILE = path.join(__dirname, 'user_ids.json');

// Load or initialize user ID set
let userIDs = new Set();
if (fs.existsSync(USER_FILE)) {
  try {
    const data = fs.readFileSync(USER_FILE, 'utf8');
    userIDs = new Set(JSON.parse(data));
    console.log(`Loaded ${userIDs.size} users.`);
  } catch (e) {
    console.warn('Failed to load user IDs, starting fresh.');
  }
}

function saveUsers() {
  fs.writeFileSync(USER_FILE, JSON.stringify([...userIDs], null, 2));
}

const config = {
  channelAccessToken: 'K5VaIhobDO40OoP4BGXGAE6n/j+M69VuvLufJiO5HPqhU1CV36XLnRGdeRhOCUjxBvTMTDLy2RAFpcwOOI2TPky+dKjRc/0SFGpHSGnFOLNqNEVohlxH8PyLLHxHKUjLCzK0iN3+lFfdZK4UvNM2KAdB04t89/1O/w1cDnyilFU=',
  channelSecret: '1083c92b67632d33818a14c6a5eeeb3c',
};

const app = express();
const client = new line.Client(config);

// ❌ DO NOT use app.use(express.json()) — it breaks webhook signature validation!

// Basic home route
app.get('/', (_, res) => res.send('LINE bot is running. Add me on LINE and send a message to subscribe!'));

// Webhook: capture user IDs and reply
app.post('/webhook', line.middleware(config), async (req, res) => {
  // Always acknowledge quickly
  res.status(200).end();

  const events = req.body.events;
  if (!events || !Array.isArray(events)) return;

  for (const event of events) {
    // Save user ID if present
    if (event.source?.userId) {
      const userId = event.source.userId;
      if (!userIDs.has(userId)) {
        userIDs.add(userId);
        saveUsers();
        console.log(`New user added: ${userId} (total: ${userIDs.size})`);
      }
    }

    // Optional auto-reply
    if (event.type === 'message' && event.message.type === 'text') {
      try {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '✅ You’re now subscribed! I’ll receive broadcast messages.',
        });
      } catch (err) {
        console.error('Auto-reply failed:', err.message);
      }
    }
  }
});

// 📢 Broadcast endpoint: /sendmessage?text=Your+message+here
app.get('/sendmessage', async (req, res) => {
  const { text } = req.query;

  if (!text) {
    return res.status(400).send('❌ Missing ?text=... parameter');
  }

  const messageText = String(text);
  const users = [...userIDs];

  if (users.length === 0) {
    return res.status(400).send('📭 No users have messaged the bot yet.');
  }

  console.log(`📢 Broadcasting to ${users.length} user(s): "${messageText}"`);

  try {
    // LINE allows max 150 users per multicast
    const chunkSize = 150;
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize);
      await client.multicast(chunk, { type: 'text', text: messageText });
    }
    res.send(`✅ Sent to ${users.length} user(s): "${messageText}"`);
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).send(`❌ Broadcast failed: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 User IDs saved in: ${USER_FILE}`);
  console.log(`📤 Test broadcast: curl "http://localhost:${PORT}/sendmessage?text=Hello!"`);
});
