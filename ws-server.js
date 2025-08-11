// ws-server.js
const WebSocket = require("ws");

const PORT = 3001;
const wss = new WebSocket.Server({ port: PORT });

console.log(`✅ WebSocket server running on ws://localhost:${PORT}`);

// --- Keep track of connections and heartbeats ---
function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');

  // Mark as alive
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  // Handle incoming messages from the client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Received from client:', data);

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }

      // Example: server reacts to a client request
      if (data.type === 'getStatus') {
        ws.send(JSON.stringify({ type: 'status', status: 'ok' }));
      }
    } catch (err) {
      console.error('Invalid message from client:', err);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
});

wss.on("headers", (headers, req) => {
	headers.push("Access-Control-Allow-Origin: *");
} );

// --- Broadcast function ---
function broadcastNewOrder() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "newOrder" }));
      console.log("order sent from ws!");
    }
  });
}

// --- Heartbeat ping every 30 seconds ---
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('Terminating dead connection');
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping(); // Client should respond with 'pong'
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

module.exports = { broadcastNewOrder };
