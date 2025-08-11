require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const qrWeb = require('./qr-server');
const { broadcastNewOrder } = require('./ws-server');
const cron = require('node-cron');

// Conexión a BD MySQL
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

console.log('INICIANDO CHATBOT LOS PRIMOS...');

// Catálogos de sabores por código
let catalogoSaboresCod = {};
let catalogoSaboresMarCod = {};
let menuSabores = '';
let menuSaboresMar = '';

// Actualizar tasa de cambio

let tasaActual = null;

// Función para consultar la tasa y almacenarla
function actualizarTasa() {
    db.query('CALL get_tasa()', (err, results) => {
        if (err) {
            console.error('Error al obtener tasa:', err);
            return;
        }
        // Ajusta según cómo retorna tu SP
        tasaActual = results[0][0]?.tasa || null;
        console.log('Obteniendo tasa dolar:', tasaActual);
    });
}

// Ejecutar una vez al iniciar el bot
actualizarTasa();

// Programar para que se ejecute todos los días a las 12:00 am
cron.schedule('20 0 * * *', () => {
    actualizarTasa();
});

// Traer los sabores disponibles de BD para las arepas
function cargarSaboresDesdeBD() {
    db.query('CALL get_sabores()', (err, results) => {
        if (err) {
            console.error('Error al obtener sabores:', err);
            return;
        }
        catalogoSaboresCod = {};
        catalogoSaboresMarCod = {};

        results[0].forEach(row => {
            if (row.categoria === 'normal') {
                catalogoSaboresCod[row.codigo] = row.sabor;
            } else if (row.categoria === 'mar') {
                catalogoSaboresMarCod[row.codigo] = row.sabor;
            }
        });

        menuSabores = Object.entries(catalogoSaboresCod)
            .map(([cod, sabor]) => `- *${cod}*: ${sabor}`)
            .join('\n');
        menuSaboresMar = Object.entries(catalogoSaboresMarCod)
            .map(([cod, sabor]) => `- *${cod}*: ${sabor}`)
            .join('\n');
        console.log('Actualizando sabores (rellenos), desde BD...');
    });
}

cargarSaboresDesdeBD();

let client;

// Helper: Delete a folder recursively
function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(folderPath);
    }
};

