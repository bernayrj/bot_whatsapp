require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const qrWeb = require('./qr-server');

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

console.log('BIENVENIDO A CHATBOT DE WHATSAPP');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', qr => {
    qrWeb.setQR(qr); 
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready');
    listenMessage();
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
});

client.initialize();


const menuArepas = `
🫓 *Menú de Arepas*:
- Arepa mixta 2 sabores $3
- Arepa mixta 2 sabores con mariscos $3,5
- Agua 1$
- Refresco 1$
`;

const menuBurgers = `
🍔 
*HAMBURGUESAS SOLA*:
- Smash burger $3
- Doble Smash Burger $4,5
- Triple smash Burger $5,5
- Clasica $4,5
- Doble Clasica $5,5
- Triple Clasica $7
- Smash Rico $4
- Doble Smash Rico $5,5
- Triple Smash Rico $6
- Keto Burger $3,5

🍔🍟 
*HAMBURGUESAS CON PAPAS*:
- Smash burger C/P $4
- Doble Smash Burger C/P $5,5
- Triple smash Burger C/P $6,5
- Clasica C/P $5,5
- Doble Clasica C/P $6,5
- Triple Clasica C/P $8
- Smash Rico C/P $5
- Doble Smash Rico C/P $6,5
- Triple Smash Rico C/P $7
- Keto Burger C/P $4,5

🍔🍟🥤 
*HAMBURGUESAS EN COMBO*:
- Smash burger COMB $5,5
- Doble Smash Burger COMB $7
- Triple smash Burger COMB $8
- Clasica COMB $7
- Doble Clasica COMB $8
- Triple Clasica COMB $9,5
- Smash Rico COMB $6,5
- Doble Smash Rico COMB $8
- Triple Smash Rico COMB $8,5
- Keto Burger COMB $6

🍗 
*NUGGETS SOLO*
- Nuggets de 4 $1,5
- Nuggets de 6 $2
- Nuggets de 10 $4,5

🍗🍟
*NUGGETS CON PAPAS*
- Nuggets de 4 C/P $2,5
- Nuggets de 6 C/P $3
- Nuggets de 10 C/P $5,5

*NUGGETS EN COMBO*
- Nuggets de 4 COMB $4
- Nuggets de 6 COMB $4,5
- Nuggets de 10 COMB $7

🍟 *PAPAS*
- Papas clasicas $1
- Canoa familiar $2
- Canoa papas queso y tocineta $3,5

🥤*BEBIDAS*
- Refresco de lata $1,5
- Lipton 500ml $2
- Agua 355ml $1
- Refesco 1LT $2
- Refresco 1 1/2 LT $2,5
- Refresco 2 LT $3
`;

const menuDelivery =
`🛵*PRECIO DELIVERY*
    - Lecherias $1.5,
    - Barcelona $3,
    - Puerto la cruz $4`


// Agrega este objeto al inicio del archivo para almacenar los pedidos temporales
const pedidos = {};

// Agrega este objeto para manejar los timeouts
//const pedidoTimeouts = {};

// Productos y precios
const productosArepas = {
    'arepa mixta 2 sabores': 3,
    'arepa mixta 2 sabores con mariscos': 3.5,
    'agua': 1,
    'refresco': 1
};


const productosBurgers = {
'smash burger' :3,
'doble smash burger' :4.5,
'triple smash burger' :5.5,
'clasica' :4.5,
'doble clasica':5.5,
'triple clasica' :7,
'smash rico' :4,
'doble smash rico' :5.5,
'triple smash rico' :6,
'keto burger' :3.5,
'smash burger c/p' :4,
'doble smash burger c/p' :5.5,
'triple smash burger c/p' :6.5,
'clasica c/p' :5.5,
'doble clasica c/p' :6.5,
'triple clasica c/p' :8,
'smash rico c/p' :5,
'doble smash rico c/p' :6.5,
'triple smash rico c/p' :7,
'keto burger c/p' :4.5,
'smash burger comb' :5.5,
'doble smash burger comb' :7,
'triple smash burger comb' :8,
'clasica comb' :7,
'doble clasica comb' :8,
'triple clasica comb' :9.5,
'smash rico comb' :6.5,
'doble smash rico comb' :8,
'triple smash rico comb' :8.5,
'keto burger comb' :6,
'Nuggets de 4' :1.5,
'Nuggets de 6' :2,
'Nuggets de 10' :4.5,
'Nuggets de 4 c/p' :2.5,
'Nuggets de 6 c/p' :3,
'Nuggets de 10 c/p' :5.5,
'Nuggets de 4 comb' :4,
'Nuggets de 6 comb' :4.5,
'Nuggets de 10 comb' :7,
'papas clasicas' :1,
'canoa familiar' :2,
'canoa papas queso y tocineta' :3.5,
'refresco de lata' :1.5,
'lipton 500ml' :2,
'agua 355ml' :1,
'refesco 1lt' :2,
'refresco 1 1/2 lt' :2.5,
'refresco 2 lt' :3,
};

