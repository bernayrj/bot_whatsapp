const express = require('express');
const QRCode = require('qrcode');
const app = express();

let lastQR = null;
let lastStatus = 'Esperando generación de QR...';

// Endpoint para mostrar el QR y el estado
app.get('/qr', (req, res) => {
    let html = `<h2>Status: ${lastStatus}</h2>`;
    if (!lastQR) {
        html += '<p>QR no disponible. Esperando generación...</p>';
        return res.send(html);
    }
    QRCode.toDataURL(lastQR, (err, url) => {
        if (err) return res.status(500).send('Error generando QR');
        html += `
            <h2>Escanea este QR con WhatsApp</h2>
            <img id="qrimg" src="${url}" width="300" height="300" style="image-rendering: pixelated;" />
            <script>
                setInterval(function() {
                    fetch('/qr-img')
                        .then(r => r.blob())
                        .then(blob => {
                            document.getElementById('qrimg').src = URL.createObjectURL(blob);
                        });
                }, 2000);
                setInterval(function() {
                    fetch('/qr-status')
                        .then(r => r.text())
                        .then(status => {
                            document.getElementById('qr-status').innerText = status;
                        });
                }, 2000);
            </script>
            <div id="qr-status" style="margin-top:20px;font-size:18px;color:#333;">${lastStatus}</div>
        `;
        res.send(html);
    });
});

// Endpoint solo para la imagen QR
app.get('/qr-img', (req, res) => {
    if (!lastQR) {
        return res.status(404).send('QR no disponible');
    }
    QRCode.toDataURL(lastQR, (err, url) => {
        if (err) return res.status(500).send('Error generando QR');
        const base64Data = url.replace(/^data:image\/png;base64,/, "");
        const img = Buffer.from(base64Data, 'base64');
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': img.length
        });
        res.end(img);
    });
});

// Endpoint para el estado
app.get('/qr-status', (req, res) => {
    res.send(lastStatus);
});

// Inicia el servidor web
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor QR escuchando en http://localhost:${PORT}/qr`);
});

// Exporta funciones para actualizar el QR y el estado
module.exports = {
    setQR: (qr) => { lastQR = qr; lastStatus = 'Esperando escaneo...'; },
    setStatus: (status) => { lastStatus = status; }
};

app.use (express.static("pagos"));