const express = require('express');
const QRCode = require('qrcode');
const app = express();

let lastQR = null;

// Endpoint para mostrar el QR como imagen
app.get('/qr', (req, res) => {
    if (!lastQR) {
        return res.send('QR no disponible. Esperando generación...');
    }
    QRCode.toDataURL(lastQR, (err, url) => {
        if (err) return res.status(500).send('Error generando QR');
        res.send(`<h2>Escanea este QR con WhatsApp</h2><img src="${url}" />`);
    });
});

// Inicia el servidor web
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor QR escuchando en http://localhost:${PORT}/qr`);
});

// Exporta una función para actualizar el QR
module.exports = {
    setQR: (qr) => { lastQR = qr; }
};