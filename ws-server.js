// ws-server.js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3001 }); // you can change port

wss.on('connection', (ws) => {
  console.log('Dashboard connected via WebSocket');
});

// Utility to broadcast to all clients
function broadcastNewOrder() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'newOrder'}));
    }
  });
}

module.exports = { broadcastNewOrder };