const zonaDelivery ={
    'lecherias': 1.5,
    'barcelona': 3,
    'puerto la cruz': 4,
}


// Agrega este objeto para manejar los timeouts
const pedidoTimeouts = {};

const listenMessage = () => {
    client.on('message', (msg) => {
        const { from, body } = msg;
        const texto = body.toLowerCase().trim();

const saludos = ['hola', 'buenas', 'buenas tardes', 'buenos dias', 'hey', 'hi', 'hello'];
        if (saludos.includes(texto)) {
            sendMedia(
                from, 'logo1.jpg',
                '🤗 *HOLA BIENVENIDO* 🤗\n\n *EL AREPAZO*🫓 y *SMASH RICO*🍔\n\nEscribe _*DELIVERY*_ para conocer tu zona de entrega.'
            );
            return;
        }

        switch (texto) {
            case 'delivery':
                pedidos[from] = pedidos[from] || [];
                sendMessage(from, menuDelivery + '\n\nEscribe el nombre exacto de la zona de entrega de tu pedido. Ej: Lecherias');
                break;
            case 'menu':
                sendMessage(from, '¿Qué te provoca hoy? \n\n🫓 *Arepas*  \n🍔 *Burger*\n\nEscribe _*AREPAS*_ o _*BURGER*_ para conocer nuestras opciones');
                break;
            case 'arepa':
            case 'arepas':
                pedidos[from] = pedidos[from] || [];
                sendMedia(from, 'arepazo.png', menuArepas + '\n\n*Responde con la cantidad y el nombre exacto del producto que quieres  (Ej: 2 arepa de queso).*');
                break;
            case 'hamburguesas':
            case 'burger':
                pedidos[from] = pedidos[from] || [];
                sendMedia(from, 'smash.png', menuBurgers + '\n\n*Responde con la cantidad y el nombre exacto del producto que quieres (Ej: 2 smash burger).*' )
                //sendMessage(from, menuBurgers + '\n\nResponde con la cantidad y el nombre exacto de la hamburguesa que quieres (ej: 2 burger clásica).');
                break;
            case 'ver':
                if (pedidos[from] && pedidos[from].length > 0) {
                    let total = 0;
                    let resumen = '🧾 *Tu pedido:*\n';
                    pedidos[from].forEach(item => {
    
                        resumen += `- ${item.cantidad} x ${item.item} $${item.precio} = $${item.subtotal}\n`;
                        total += item.subtotal;
                    });
                    resumen += `\n*Total: $${total}*`;
                    sendMessage(from, resumen);
                    sendMessage(from, 'Escribe _*ORDENAR*_ para confimar tu pedido o _*BORRAR*_ para eliminarlo ');

                    // Antes de sendMessage(from, resumen); en el case 'ver', guarda los datos:
                    if (!global.ultimoPedido) global.ultimoPedido = {};
                    global.ultimoPedido[from] = { fecha, resumen, total };

                    // Limpia el pedido después de mostrarlo
                    //delete pedidos[from];
                } else {
                    sendMessage(from, 'Aún no has agregado productos. Escribe *MENU* para comenzar tu pedido.');
                }
                break;
            case 'borrar':
                if (pedidoTimeouts[from]) {
                clearTimeout(pedidoTimeouts[from]);
                delete pedidoTimeouts[from];
                }
                delete pedidos[from];
                sendMessage(from, 'Tu pedido ha sido eliminado. Escribe _*MENU*_ si deseas comenzar un nuevo pedido');
                break;
            case 'ordenar':
                if (pedidos[from] && pedidos[from].length > 0) {
                    let total = 0;
                    let resumen = '🧾 *Tu pedido:*\n';
                    pedidos[from].forEach(item => {
                        resumen += `- ${item.cantidad} x ${item.item} $${item.precio} = $${item.subtotal}\n`;
                        total += item.subtotal;
                    });
                    resumen += `\n*Total: $${total}*`;

                    // Obtener nombre del cliente si está disponible
                    const nombreCliente = msg._data?.notifyName || 'Desconocido';

                    // --- GUARDAR PEDIDO EN ARCHIVO ---
                    const ordenesDir = path.join(__dirname, 'ordenes');
                    if (!fs.existsSync(ordenesDir)) {
                        fs.mkdirSync(ordenesDir);
                    }
                    const fecha = new Date().toISOString().replace(/[:.]/g, '-');
                    const archivo = path.join(ordenesDir, `pedido_${from}_${fecha}.txt`);
                    const contenidoArchivo = `Cliente: ${nombreCliente}\nNúmero: ${from}\nFecha: ${fecha}\n\n${resumen}`;
                    fs.writeFileSync(archivo, contenidoArchivo);

                    // Antes de sendMessage(from, resumen); en el case 'ver', guarda los datos:
                    if (!global.ultimoPedido) global.ultimoPedido = {};
                    global.ultimoPedido[from] = { fecha, resumen, total };

                    sendMessage(from, resumen);
                    sendMessage(from, '¿Cómo deseas pagar?\n\n💵 Efectivo\n 📲Pago Movil\n\nResponde con _*EFECTIVO*_ o _*PAGO MOVIL*_');
                    // Limpia el pedido después de mostrarlo
                    delete pedidos[from];
                } else {
                    sendMessage(from, 'Aún no has agregado productos. Escribe *MENU* para comenzar tu pedido.');
                }
                break;

            case 'pago movil':
                if (pedidoTimeouts[from]) {
                    clearTimeout(pedidoTimeouts[from]);
                    delete pedidoTimeouts[from];
                }
                sendMessage(
                    from,
                    '*Datos para Pago Móvil:*\n' +
                    'Teléfono: 04149071774\n' +
                    'RIF: J-2000000-0\n' +
                    'Banco: Banesco\n' +
                    '*Envia tu numero de referencia de pago*'
                );
                break;

            case 'efectivo':
                if (pedidoTimeouts[from]) {
                    clearTimeout(pedidoTimeouts[from]);
                    delete pedidoTimeouts[from];
                }
                //sendMessage(from, 'Perfecto, puedes pagar en efectivo al momento de la entrega.');

                // Usa la fecha, resumen y total del último pedido (debes guardarlos en algún lado)
                // Por ejemplo, puedes guardar el último resumen y total en un objeto auxiliar:
                if (typeof ultimoPedido !== 'undefined' && ultimoPedido[from]) {
                    const { fecha, resumen, total } = ultimoPedido[from];
                    db.query('CALL add_order (?, ?, ?, ?, ?)', [fecha, from, resumen, total,'Pago Efectivo'], (err, results) => {
                        if (err) {
                            console.log('Error en consulta:', err);
                            sendMessage(from, 'Ha ocurrido un error, intenta de nuevo');
                        } else {
                            console.log('Resultado de agregar orden:', results[0]);
                            const myjson = results[0];
                            console.log (myjson)
                            sendMessage(from, 'Perfecto, puedes pagar en efectivo al momento de la entrega. ' + JSON.stringify(results[0]));

                        }
                    });
                    // Limpia el registro temporal si quieres
                    delete ultimoPedido[from];
                } else {
                    console.log('No hay datos de pedido para guardar.');
                }
                break;
            default:
                const match = texto.match(/^(\d+)\s+(.+)$/);
                let cantidad = 1;
                let producto = null;
                let nombreProducto = texto.trim().toLowerCase();
                if (match) {
                    cantidad = parseInt(match[1]);
                    nombreProducto = match[2].trim().toLowerCase();
                }

                if (productosArepas[nombreProducto]) {
                         producto = {
                            item: nombreProducto,
                            precio: productosArepas[nombreProducto],
                            cantidad,
                            subtotal: cantidad * productosArepas[nombreProducto]
                        };
                        console.log(producto);
                        pedidos[from] = pedidos[from] || [];
                        pedidos[from].push(producto);
                        iniciarTimeoutPedido(from);
                        sendMessage(from, `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`);
                        return;
                    }

                // Hamburguesas
                if (productosBurgers[nombreProducto]) {
                    const producto = {
                        item: nombreProducto,
                        precio: productosBurgers[nombreProducto],
                        cantidad,
                        subtotal: cantidad * productosBurgers[nombreProducto]
                    };
                    pedidos[from] = pedidos[from] || [];
                    pedidos[from].push(producto);
                    iniciarTimeoutPedido(from);
                    sendMessage(from, `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`);
                    return;
                }

                // Delivery
                if (zonaDelivery[nombreProducto]) {
                    pedidos[from] = pedidos[from] || [];
                    const yaTieneDelivery = pedidos[from].some(p => p.item && p.item.startsWith('Delivery'));
                    if (yaTieneDelivery) {
                        sendMessage(from, 'Ya has agregado una zona de delivery a tu pedido.\n\nEscribe _*MENU*_ para continuar con tu orden.');
                    } else {
                        const producto = {
                            item: 'Delivery ' + nombreProducto,
                            precio: zonaDelivery[nombreProducto],
                            cantidad,
                            subtotal: cantidad * zonaDelivery[nombreProducto]
                        };
                        pedidos[from].push(producto);
                        sendMessage(
                            from,
                            `🛵 Gracias 👍🏽 por compartir tu zona de entrega.\n\nEscribe _*MENU*_ para continuar con tu orden.`
                        );
                    }
                    return;
                }
        }
        console.log(from, body, pedidos[from]);
    });
};

const sendMessage = (to, message) => {
    console.log(message);
    client.sendMessage(to, message);
};

const sendMedia = (to, file, caption = '') => {
    const mediaFile = MessageMedia.fromFilePath(`./mediaSend/${file}`);
    client.sendMessage(to, mediaFile, { caption });
};

const iniciarTimeoutPedido = (from) => {
    clearTimeout(pedidoTimeouts[from]);
    delete pedidoTimeouts[from];
    pedidoTimeouts[from] = setTimeout (()=>{
        pedidos[from] = []
        sendMessage(from, '⏰ Su pedido ha sido eliminado por inactividad. Escriba _*DELIVERY*_ para volver a comenzar.')
    }, 60 * 1000);
}