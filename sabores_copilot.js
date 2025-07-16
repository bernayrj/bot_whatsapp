require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const qrWeb = require('./qr-server');
const { type } = require('os');

const db = mysql.createPool({
    
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Validar conexión a la BD
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error al conectar a la base de datos:', err.message);
    } else {
        console.log('Conexión a la base de datos exitosa');
        connection.release();
    }
});

console.log('BIENVENIDO A CHATBOT DE WHATSAPP');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', qr => {
    qrWeb.setQR(qr);
    qrWeb.setStatus('Esperando escaneo...');
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    qrWeb.setStatus('Autenticado y listo');
    console.log('Client is ready');
    listenMessage();
});

client.on('authenticated', () => {
    qrWeb.setStatus('Autenticado correctamente');
    console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
    qrWeb.setStatus('Fallo de autenticación');
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    qrWeb.setStatus('Desconectado');
    console.log('Client was logged out', reason);
});

client.initialize();

const menuArepas = `
🫓 *Menú de Arepas*:
- MA1: Arepa mixta 2 sabores $3
- MA2: Arepa mixta 2 sabores con mariscos $3,5
- AG1: Agua 1$
- RF1: Refresco 1$
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
`🛵 *DELIVERY* 🛵
- ZD1: Lecherias $1.5
- ZD2: Barcelona $3
- ZD3: Puerto la cruz $4`;

const pedidos = {};
const seleccionSabores = {};
const pedidoTimeouts = {};

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
    'lecherías' :1.5,
    'barcelona': 3,
    'puerto la cruz': 4,
}

const catalogoSabores = [
    'pollo', 'carne mechada', 'pernil', 'asado negro', 'cicharron', 'chuleta', 'tocineta',
    'chorizo(guisado)', 'salchicha', 'queso amarillo', 'queso blanco', 'telita', 'de mano',
    'guayanes', 'riquesa', 'reina pepiada', 'tapara', 'diablito', 'cazon'
];
const catalogoSaboresMar = [
    'calamar guisado', 'pulpo', 'camaron al ajillo', 'cangrejo', 'pepitona'
];

//Manejo por codigos para facilitar iteraccion

// Códigos para productos Arepas
const productosArepasCod = {
    'MA1': { nombre: 'arepa mixta 2 sabores', precio: 3 },
    'MA2': { nombre: 'arepa mixta 2 sabores con mariscos', precio: 3.5 },
    'AG1': { nombre: 'agua', precio: 1 },
    'RF1': { nombre: 'refresco', precio: 1 }
};

// Códigos para sabores normales
const catalogoSaboresCod = {
    'SA1': 'pollo',
    'SA2': 'carne mechada',
    'SA3': 'pernil',
    'SA4': 'asado negro',
    'SA5': 'cicharron',
    'SA6': 'chuleta',
    'SA7': 'tocineta',
    'SA8': 'chorizo(guisado)',
    'SA9': 'salchicha',
    'SA10': 'queso amarillo',
    'SA11': 'queso blanco',
    'SA12': 'telita',
    'SA13': 'de mano',
    'SA14': 'guayanes',
    'SA15': 'riquesa',
    'SA16': 'reina pepiada',
    'SA17': 'tapara',
    'SA18': 'diablito',
    'SA19': 'cazon'
};

// Códigos para sabores mariscos
const catalogoSaboresMarCod = {
    'SM1': 'calamar guisado',
    'SM2': 'pulpo',
    'SM3': 'camaron al ajillo',
    'SM4': 'cangrejo',
    'SM5': 'pepitona'
};

// Códigos para zonas de delivery
const zonaDeliveryCod = {
    'ZD1': { nombre: 'lecherias', precio: 1.5 },
    'ZD2': { nombre: 'barcelona', precio: 3 },
    'ZD3': { nombre: 'puerto la cruz', precio: 4 }
};

const menuSabores = Object.entries(catalogoSaboresCod)
    .map(([cod, nombre]) => `- ${cod}: ${nombre}`)
    .join('\n');
const menuSaboresMar = Object.entries(catalogoSaboresMarCod)
    .map(([cod, nombre]) => `- ${cod}: ${nombre}`)
    .join('\n');


const listenMessage = () => {
    client.on('message', (msg) => {
        const { from, body } = msg;
        const texto = body.toLowerCase().trim();

        // === BLOQUE PARA RECIBIR Y GUARDAR IMAGEN DE PAGO MOVIL ===
        if (msg.hasMedia) {
            if (
                typeof ultimoPedido !== 'undefined' &&
                ultimoPedido[from] &&
                ultimoPedido[from].esperandoPagoMovil
            ) {
                msg.downloadMedia().then(media => {
                    if (media) {
                        const pagosDir = path.join(__dirname, 'pagos');
                        if (!fs.existsSync(pagosDir)) {
                            fs.mkdirSync(pagosDir);
                        }
                        const fecha = new Date().toISOString().replace(/[:.]/g, '-');
                        const filename = `pago_${from}_${fecha}.${media.mimetype.split('/')[1]}`;
                        const filePath = path.join(pagosDir, filename);
                        fs.writeFileSync(filePath, media.data, 'base64');
                        sendMessage(from, '¡Comprobante recibido! Pronto validaremos tu pago.');

                        // === GUARDAR ORDEN EN BD ===
                        const { resumen, total } = ultimoPedido[from];
                        const nombreCliente = msg._data?.notifyName || 'Desconocido';
                        db.query('CALL add_customer(?, ?)', [from, nombreCliente], (errCliente, resCliente) => {
                            if (errCliente) {
                                console.log('Error al guardar cliente:', errCliente);
                                return;
                            }
                            db.query('CALL add_order (?, ?, ?, ?, ?, ?)', [fecha, from, resumen, total, 'Pago Movil', filename], (err, results) => {
                                if (err) {
                                    console.log('Error en consulta:', err);
                                    sendMessage(from, 'Ha ocurrido un error, intenta de nuevo');
                                } else {
                                    console.log('Resultado de agregar orden:', results[0]);
                                    sendMessage(from, 'Perfecto, tu pago móvil ha sido registrado. En breve nuestro equipo se comunicará contigo para coordinar la entrega.');
                                    fetch(process.env.URL_ADMIN, {
                                    method: 'POST'
                                }).then ((results) => {
                                    console.log(results);

                                }).catch((err)=>{
                                    console.log(err);
                                })
                                }

                            });
                        });

                        delete ultimoPedido[from].esperandoPagoMovil;
                        delete ultimoPedido[from];
                    }
                });
                return;
            } else {
                sendMessage(from, 'No podemos entender tu orden, escribe _*DELIVERY*_ para comenzar');
                return;
            }
        }

        // --- Lógica de selección de sabores antes del switch ---
        if (seleccionSabores[from] && seleccionSabores[from].esperando) {
            // Permite ingresar códigos separados por coma
            const codigos = body.split(',').map(s => s.trim().toUpperCase());
            const tipo = seleccionSabores[from].tipo;
            const cantidad = seleccionSabores[from].cantidad;
            let validos = false;
            let sabores = [];

            if (tipo === 'mariscos') {
                validos = codigos.length === 2 &&
                    catalogoSaboresCod[codigos[0]] &&
                    catalogoSaboresMarCod[codigos[1]];
                if (validos) {
                    sabores = [catalogoSaboresCod[codigos[0]], catalogoSaboresMarCod[codigos[1]]];
                }
                if (!validos) {
                    sendMessage(from, `Debes indicar 1 código de cada menú, separados por coma.\nEjemplo: SA1, SM3\nSabores normales:\n${menuSabores}\nSabores mar:\n${menuSaboresMar}`);
                    return;
                }
            } else {
                validos = codigos.length === cantidad && codigos.every(c => catalogoSaboresCod[c]);
                if (validos) {
                    sabores = codigos.map(c => catalogoSaboresCod[c]);
                }
                if (!validos) {
                    sendMessage(from, `Debes indicar exactamente ${cantidad} códigos, separados por coma. Opciones:\n${menuSabores}`);
                    return;
                }
            }

            // Agrega los sabores al producto y al pedido
            const productoAgregado = seleccionSabores[from].producto;
            productoAgregado.sabores = sabores;
            pedidos[from] = pedidos[from] || [];
            pedidos[from].push(productoAgregado);
            delete seleccionSabores[from];
            iniciarTimeoutPedido(from);
            sendMessage(
                from,
                `Agregado: ${productoAgregado.cantidad} x ${productoAgregado.item} con sabores: ${sabores.join(', ')}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`
            );
            return;
        }

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
                sendMessage(from, menuDelivery + '\n\nEscribe el código de la zona de entrega de tu pedido. Ej: ZD1');
                break;
            case 'menu':
                sendMessage(from, '¿Qué te provoca hoy? \n\n🫓 *Arepas*  \n🍔 *Burger*\n\nEscribe _*AREPAS*_ o _*BURGER*_ para conocer nuestras opciones');
                break;
            case 'arepa':
            case 'arepas':
                pedidos[from] = pedidos[from] || [];
                sendMedia(from, 'arepazo.png', menuArepas + '\n\n*Responde con la cantidad y el código del producto que quieres (Ej: 2 MA1).*');
                break;
            case 'hamburguesas':
            case 'burger':
                pedidos[from] = pedidos[from] || [];
                sendMedia(from, 'smash.png', menuBurgers + '\n\n*Responde con la cantidad y el nombre exacto del producto que quieres (Ej: 2 smash burger).*' )
                break;
            case 'ver':
                if (pedidos[from] && pedidos[from].length > 0) {
                    let total = 0;
                    let resumen = '🧾 *Tu pedido:*\n';
                    pedidos[from].forEach(item => {
                        let saboresTxt = '';
                        if (item.sabores && Array.isArray(item.sabores) && item.sabores.length > 0) {
                            saboresTxt = ` [Sabores: ${item.sabores.join(', ')}]`;
                        }
                        resumen += `- ${item.cantidad} x ${item.item}${saboresTxt} $${item.precio} = $${item.subtotal}\n`;
                        total += item.subtotal;
                    });
                    resumen += `\n*Total: $${total}*`;
                    sendMessage(from, resumen);
                    //ajuste delay para garantizar mensaje pedido primero
                    setTimeout(()=> {
                        sendMessage(from, 'Escribe _*ORDENAR*_ para confimar tu pedido o _*BORRAR*_ para eliminarlo ');

                    }, 1000);
                    
                    if (!global.ultimoPedido) global.ultimoPedido = {};
                    global.ultimoPedido[from] = { fecha, resumen, total };
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
                    const yaTieneDelivery = pedidos[from].some(p => p.item && p.item.startsWith('Delivery'));
                    if (yaTieneDelivery) {
                        let total = 0;
                        let resumen = '🧾 *Tu pedido:*\n';
                        pedidos[from].forEach(item => {
                            let saboresTxt = '';
                            if (item.sabores && Array.isArray(item.sabores) && item.sabores.length > 0) {
                                saboresTxt = ` [Sabores: ${item.sabores.join(', ')}]`;
                            }
                            resumen += `- ${item.cantidad} x ${item.item}${saboresTxt} $${item.precio} = $${item.subtotal}\n`;
                            total += item.subtotal;
                        });
                        resumen += `\n*Total: $${total}*`;

                        const nombreCliente = msg._data?.notifyName || 'Desconocido';

                        const ordenesDir = path.join(__dirname, 'ordenes');
                        if (!fs.existsSync(ordenesDir)) {
                            fs.mkdirSync(ordenesDir);
                        }
                        const fecha = new Date().toISOString().replace(/[:.]/g, '-');
                        const archivo = path.join(ordenesDir, `pedido_${from}_${fecha}.txt`);
                        const contenidoArchivo = `Cliente: ${nombreCliente}\nNúmero: ${from}\nFecha: ${fecha}\n\n${resumen}`;
                        fs.writeFileSync(archivo, contenidoArchivo);

                        if (!global.ultimoPedido) global.ultimoPedido = {};
                        global.ultimoPedido[from] = { fecha, resumen, total };

                        sendMessage(from, resumen);
                        sendMessage(from, '¿Cómo deseas pagar?\n\n💵 Efectivo\n 📲Pago Movil\n\nResponde con _*EFECTIVO*_ o _*PAGO MOVIL*_');
                        delete pedidos[from];
                    } else {
                        sendMessage(from, 'No conocemos tu zona de entrega. Escribela para agregarla\n\n' + menuDelivery);
                    }
                } else {
                    sendMessage(from, 'Aún no has agregado productos. Escribe *MENU* para comenzar tu pedido.');
                }
                break;
            case 'pago movil':
                if (pedidoTimeouts[from]) {
                    clearTimeout(pedidoTimeouts[from]);
                    delete pedidoTimeouts[from];
                }
                if (typeof ultimoPedido !== 'undefined' && ultimoPedido[from]) {
                    sendMessage(
                        from,
                        '*Datos para Pago Móvil:*\n' +
                        'Teléfono: 0424-8179838\n' +
                        'RIF: J-506873745\n' +
                        'Banco: Banco de Venezuela (0102)\n' +
                        '*Envianos tu capture del pago movil*'
                    );
                    ultimoPedido[from].esperandoPagoMovil = true; // <-- AGREGA ESTA LÍNEA
                } else {
                    sendMessage(from, 'No existe ningun pedido, escribe _*DELIVERY*_ para comenzar.');
                }
                break;
            case 'efectivo':
                if (pedidoTimeouts[from]) {
                    clearTimeout(pedidoTimeouts[from]);
                    delete pedidoTimeouts[from];
                }
                if (typeof ultimoPedido !== 'undefined' && ultimoPedido[from]) {
                    const { fecha, resumen, total } = ultimoPedido[from];
                    // Obtener nombre del cliente
                    const nombreCliente = msg._data?.notifyName || 'Desconocido';
                    // Guardar cliente en BD antes de la orden
                    db.query('CALL add_customer(?, ?)', [from, nombreCliente], (errCliente, resCliente) => {
                        if (errCliente) {
                            console.log('Error al guardar cliente:', errCliente);
                            //sendMessage(from, 'Ha ocurrido un error al guardar el cliente, intenta de nuevo');
                            return;
                        }
                        console.log(resCliente[0]);
                        console.log(nombreCliente);
                        // Ahora guardar la orden
                        db.query('CALL add_order (?, ?, ?, ?, ?, ?)', [fecha, from, resumen, total, 'Pago Efectivo', 'no aplica'], (err, results) => {
                            if (err) {
                                console.log('Error en consulta:', err);
                                sendMessage(from, 'Ha ocurrido un error, intenta de nuevo');
                            } else {
                                console.log('Resultado de agregar orden:', results[0]);
                                const myjson = results[0];
                                console.log(myjson);
                                fetch(process.env.URL_ADMIN, {
                                    method: 'POST'
                                }).then ((results) => {
                                    console.log(results);

                                }).catch((err)=>{
                                    console.log(err);
                                })
                                sendMessage(from, 'Perfecto, puedes pagar en efectivo al momento de la entrega. En breve nuestro equipo se comunicara contigo para coordinar los detalles de entrega. ' + JSON.stringify(results[0]));
                            }
                        });
                    });
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

                // Normaliza espacios y aplica alias para variantes de nombres de arepas con sabores
                nombreProducto = nombreProducto.replace(/\s+/g, ' ').trim();
                const aliasArepas = {
                    'arepa mixta 2 sabores': 'arepa mixta 2 sabores',
                    'arepa 2 sabores': 'arepa mixta 2 sabores',
                    'arepa mixta 2 sabores con mariscos': 'arepa mixta 2 sabores con mariscos',
                    'arepa 2 sabores con mariscos': 'arepa mixta 2 sabores con mariscos'
                };
                if (aliasArepas[nombreProducto]) {
                    nombreProducto = aliasArepas[nombreProducto];
                }

                //console.log('DEBUG nombreProducto:', nombreProducto, productosArepas[nombreProducto]);

                // 1. PRIMERO: Arepas con sabores
                if (
                    productosArepas[nombreProducto] &&
                    (nombreProducto === 'arepa mixta 2 sabores' || nombreProducto === 'arepa mixta 2 sabores con mariscos')
                ) {
                    seleccionSabores[from] = {
                        producto: {
                            item: nombreProducto,
                            precio: productosArepas[nombreProducto],
                            cantidad,
                            subtotal: cantidad * productosArepas[nombreProducto]
                        },
                        esperando: true,
                        tipo: nombreProducto.includes('mariscos') ? 'mariscos' : 'normal',
                        cantidad: 2
                    };
                    if (nombreProducto.includes('mariscos')) {
                        sendMessage(from, `Indica 1 sabor de cada menú, separados por coma.\nSabores normales:\n${menuSabores}\nSabores mar:\n${menuSaboresMar}`);
                    } else {
                        sendMessage(from, `*Sabores:*\n${menuSabores}\n\n_*Responde con el nombre exacto de los sabores separados por coma. (Ej: pollo, tocineta)*_`);
                    }
                    return;
                }

                // --- Lógica para productos Arepas por código ---
                const matchCodigoArepa = productosArepasCod[nombreProducto.toUpperCase()];
                if (matchCodigoArepa) {
                    // Si requiere sabores
                    if (matchCodigoArepa.nombre.includes('2 sabores')) {
                        seleccionSabores[from] = {
                            producto: {
                                item: matchCodigoArepa.nombre,
                                precio: matchCodigoArepa.precio,
                                cantidad,
                                subtotal: cantidad * matchCodigoArepa.precio
                            },
                            esperando: true,
                            tipo: matchCodigoArepa.nombre.includes('mariscos') ? 'mariscos' : 'normal',
                            cantidad: 2
                        };
                        if (matchCodigoArepa.nombre.includes('mariscos')) {
                            sendMessage(from, `Indica 1 código de cada menú, separados por coma.\nSabores normales:\n${menuSabores}\nSabores mar:\n${menuSaboresMar}`);
                        } else {
                            sendMessage(from, `*Sabores:*\n${menuSabores}\n\n_*Responde con los códigos exactos de los sabores separados por coma. (Ej: SA1, SA4)*_`);
                        }
                        return;
                    } else {
                        // Arepa sin sabores
                        producto = {
                            item: matchCodigoArepa.nombre,
                            precio: matchCodigoArepa.precio,
                            cantidad,
                            subtotal: cantidad * matchCodigoArepa.precio
                        };
                        pedidos[from] = pedidos[from] || [];
                        pedidos[from].push(producto);
                        iniciarTimeoutPedido(from);
                        sendMessage(from, `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`);
                        return;
                    }
                }

                // 2. LUEGO: Arepas sin sabores
                if (productosArepas[nombreProducto]) {
                    producto = {
                        item: nombreProducto,
                        precio: productosArepas[nombreProducto],
                        cantidad,
                        subtotal: cantidad * productosArepas[nombreProducto]
                    };
                    pedidos[from] = pedidos[from] || [];
                    pedidos[from].push(producto);
                    iniciarTimeoutPedido(from);
                    sendMessage(from, ` Estoy entrando en la sin sabor Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`);
                    return;
                }

                // Hamburguesas
                if (productosBurgers[nombreProducto]) {
                    producto = {
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
                            `🛵 Gracias 👍🏽 por compartir tu zona de entrega.\n\nEscribe _*MENU*_ para comenzar tomar tu pedido o _*VER*_ para conocer tu pedido.`
                        );
                    }
                    return;
                }

                // --- Lógica para zona de delivery por código ---
                const matchCodigoDelivery = zonaDeliveryCod[nombreProducto.toUpperCase()];
                if (matchCodigoDelivery) {
                    pedidos[from] = pedidos[from] || [];
                    const yaTieneDelivery = pedidos[from].some(p => p.item && p.item.startsWith('Delivery'));
                    if (yaTieneDelivery) {
                        sendMessage(from, 'Ya has agregado una zona de delivery a tu pedido.\n\nEscribe _*MENU*_ para continuar con tu orden.');
                    } else {
                        const producto = {
                            item: 'Delivery ' + matchCodigoDelivery.nombre,
                            precio: matchCodigoDelivery.precio,
                            cantidad,
                            subtotal: cantidad * matchCodigoDelivery.precio
                        };
                        pedidos[from].push(producto);
                        sendMessage(
                            from,
                            `🛵 Gracias 👍🏽 por compartir tu zona de entrega.\n\nEscribe _*MENU*_ para comenzar tomar tu pedido o _*VER*_ para conocer tu pedido.`
                        );
                    }
                    return;
                }
                sendMessage(from, 'No podemos entender tu orden, escribe _*DELIVERY*_ para comenzar');
        }
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
    }, 3 * 60 * 1000);
};