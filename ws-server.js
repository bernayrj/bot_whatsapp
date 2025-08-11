// ws-server.js
const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const app = express();

function setupWebSocket(server) {
  // Create a WebSocket server instance linked to the HTTPS Server
  const wss = new WebSocket.Server({ server, path: "/socket" }); // you can change port

  wss.on("connection", (ws) => {
    console.log("Dashboard connected via WebSocket");
  });
};

wss.on("headers", (headers, req) => {
	headers.push("Access-Control-Allow-Origin: *");
} );

// Utility to broadcast to all clients
function broadcastNewOrder() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "newOrder" }));
      console.log("order sent from ws!");
    }
  });
}

module.exports = { broadcastNewOrder, setupWebSocket };
