const express = require('express');
const app = express();
const { makeWASocket, useMultiFileAuthState, delay, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

app.use(express.json());
app.use(express.static(__dirname)); // Serve HTML file

const PORT = process.env.PORT || 3000;

// Temp folder clean logic
setInterval(() => {
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

    num = num.replace(/[^0-9]/g, '');
    const id = 'session-' + Math.random().toString(36).substring(7);
    const sessionDir = `./temp/${id}`;

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // 🔥 YAHAN CHANGE KIYA HAI: Ubuntu/Chrome use karenge jo stable hai
            browser: Browsers.ubuntu("Chrome"),
        });

        if (!sock.authState.creds.me && !sock.authState.creds.registered) {
            await delay(1500);
            
            // Pairing Code logic with retry safety
            try {
                const code = await sock.requestPairingCode(num);
                if (!res.headersSent) {
                    res.json({ code: code?.match(/.{1,4}/g)?.join("-") });
                }
            } catch (e) {
                if (!res.headersSent) res.json({ error: "WhatsApp ne Request Block kardi. Thodi der baad try karein." });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                await delay(1000);
                // Send Creds to User
                const credsPath = path.join(sessionDir, 'creds.json');
                
                // Read file content
                const credsData = fs.readFileSync(credsPath);
                
                // Direct file send karne ki jagah JSON content bhejo (More reliable)
                await sock.sendMessage(sock.user.id, { 
                    text: "👑 *KING B2K SESSION*\n\nNiche diye gaye code ko copy karke 'creds.json' file banayein ya bot me directly paste karein (agar supported hai).\n\n" + JSON.stringify(JSON.parse(credsData))
                });

                // File bhi bhej do backup ke liye
                await sock.sendMessage(sock.user.id, { 
                    document: { url: credsPath }, 
                    mimetype: 'application/json', 
                    fileName: 'creds.json',
                    caption: '👑 *KING B2K SESSION FILE*'
                });
                
                await sock.end();
                fs.removeSync(sessionDir);
            }
        });

    } catch (err) {
        if (!res.headersSent) res.json({ error: "Server Error" });
        console.log(err);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
