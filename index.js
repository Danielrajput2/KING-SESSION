const express = require('express');
const app = express();
const { makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

app.use(express.json());
app.use(express.static(__dirname)); // Serve HTML file

const PORT = process.env.PORT || 3000;

// Temporary storage cleanup
setInterval(() => {
    // Har 1 ghante me temp folders delete karega
    const tempDir = './temp';
    if (fs.existsSync(tempDir)) {
        fs.emptyDirSync(tempDir);
    }
}, 3600000);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair', async (req, res) => {
    let num = req.query.phone;
    if (!num) return res.json({ error: "Phone number is required" });

    // Clean number
    num = num.replace(/[^0-9]/g, '');
    
    // Create random ID for session
    const id = 'session-' + Math.random().toString(36).substring(7);
    const sessionDir = `./temp/${id}`;

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
        });

        if (!sock.authState.creds.me && !sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            if (!res.headersSent) {
                res.json({ code: code?.match(/.{1,4}/g)?.join("-") });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                await delay(1000);
                // Send Creds to User's WhatsApp
                const credsPath = path.join(sessionDir, 'creds.json');
                await sock.sendMessage(sock.user.id, { 
                    document: { url: credsPath }, 
                    mimetype: 'application/json', 
                    fileName: 'creds.json',
                    caption: '👑 *KING B2K SESSION FILE*\n\nDo not share this file with anyone!'
                });
                
                // Close and Delete
                await sock.end();
                fs.removeSync(sessionDir);
            }
        });

    } catch (err) {
        if (!res.headersSent) res.json({ error: "Something went wrong. Try again." });
        console.log(err);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});