// Helper: Set up client event listeners
function setupClientEvents(client) {
    client.on('qr', qr => {
        qrWeb.setQR(qr);
        qrWeb.setStatus('Esperando escaneo...');
        console.log('QR RECEIVED');
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

    client.on('auth_failure', async (msg) => {
        qrWeb.setStatus('Fallo de autenticación');
        console.error('AUTHENTICATION FAILURE', msg);
        await resetSession();
    });

    client.on('disconnected', async (reason) => {
        qrWeb.setStatus('Desconectado');
        console.log('Client was logged out', reason);
        await resetSession();
    });
}

// Helper: Full session reset logic
async function resetSession() {
    try {
        if (client) {
            await client.destroy();
            console.log('Client destroyed');
        }

        // Small delay to let file handles close
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Delete session files
        const sessionPath = path.join(__dirname, '.wwebjs_auth', 'default'); // 'default' is the default clientId
        deleteFolderRecursive(sessionPath);
        console.log('Session files deleted');

        // Create and reinitialize client
        client = new Client({
            authStrategy: new LocalAuth({ clientId: 'default' })
        });

        setupClientEvents(client);
        await client.initialize();
        console.log('Client re-initialized');
    } catch (err) {
        console.error('Failed to reset session:', err);
    }
}

// Initial startup
client = new Client({
    authStrategy: new LocalAuth({ clientId: 'default' })
});

setupClientEvents(client);
client.initialize();

const pedidos = {};
const seleccionSabores = {};
const pedidoTimeouts = {};

// Catálogos SOLO por código

const menuDelivery =
`🛵 *DELIVERY* 🛵
- ZD1: Lechería $1.5
- ZD2: Barcelona $3
- ZD3: Puerto la cruz $4`;

const hamburguesasCod = {
    'HB1': { nombre: 'Smash burger', descripcion: 'Pan de batata, carne smash, queso, ketchup y mayonesa', precios: { S: 3, P: 4, C: 5 } },
    'HB2': { nombre: 'Doble Smash Burger', descripcion: 'Doble carne', precios: { S: 4.5, P: 5.5, C: 7 } },
    'HB3': { nombre: 'Triple Smash Burger', descripcion: 'Triple carne', precios: { S: 5.5, P: 6.5, C: 8 } },
    'HB4': { nombre: 'Clásica', descripcion: 'Pan de batata, carne smash, tocineta, queso, ketchup y mayonesa', precios: { S: 4.5, P: 5.5, C: 7 } },
    'HB5': { nombre: 'Doble Clásica', descripcion: 'Doble carne', precios: { S: 5.5, P: 6.5, C: 8 } },
    'HB6': { nombre: 'Triple Clásica', descripcion: 'Triple carne', precios: { S: 7, P: 8, C: 9.5 } },
    'HB7': { nombre: 'Smash Rico', descripcion: 'Pan de batata, carne smash con mermelada de tocineta, queso, salsa relish', precios: { S: 4, P: 5, C: 6.5 } },
    'HB8': { nombre: 'Doble Smash Rico', descripcion: 'Doble carne', precios: { S: 5.5, P: 6.5, C: 8 } },
    'HB9': { nombre: 'Triple Smash Rico',descripcion: 'Triple carne', precios: { S: 6, P: 7, C: 8.5 } },
    'HB10': { nombre: 'Keto Burger', descripcion: 'Lechuga, carne, tocienta, ketchup y mayonesa', precios: { S: 3.5, P: 4.5, C: 6 } },    
};

const nuggetsCod = {
    'NG1': { nombre: 'Nuggets de 4 piezas', precios: { S: 1.5, P: 2.4, C: 4 } },
    'NG2': { nombre: 'Nuggets de 6 piezas', precios: { S: 1.5, P: 2.4, C: 4 } },
    'NG3': { nombre: 'Nuggets de 10 piezas', precios: { S: 1.5, P: 2.4, C: 4 } }
};

const papasCod = {
    'PA1': { nombre: 'Papas clásicas', precio: 1 },
    'PA2': { nombre: 'Canoa familiar', precio: 2 },
    'PA3': { nombre: 'Canoa papas queso y tocineta', precio: 3.5 }
};

const bebidasCod = {
    'BE1': { nombre: 'Refresco de lata', precio: 1.5 },
    'BE2': { nombre: 'Lipton 500ml', precio: 2 },
    'BE3': { nombre: 'Agua 355ml', precio: 1 },
    'BE4': { nombre: 'Refresco 1LT', precio: 2 },
    'BE5': { nombre: 'Refresco 1 1/2 LT', precio: 2.5 },
    'BE6': { nombre: 'Refresco 2 LT', precio: 3 }
};

const variantesBurger = {
    'S': 'Sola',
    'P': 'Con papas',
    'C': 'En combo'
};

// Códigos para productos Arepas
const arepasCod = {
    'MA1': { nombre: 'Arepa mixta 2 sabores', precio: 3 },
    'MA2': { nombre: 'Arepa mixta 2 sabores con mariscos', precio: 3.5 }
};

// Códigos para zonas de delivery
const zonaDeliveryCod = {
    'ZD1': { nombre: 'Lechería', precio: 1.5 },
    'ZD2': { nombre: 'Barcelona', precio: 3 },
    'ZD3': { nombre: 'Puerto la Cruz', precio: 4 }
};

function getMenuSmashCod() {
    let menu = '\n\n🍔 *Hamburguesas*\n';
    Object.entries(hamburguesasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*:`;
        menu += ` *${data.nombre}*:\n`;
        menu += ` _${data.descripcion}_\n\n`;
    });
    menu += '🍗 *Nuggets de pollo*\n'
    Object.entries(nuggetsCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}\n`;
    });
    menu += '\n🍟 *Papas fritas*\n'
    Object.entries(papasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}  $${data.precio}\n`;
    });
    menu += '\n🥤 *Bebidas*\n'
    Object.entries(bebidasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}  $${data.precio}\n`;
    });
    menu += '\n_*Responde con la cantidad y el código del producto que quieres (Ejemplo: 2 HB1 - para smash burger)*_';
    return menu;
}

function getMenuArepazoCod() {
    let menu = '\n\n🫓 *Arepas*\n';
    Object.entries(arepasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}  $${data.precio}\n`;
    });
    menu += '\n\n🥤 *Bebidas*\n'
    Object.entries(bebidasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}  $${data.precio}\n`;
    });
    return menu;
}


// --- Lógica de pedidos  por códigos ---
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
                            let ordenNum = null;
                            db.query('CALL add_order (?, ?, ?, ?, ?, ?)', [fecha, from, resumen, total, 'Pago Movil', filename], (err, results) => {
                                if (err) {
                                    console.log('Error en consulta:', err);
                                    sendMessage(from, 'Ha ocurrido un error, intenta de nuevo');
                                } else {
                                    ordenNum = results[0][0]?.orden || null;
                                    sendMessage(from, 'Perfecto, tu pago móvil ha sido registrado para su validacion. En breve nuestro equipo se comunicará contigo para coordinar la entrega.\n\n'+ nombreCliente + ', tu orden es: '+ ordenNum);
                                    broadcastNewOrder();
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

        // --- Lógica de selección de sabores por código ---
        if (seleccionSabores[from] && seleccionSabores[from].esperando) {
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
                '*Hola Bienvenido a:*\n\n *EL Arepazo*🫓 y\n *Smash Rico*🍔\n\nEscribe _*DELIVERY*_ para conocer tu zona de entrega.'
            );
            return;
        }

        switch (texto) {
            case 'delivery':
                pedidos[from] = pedidos[from] || [];
                sendMessage(from, menuDelivery + '\n\nEscribe el código de la zona de entrega de tu pedido. Ejempo: ZD1- para Lechería');
                break;
            case 'menu':
                sendMessage(from, '¿Qué te provoca hoy? \n\n🫓 *Arepas*  \n🍔 *Burger*\n\nEscribe _*AREPAS*_ o _*BURGER*_ para conocer nuestro menú');
                break;
            case 'arepa':
            case 'arepas':
                pedidos[from] = pedidos[from] || [];
                sendMedia(from, 
                'arepazo.png', 
                getMenuArepazoCod() + 
                '\n\n_*Responde con la cantidad y el código del producto que quieres (Ejemplo: 2 MA1 - para arepa mixta 2 sabores).*_');
                cargarSaboresDesdeBD();
                break;
            case 'hamburguesas':
            case 'burger':
                pedidos[from] = pedidos[from] || [];
                sendMedia(
                    from,
                    'smash.png',
                    getMenuSmashCod() + 
                    '\n\nLuego de elegir la hamburguesa o nuggets, te preguntaremos como lo quieres: solo (S), con papas (P) o en combo (C).'
                );
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
                    resumen += `\n*Total: Bs. ${(total*tasaActual).toFixed(2)}*`;
                    sendMessage(from, resumen);
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
                        resumen += `\n*Total: Bs. ${(total*tasaActual).toFixed(2)}*`;

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
                    ultimoPedido[from].esperandoPagoMovil = true;
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
                    const nombreCliente = msg._data?.notifyName || 'Desconocido';
                    db.query('CALL add_customer(?, ?)', [from, nombreCliente], (errCliente, resCliente) => {
                        if (errCliente) {
                            console.log('Error al guardar cliente:', errCliente);
                            return;
                        }
                        let ordenNum = null;
                        db.query('CALL add_order (?, ?, ?, ?, ?, ?)', [fecha, from, resumen, total, 'Pago Efectivo', 'no aplica'], (err, results) => {
                            if (err) {
                                console.log('Error en consulta:', err);
                                sendMessage(from, 'Ha ocurrido un error, intenta de nuevo');
                            } else {
                                ordenNum = results[0][0]?.orden || null;
                                broadcastNewOrder();
                                sendMessage(from, 'Perfecto, puedes pagar en efectivo al momento de la entrega. En breve nuestro equipo se comunicara contigo para coordinar los detalles de entrega.\n\n'+'Tu orden es: ' + ordenNum);
                            }
                        });
                    });
                    delete ultimoPedido[from];
                } else {
                    console.log('No hay datos de pedido para guardar.');
                }
                break;
            default:
                // --- SOLO lógica por CÓDIGOS ---

                // Separar texto por comas
                const productos = texto.split(",").map((p) => {     // Separar texto por comas y ejecutar una función a cada elemento resultante del array devolviendo un nuevo array 
                    const cantidadXProducto = p.trim().split(" "); // Separar elementos por espacio (en este caso, número y texto)
                    if(cantidadXProducto.length == 2 && cantidadXProducto[0] < 100){ // Validar que haya 2 elementos y el 1ero sea un número menor a 100
                        // Devolver un objeto con la cantidad y el producto
                        return{
                            cantidad: cantidadXProducto[0],
                            producto: cantidadXProducto[1]
                        }
                    } else {
                        // Devolver un objeto con la cantidad por defecto en 1 y el producto
                        return {
                            cantidad: 1,
                            producto: cantidadXProducto[0]
                        }
                    }
                }); 

                productos.forEach(p => {
                    const matchCodigoArepa = arepasCod[p.producto.toUpperCase()];
                if (matchCodigoArepa) {
                    // Si requiere sabores
                    if (matchCodigoArepa.nombre.includes('2 sabores')) {
                        seleccionSabores[from] = {
                            producto: {
                                item: matchCodigoArepa.nombre,
                                precio: matchCodigoArepa.precio,
                                cantidad: p.cantidad,
                                subtotal: p.cantidad * matchCodigoArepa.precio
                            },
                            esperando: true,
                            tipo: matchCodigoArepa.nombre.includes('mariscos') ? 'mariscos' : 'normal',
                            cantidad: 2
                        };
                        if (matchCodigoArepa.nombre.includes('mariscos')) {
                            sendMessage(from, `Indica 1 código de cada menú, separados por coma.\nSabores normales:\n${menuSabores}\nSabores mar:\n${menuSaboresMar}`);
                        } else {
                            sendMessage(from, `*Sabores:*\n${menuSabores}\n\n_*Responde con los códigos exactos de los sabores separados por coma. (Ejemplo: SA1, SA7 - para pollo, tocineta )*_`);
                        }
                        return;
                    } else {
                        // Arepa sin sabores
                        const producto = {
                            item: matchCodigoArepa.nombre,
                            precio: matchCodigoArepa.precio,
                            cantidad: p.cantidad,
                            subtotal: p.cantidad * matchCodigoArepa.precio
                        };
                        pedidos[from] = pedidos[from] || [];
                        pedidos[from].push(producto);
                        iniciarTimeoutPedido(from);
                        sendMessage(from, `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`);
                        return;
                    }
                }

                // --- Lógica para hamburguesas por código ---
                const matchCodigoBurger = hamburguesasCod[p.producto.toUpperCase()];
                if (matchCodigoBurger) {
                    seleccionSabores[from] = {
                        producto: {
                            item: matchCodigoBurger.nombre,
                            codigo: p.producto.toUpperCase(),
                            cantidad: p.cantidad,
                        },
                        esperandoVariante: true
                    };
                    sendMessage(
                        from,
                        `¿Cómo deseas tu ${matchCodigoBurger.nombre}?\nResponde con:\n*S* para sola ($${matchCodigoBurger.precios.S})\n*P* para con papas ($${matchCodigoBurger.precios.P})\n*C* para en combo ($${matchCodigoBurger.precios.C})`
                    );
                    return;
                }
                });

                // --- Lógica para recibir variante de hamburguesa ---
                if (seleccionSabores[from] && seleccionSabores[from].esperandoVariante) {
                    const variante = texto.toUpperCase();
                    const { producto } = seleccionSabores[from];
                    const burger = hamburguesasCod[producto.codigo];
                    if (burger && burger.precios[variante]) {
                        producto.variante = variantesBurger[variante];
                        producto.precio = burger.precios[variante];
                        producto.subtotal = producto.cantidad * producto.precio;
                        producto.item = `${burger.nombre} (${variantesBurger[variante]})`;
                        pedidos[from] = pedidos[from] || [];
                        pedidos[from].push(producto);
                        delete seleccionSabores[from];
                        iniciarTimeoutPedido(from);
                        sendMessage(
                            from,
                            `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`
                        );
                    } else {
                        sendMessage(from, 'Opción inválida. Responde con S (sola), P (con papas) o C (combo).');
                    }
                    return;
                }

                // Nuggets
                const matchCodigoNugget = nuggetsCod[texto.toUpperCase()];
                if (matchCodigoNugget) {
                    seleccionSabores[from] = {
                        producto: {
                            item: matchCodigoNugget.nombre,
                            codigo: texto.toUpperCase(),
                            cantidad: 1,
                        },
                        esperandoVarianteNugget: true
                    };
                    sendMessage(
                        from,
                        `¿Cómo deseas tus ${matchCodigoNugget.nombre}?\nResponde con:\n*S* para solo ($${matchCodigoNugget.precios.S})\n*P* para con papas ($${matchCodigoNugget.precios.P})\n*C* para en combo ($${matchCodigoNugget.precios.C})`
                    );
                    return;
                }

                // --- Lógica para recibir variante de nuggets ---
                if (seleccionSabores[from] && seleccionSabores[from].esperandoVarianteNugget) {
                    const variante = texto.toUpperCase();
                    const { producto } = seleccionSabores[from];
                    const nugget = nuggetsCod[producto.codigo];
                    if (nugget && nugget.precios[variante]) {
                        producto.variante = variantesBurger[variante];
                        producto.precio = nugget.precios[variante];
                        producto.subtotal = producto.cantidad * producto.precio;
                        producto.item = `${nugget.nombre} (${variantesBurger[variante]})`;
                        pedidos[from] = pedidos[from] || [];
                        pedidos[from].push(producto);
                        delete seleccionSabores[from];
                        iniciarTimeoutPedido(from);
                        sendMessage(
                            from,
                            `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`
                        );
                    } else {
                        sendMessage(from, 'Opción inválida. Responde con S (solo), P (con papas) o C (combo).');
                    }
                    return;
                }

                // Papas
                const matchCodigoPapa = papasCod[texto.toUpperCase()];
                if (matchCodigoPapa) {
                    const producto = {
                        item: matchCodigoPapa.nombre,
                        precio: matchCodigoPapa.precio,
                        cantidad: 1,
                        subtotal: 1 * matchCodigoPapa.precio
                    };
                    pedidos[from] = pedidos[from] || [];
                    pedidos[from].push(producto);
                    iniciarTimeoutPedido(from);
                    sendMessage(from, `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`);
                    return;
                }

                // Bebidas
                const matchCodigoBebida = bebidasCod[texto.toUpperCase()];
                if (matchCodigoBebida) {
                    const producto = {
                        item: matchCodigoBebida.nombre,
                        precio: matchCodigoBebida.precio,
                        cantidad: 1,
                        subtotal: 1 * matchCodigoBebida.precio
                    };
                    pedidos[from] = pedidos[from] || [];
                    pedidos[from].push(producto);
                    iniciarTimeoutPedido(from);
                    sendMessage(from, `Agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nEscribe _*VER*_ para ver el total de tu pedido o sigue agregando productos.`);
                    return;
                }

                // --- Lógica para zona de delivery por código ---
                const matchCodigoDelivery = zonaDeliveryCod[texto.toUpperCase()];
                if (matchCodigoDelivery) {
                    pedidos[from] = pedidos[from] || [];
                    const yaTieneDelivery = pedidos[from].some(p => p.item && p.item.startsWith('Delivery'));
                    if (yaTieneDelivery) {
                        sendMessage(from, 'Ya has agregado una zona de delivery a tu pedido.\n\nEscribe _*MENU*_ para continuar con tu orden.');
                    } else {
                        const producto = {
                            item: 'Delivery ' + matchCodigoDelivery.nombre,
                            precio: matchCodigoDelivery.precio,
                            cantidad: 1,
                            subtotal: 1 * matchCodigoDelivery.precio
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
    pedidoTimeouts[from] = setTimeout(() => {
        pedidos[from] = [];
        sendMessage(from, '⏰ Su pedido ha sido eliminado por inactividad. Escriba _*DELIVERY*_ para volver a comenzar.');
    }, 3 * 60 * 1000);
};