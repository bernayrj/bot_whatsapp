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
    queueLimit: 0,
    connectTimeout: 5000,
    idleTimeout: 60000
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
let catalogoSaboresRefresco = {};
let catalogoSaboresLipton = {};
let menuSabores = '';
let menuSaboresMar = '';
let menuSaboresRefresco = '';
let menuSaboresLipton = '';
let LOG_CONVERSACIONES = true;
let tasaActual = '';
let arepasCod = {};
let menuArepazo = '';
let client;

// Ejecutar una vez al iniciar el bot
actualizarTasa();
// Al iniciar el bot, carga el menú de arepas
cargarMenuArepazoDesdeBD();
// Al iniciar el bot cargar zonas delivery
cargarZonasDelivery();

// Permitir activar/desactivar log desde WhatsApp (solo número autorizado)
function toggleLogConversaciones(activar) {
    LOG_CONVERSACIONES = activar;
    console.log(`LOG_CONVERSACIONES: ${LOG_CONVERSACIONES ? 'ACTIVADO' : 'DESACTIVADO'}`);
}

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



// Programar para que se ejecute todos los días a las 12:00 am
cron.schedule('0 0 * * *', () => {
    actualizarTasa();
    numeroAutorizado.forEach(num => { setTimeout (() => {
        sendMessage(num, `✅ Tasa actualizada: Bs. ${tasaActual}` )
    }, 2000)
       ;
    })
});

// Traer los sabores disponibles de BD para las arepas
function cargarSaboresDesdeBD(callback) {
    db.query('CALL get_sabores()', (err, results) => {
        if (err) {
            console.error('Error al obtener sabores:', err);
            return;
        }
        catalogoSaboresCod = {};
        catalogoSaboresMarCod = {};
        catalogoSaboresRefresco = {};
        catalogoSaboresLipton = {};

        results[0].forEach(row => {
            if (row.categoria === 'normal') {
                catalogoSaboresCod[row.codigo] = row.sabor;
            } else if (row.categoria === 'mar') {
                catalogoSaboresMarCod[row.codigo] = row.sabor;
            } else if (row.categoria === 'refresco') {
                catalogoSaboresRefresco[row.codigo] = row.sabor;
            } else if (row.categoria === 'lipton') {
                catalogoSaboresLipton[row.codigo] = row.sabor;
            }

        });

        menuSabores = Object.entries(catalogoSaboresCod)
            .map(([cod, sabor]) => `- *${cod}*: ${sabor}`)
            .join('\n');
        menuSaboresMar = Object.entries(catalogoSaboresMarCod)
            .map(([cod, sabor]) => `- *${cod}*: ${sabor}`)
            .join('\n');
        menuSaboresRefresco = Object.entries(catalogoSaboresRefresco)
            .map(([cod, sabor]) => `- *${cod}*: ${sabor}`)
            .join('\n');
        menuSaboresLipton = Object.entries(catalogoSaboresLipton)
            .map(([cod, sabor]) => `- *${cod}*: ${sabor}`)
            .join('\n');
        console.log('Actualizando sabores desde BD...');
        callback();
    });
    
}

// Función para cargar menú de arepas y bebidas desde BD
function cargarMenuArepazoDesdeBD(callback) {
    db.query('CALL get_menu_arepazo()', (err, results) => {
        if (err) {
            console.error('Error al obtener menú de arepas:', err);
            return;
        }
        arepasCod = {};
        bebidasCod = {};
        results[0].forEach(row => {
            if (row.categoria === 'arepas') {
                arepasCod[row.codigo] = {
                    nombre: row.nombre,
                    categoria: row.categoria,
                    precio: row.precio
                };
            } else if (row.categoria === 'bebidas') {
                bebidasCod[row.codigo] = {
                    nombre: row.nombre,
                    categoria: row.categoria,
                    precio: row.precio
                };
            }
        });
        // Actualiza menú de texto
        menuArepazo = '\n\n🫓 *Arepas*\n' +
            Object.entries(arepasCod).map(([cod, data]) =>
                `- *${cod}*: ${data.nombre}  $${data.precio}\n`
            ).join('') +
            '\n\n🥤 *Bebidas*\n' +
            Object.entries(bebidasCod).map(([cod, data]) =>
                `- *${cod}*: ${data.nombre}  $${data.precio}\n`
            ).join('');
        if (callback) callback();
    });
}

//funcion para cargar zonas de  delivery desde BD 
function cargarZonasDelivery(callback) {
    db.query('CALL get_zonas ()', (err, results) => {
        if (err) {
            console.error('Error al obtener menú de arepas:', err);
            return;
        }
        zonasCod = {};
        results[0].forEach(row => {
                zonasCod[row.codigo] = {
                    codigo: row.codigo,
                    nombre: row.nombre,
                    precio: row.precio
                };
            
        });
        // Actualiza menú de texto
        zonaDelivery = '🛵 *Delivery* 🛵\n' +
            Object.entries(zonasCod).map(([cod, data]) =>
                `- *${cod}*: ${data.nombre}  $${data.precio}\n`
            ).join('');
        if (callback) callback();
    });
}

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
    console.log('setting up client events');
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

// Helper para guardar mensaje en archivo por cliente
function logConversacion(from, quien, mensaje) {
    if (!LOG_CONVERSACIONES) return;
    const carpeta = path.join(__dirname, 'conversaciones');
    if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta);
    const archivo = path.join(carpeta, `${from}.txt`);
    const fecha = new Date().toISOString();
    fs.appendFileSync(archivo, `[${fecha}] ${quien}: ${mensaje}\n`);
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
const datosRecepcion = {};
const telefonoATC = '0414-3354594';
const numeroAutorizado = ['584129326767@c.us', '584149071774@c.us' , '584242320885@c.us', '584142604666@c.us'];
const erroresUsuario = {}; // Lleva el conteo de errores por usuario
const LIMITE_ERRORES = 5;


// Catálogos SOLO por código

const hamburguesasCod = {
    'HB1': { nombre: 'Smash burger', descripcion: 'Pan de batata, carne smash, queso, ketchup y mayonesa', precios: { S: 3, P: 4, C: 5.5 } },
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

/* const nuggetsCod = {
    'NG1': { nombre: 'Nuggets de 4 piezas', precios: { S: 1.5, P: 2.5, C: 4 } },
    'NG2': { nombre: 'Nuggets de 6 piezas', precios: { S: 2, P: 3, C: 4.5 } },
    'NG3': { nombre: 'Nuggets de 10 piezas', precios: { S: 4.5, P: 5.5, C: 7 } }
};
 */
const papasCod = {
    'PA1': { nombre: 'Papas clásicas', precio: 1 },
    'PA2': { nombre: 'Canoa familiar', precio: 2 },
    'PA3': { nombre: 'Canoa papas queso y tocineta', precio: 3.5 }
};


const variantesBurger = {
    'S': 'Sola',
    'P': 'Con papas',
    'C': 'En combo'
};

function getMenuSmashCod() {
    let menu = '\n\n🍔 *Hamburguesas*\n';
    Object.entries(hamburguesasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*:`;
        menu += ` *${data.nombre}*:\n`;
        menu += ` _${data.descripcion}_\n\n`;
    });
    /* menu += '\n🍗 *Nuggets de pollo*\n'
    Object.entries(nuggetsCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}\n`;
    }); */ 
    menu += '\n🍟 *Papas fritas*\n'
    Object.entries(papasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}  $${data.precio}\n`;
    });
    menu += '\n🥤 *Bebidas*\n'
    Object.entries(bebidasCod).forEach(([cod, data]) => {
        menu += `- *${cod}*: ${data.nombre}  $${data.precio}\n`;
    });
   /*  menu += '\nℹ️ Responde con la cantidad y el código del producto que quieres agregar al pedido.\n\nEjemplo: 2 HB1 - para ordenar 2 smash burger. ✅*‼️\n\nDebes agregar un producto un solo producto por mensaje.*\n\nSi envias: 2 HB1, PA2 - No entedere. ❌'; */
    return menu;
}

// --- Lógica de pedidos  por códigos ---
const listenMessage = () => {
    client.on('message', (msg) => {
        const { from, body } = msg;
        if (!msg.hasMedia && (!body || !body.trim())) return;
        if (from === 'status@broadcast') return;
        const texto = body.toLowerCase().trim();
        console.log(`[${from}] Cliente: ${body}`);
        logConversacion(from, 'Cliente', body);

 // === ACTIVAR/DESACTIVAR LOG SOLO PARA ADMIN ===
        if (numeroAutorizado.includes(from)) {
            if (texto === 'activar log') {
                toggleLogConversaciones(true);
                sendMessage(from, '✅ Log de conversaciones ACTIVADO');
                return;
            }
            if (texto === 'desactivar log') {
                toggleLogConversaciones(false);
                sendMessage(from, '⛔ Log de conversaciones DESACTIVADO');
                return;
            }
        }        

        // --- Captura de datos facturacion ---
        if (datosRecepcion[from]) {
            // Validar nombre (solo letras y espacios)
            if (!datosRecepcion[from].nombre) {
                if (!/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(body.trim())) {
                    sendMessage(from, '⚠️ El nombre solo debe contener letras. Inténtalo de nuevo:');
                    return;
                }
                datosRecepcion[from].nombre = body.trim();
                sendMessage(from, 'Indícanos tu cédula (solo números, máximo 8 dígitos):');
                return;
            }
            // Validar cédula (solo números, máximo 8 dígitos)
            if (!datosRecepcion[from].cedula) {
                if (!/^\d{1,8}$/.test(body.trim())) {
                    sendMessage(from, '⚠️ La cédula solo debe contener números y máximo 8 dígitos. Inténtalo de nuevo:');
                    return;
                }
                datosRecepcion[from].cedula = body.trim();
                sendMessage(from, 'Indícanos el teléfono de quien recibe el pedido (solo números):');
                return;
            }
            // Validar teléfono (solo números, máximo 11 dígitos)
            if (!datosRecepcion[from].telefono) {
                if (!/^\d{11}$/.test(body.trim())) {
                    sendMessage(from, '⚠️ El teléfono solo debe contener números y 11 dígitos. Inténtalo de nuevo:');
                    return;
                }
                datosRecepcion[from].telefono = body.trim();

                // Agregar datos al resumen y continuar flujo
                if (global.ultimoPedido && global.ultimoPedido[from]) {
                    const { fecha, resumen, total } = global.ultimoPedido[from];
                    const datos = datosRecepcion[from];
                    const resumenConDatos =
                       /*  `🧾 *Tu pedido:*\n` + */
                        resumen +
                        `\n\n*Datos de Facturacion:*\n` +
                        `- Nombre: ${datos.nombre}\n` +
                        `- Cédula: ${datos.cedula}\n` +
                        `- Teléfono: ${datos.telefono}\n`;

                    global.ultimoPedido[from].resumen = resumenConDatos;

                    sendMessage(from, resumenConDatos);
                    sendMessage(from, '¿Cómo deseas pagar?\n\n💵 Efectivo\n 📲Pago Movil\n💳 Punto\n\nResponde con _*EFECTIVO*_, _*PAGO MOVIL*_ o _*PUNTO*_');
                }
                delete datosRecepcion[from];
                return;
            }
        }

        // === BLOQUE PARA RECIBIR Y GUARDAR IMAGEN DE PAGO MOVIL O EFECTIVO ===
        /* if (msg.hasMedia) {
            if (
                console.log(msg.media),
                typeof ultimoPedido !== 'undefined' &&
                ultimoPedido[from]
            ) {
                if (ultimoPedido[from].esperandoPagoMovil) {
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
                                        sendMessage(from, '⚠️ Ha ocurrido un error, intenta de nuevo');
                                    } else {
                                        ordenNum = results[0][0]?.orden || null;
                                        sendMessage(from, 'Perfecto, tu pago móvil ha sido registrado para su validacion. En breve nuestro equipo se comunicará contigo para coordinar la entrega.\n\n'+ nombreCliente + ', tu orden es: '+ ordenNum );
                                        setTimeout(()=> {
                                            sendMessage( from, 'En caso de tener algun inconveniente con tu pedido. Comunicate con soporte al: '+telefonoATC +' (solo Whatsapp).' )},1000)
                                        broadcastNewOrder();
                                    }
                                });
                            });

                            delete ultimoPedido[from].esperandoPagoMovil;
                            delete ultimoPedido[from];
                        }
                    });
                    return;
                } else if (ultimoPedido[from].esperandoEfectivo) {
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
                            sendMessage(from, '¡Foto recibida, pronto validaremos.');

                            // === GUARDAR ORDEN EN BD ===
                            const { resumen, total } = ultimoPedido[from];
                            const nombreCliente = msg._data?.notifyName || 'Desconocido';
                            db.query('CALL add_customer(?, ?)', [from, nombreCliente], (errCliente, resCliente) => {
                                if (errCliente) {
                                    console.log('Error al guardar cliente:', errCliente);
                                    return;
                                }
                                let ordenNum = null;
                                db.query('CALL add_order (?, ?, ?, ?, ?, ?)', [fecha, from, resumen, total, 'Efectivo', filename], (err, results) => {
                                    if (err) {
                                        console.log('Error en consulta:', err);
                                        sendMessage(from, '⚠️ Ha ocurrido un error, intenta de nuevo');
                                    } else {
                                        ordenNum = results[0][0]?.orden || null;
                                        sendMessage(from, 'Perfecto, puedes pagar en efectivo al momento de la entrega. En breve nuestro equipo se comunicara contigo para coordinar los detalles de entrega.\n\n'+ nombreCliente +'Tu orden es: ' + ordenNum );
                                        setTimeout(()=> {
                                            sendMessage( from, 'Comunicate con soporte al: '+telefonoATC +' en caso de incidencia con tu pedido. (solo Whatsapp)' )},1000)
                                        broadcastNewOrder();
                                    }
                                });
                            });

                            delete ultimoPedido[from].esperandoEfectivo;
                            delete ultimoPedido[from];
                        }
                    });
                    return;
                }
            }
            // Si no está esperando ninguno, mensaje de error
            sendMessage(from, '⚠️ No podemos entender tu orden, valida que hayas escrito el comando indicado correctamente');
            return;
        } */

        // Bloque para recibir y guardar imagen de pago movil y efectivo con validacion de formato de imagen
        if (msg.hasMedia) {
    const mime = msg._data?.mimetype || '';
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']; // formatos permitidos

    if (!allowedTypes.includes(mime)) {
        sendMessage(from, '⚠️ Debes enviarnos un capture de tu comprobante de pago. Solo se aceptan imágenes.');
        return;
    }

    if (typeof ultimoPedido !== 'undefined' && ultimoPedido[from]) {
        const tipoPago = ultimoPedido[from].esperandoPagoMovil ? 'Pago Movil' :
                         ultimoPedido[from].esperandoEfectivo ? 'Efectivo' : null;

        if (tipoPago) {
            msg.downloadMedia().then(media => {
                if (media) {
                    const pagosDir = path.join(__dirname, 'pagos');
                    if (!fs.existsSync(pagosDir)) {
                        fs.mkdirSync(pagosDir);
                    }

                    const fecha = new Date().toISOString().replace(/[:.]/g, '-');
                    const extension = media.mimetype.split('/')[1];
                    const filename = `pago_${from}_${fecha}.${extension}`;
                    const filePath = path.join(pagosDir, filename);

                    try {
                        fs.writeFileSync(filePath, media.data, 'base64');
                    } catch (err) {
                        console.error('Error al guardar imagen:', err);
                        sendMessage(from, '⚠️ No pudimos guardar tu comprobante. Intenta de nuevo.');
                        return;
                    }

                    sendMessage(from, '¡Comprobante recibido! Pronto validaremos tu pago.');

                    const { resumen, total } = ultimoPedido[from];
                    const nombreCliente = msg._data?.notifyName || 'Desconocido';

                    db.query('CALL add_customer(?, ?)', [from, nombreCliente], (errCliente, resCliente) => {
                        if (errCliente) {
                            console.log('Error al guardar cliente:', errCliente);
                            return;
                        }

                        db.query('CALL add_order (?, ?, ?, ?, ?, ?)', [fecha, from, resumen, total, tipoPago, filename], (err, results) => {
                            if (err) {
                                console.log('Error en consulta:', err);
                                sendMessage(from, '⚠️ Ha ocurrido un error, intenta de nuevo');
                            } else {
                                const ordenNum = results[0][0]?.orden || null;
                                const mensaje = tipoPago === 'Pago Movil'
                                    ? `Perfecto, tu pago móvil ha sido registrado para su validación. En breve nuestro equipo se comunicará contigo para coordinar la entrega.\n\n${nombreCliente}, tu orden es: ${ordenNum}`
                                    : `Perfecto, puedes pagar en efectivo al momento de la entrega. En breve nuestro equipo se comunicará contigo para coordinar los detalles de entrega.\n\n${nombreCliente}, tu orden es: ${ordenNum}`;

                                sendMessage(from, mensaje);
                                setTimeout(() => {
                                    sendMessage(from, `En caso de tener algún inconveniente con tu pedido, comunícate con soporte al: ${telefonoATC} (solo WhatsApp).`);
                                }, 1000);
                                broadcastNewOrder();
                            }
                        });
                    });

                    delete ultimoPedido[from].esperandoPagoMovil;
                    delete ultimoPedido[from].esperandoEfectivo;
                    delete ultimoPedido[from];
                    
                }
            });
            return;
        }
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
                console.log(codigos.length, catalogoSaboresCod[codigos[0]], catalogoSaboresCod[codigos[1]], catalogoSaboresMarCod[codigos[0]], catalogoSaboresMarCod[codigos[1]])
                validos = codigos.length <= 2 &&
                    codigos.length > 0 &&
                    (
                    (
                        catalogoSaboresCod[codigos[0]] ||
                        catalogoSaboresCod[codigos[1]]
                    ) ||
                    (
                        catalogoSaboresMarCod[codigos[0]] ||
                        catalogoSaboresMarCod[codigos[1]]
                    ) 
                )   
                if (validos) {
                    console.log('validos')
                    const saboresfn = ()=>{
                        let saboresArray = [];
                        if(catalogoSaboresCod[codigos[0]]) {
                            console.log('posicion 0:', catalogoSaboresCod[codigos[0]])
                            saboresArray.push(catalogoSaboresCod[codigos[0]])
                        } else if(catalogoSaboresMarCod[codigos[0]]){
                            console.log('posicion 0:', catalogoSaboresMarCod[codigos[0]])
                            saboresArray.push(catalogoSaboresMarCod[codigos[0]])
                        }
                        if(codigos[1]){
                            if(catalogoSaboresCod[codigos[1]]) {
                                console.log('posicion 0:', catalogoSaboresCod[codigos[1]])
                                saboresArray.push(catalogoSaboresCod[codigos[1]])
                        } else if(catalogoSaboresMarCod[codigos[1]]){
                            console.log('posicion 0:', catalogoSaboresMarCod[codigos[1]])
                                saboresArray.push(catalogoSaboresMarCod[codigos[1]])
                        }
                        }
                        return saboresArray;
                    }

                    sabores = saboresfn();
                }
                if (!validos) {
                    sendMessage(from, `Debes indicar 1 código de cada menú, separados por coma.\nEjemplo: SA1, SM3\nSabores normales:\n${menuSabores}\nSabores mar:\n${menuSaboresMar}`);
                    return;
                }
            } else if (tipo === 'refresco') {
                validos = codigos.length === cantidad && codigos.every(c => catalogoSaboresRefresco[c]);
                if (validos) {
                    sabores = codigos.map(c => catalogoSaboresRefresco[c]);
                }
                if (!validos) {
                    sendMessage(from, `Debes indicar el código del refresco. Opciones:\n${menuSaboresRefresco}`);
                    return;
                }
            } else if (tipo === 'lipton') {
                validos = codigos.length === cantidad && codigos.every(c => catalogoSaboresLipton[c]);
                if (validos) {
                    sabores = codigos.map(c => catalogoSaboresLipton[c]);
                }
                if (!validos) {
                    sendMessage(from, `Debes indicar el código del té lipton. Opciones:\n${menuSaboresLipton}`);
                    return;
                }
            } else {
                validos = codigos.length <= cantidad && codigos.length > 0 && codigos.every(c => catalogoSaboresCod[c]);
                if (validos) {
                    sabores = codigos.map(c => catalogoSaboresCod[c]);
                }
                if (!validos) {
                    sendMessage(from, `‼️ Debes indicar exactamente solo ${cantidad} sabores disponibles, separados por coma. Opciones:\n${menuSabores}ℹ️ Responde solo con el código exacto de los sabores que deseas separados por coma.\n\nEjemplo: *SA1, SA7* - para ordenar una arepa con pollo y tocineta. ✅\n\nℹ️ Si envias, más de 2 sabores: SA1, SA7, SA5 - No entendere. ❌`);
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
                `✅ Hemos agregado: ${productoAgregado.cantidad} x ${productoAgregado.item} con sabores: ${sabores.join(', ')}\n\nPuedes seguir agregando productos de nuestros menú.\n\nℹ️Escribe *A* para menú de arepas.\n\nℹ️Escribe *B* para menú de hamburguesas.\n\nℹ️ Si tu pedido esta completo, escribe *V* para verlo.`
            );
            return;
        }

        const saludos = ['hola',
            'holaa', 
            'hola buenas noches',
            'hola buenos dias',
            'hola buenos días',
            'hola buenas tardes', 
            'buenas noches', 
            'buenas tardes', 
            'buenos dias', 
            'buenos días', 
            'dia', 
            'día',
            'tarde',
            'noche'];
        if (saludos.some(saludo => texto.includes(saludo))) {
           sendMedia(
                from, 'logo1.jpg', 
                '👋 ¡Hola! Bienvenido al sistema de pedidos automático. 🛒\n\nEstás interactuando con un bot 🤖, por favor sigue las instrucciones con atención para tomar tu pedido correctamente.\n\nℹ️ Para iniciar escribe *D.*'
            );
            return;
        }

        switch (texto) {
            case 'delivery':
            case 'd':
                pedidos[from] = pedidos[from] || [];
                cargarZonasDelivery( ()=> {
                    sendMessage(from, zonaDelivery + '\n\nℹ️ Escribe solo el código de la zona de entrega de tu pedido.\n\nEjempo: *ZD2* - si tu zona de entrega es Lecheria')
                } );
                break;
            case 'menu':
            case 'menú':
            case 'm':
                sendMessage(from, 'ℹ️ Escribe *A* para enviarte el menú del *Arepazo* (arepas).\n\nℹ️ Escribe *B* para enviarte el menú SmashRico (hamburguesas).');
                break;
            case 'arepa':
            case 'arepas':
            case 'a':
                pedidos[from] = pedidos[from] || [];
                cargarMenuArepazoDesdeBD(() => {
                sendMedia(from, 'arepazo.png', menuArepazo);
                setTimeout(() => {
                sendMessage(from, 'ℹ️ Responde con la cantidad y el código del producto que quieres agregar al pedido.\n\nEjemplo: *2 MA1* - para ordenar 2 arepas mixta 2 sabores. ✅\n\nℹ️ Debes agregar un solo producto por mensaje.\n\nSi envias: 2 MA1, 3 MA2, BE3 - No entendere. ❌\n\nℹ️ Ten en cuenta que los sabores seleccionados a continuacion, aplicaran a la cantidad de arepas indicadas');
                }, 2000);
               });
           break;
            case 'hamburguesas':
            case 'burger':
            case 'b':
                pedidos[from] = pedidos[from] || [];
                sendMedia(
                    from,
                    'smash.png',
                    getMenuSmashCod()
                );
                setTimeout(()=> {
                    sendMessage( from, 'ℹ️ Responde con la cantidad y el código del producto que quieres agregar al pedido.\n\nEjemplo: *2 HB1* - para ordenar 2 smash burger. ✅\n\n\ℹ️ Debes agregra un solo producto por mensaje.\n\nSi envias: *2 HB1, PA2* - No entedere. ❌\n\nℹ️ Luego de elegir la hamburguesa o nuggets, elegiras como lo quieres: solo, con papas o en combo y te mostrare los precios.')},5000)
                break;
            case 'ver':
            case 'v':
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
                        sendMessage(from, 'ℹ️ Escribe *O* para ordenar y confimar tu pedido\n\nℹ️ Escribe *BORRAR* para eliminarlo');
                    }, 1000);
                    
                    if (!global.ultimoPedido) global.ultimoPedido = {};
                    global.ultimoPedido[from] = { fecha, resumen, total };
                } else {
                    sendMessage(from, '⚠️ Aún no haz agregado productos.\n\nℹ️ Escribe *M* para enviarte el menú y comenzar a tomar tu pedido.');
                }
                break;
            case 'borrar':
                if (pedidoTimeouts[from] && pedidos[from].length > 0) {
                    clearTimeout(pedidoTimeouts[from]);
                    delete pedidoTimeouts[from];
                }
                delete pedidos[from];
                sendMessage(from, 'ℹ️ Tu pedido ha sido eliminado.');
                setTimeout(()=> {
                                    sendMessage( from, 'ℹ️ Escribe *D* para volver a iniciar' )},1000);
                break;
            case 'ordenar':
            case 'o':
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

                        // INICIO DE CAPTURA DE DATOS
                        datosRecepcion[from] = {};
                        sendMessage(from, 'Indícanos tu nombre y apellido:');
                        delete pedidos[from];
                    } else {
                        sendMessage(from, ' ⚠️No conocemos tu zona de entrega. Escribela para agregarla\n\n' + zonaDelivery +'\n\nℹ️ Escribe solo el código de la zona de entrega de tu pedido.\n\nEjemplo: *ZD2* - si tu zona de entrea es Lecheria');
                    }
                } else {
                    sendMessage(from, '⚠️ Aún no has agregado productos.\n\nℹ️Escribe *M* para enviarte el menú y comenzar a tomar tu pedido.');
                }
                break;
            case 'pago movil':
            case 'pago móvil':
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
                        'Banco: Banco de Venezuela (0102) ó\n' +
                        'Banco Digital de los Trabajadores (0175)\n\n'+
                        '*Envianos tu capture del pago movil*'
                    );
                    ultimoPedido[from].esperandoPagoMovil = true;
                } else {
                    sendMessage(from, '⚠️ No existe ningun pedido, escribe *D* para comenzar.');
                }
                break;
            case 'efectivo':
                if (pedidoTimeouts[from]) {
                    clearTimeout(pedidoTimeouts[from]);
                    delete pedidoTimeouts[from];
                }
                if (typeof ultimoPedido !== 'undefined' && ultimoPedido[from]) {
                    sendMessage(from, '💵 Envianos una foto del billete con que vas a pagar tu pedido');
                    ultimoPedido[from].esperandoEfectivo = true;
                } else {
                    sendMessage(from, '⚠️ No existe ningun pedido, escribe *D* para iniciar.');
                }
                break;
                case 'punto':
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
                        db.query('CALL add_order (?, ?, ?, ?, ?, ?)', [fecha, from, resumen, total, 'Punto de venta', 'no aplica'], (err, results) => {
                            if (err) {
                                console.log('Error en consulta:', err);
                                sendMessage(from, '⚠️Ha ocurrido un error, intenta de nuevo');
                            } else {
                                ordenNum = results[0][0]?.orden || null;
                                broadcastNewOrder();
                                sendMessage(from, 'Perfecto, puedes pagar en punto de venta al momento de la entrega. En breve nuestro equipo se comunicara contigo para coordinar los detalles de entrega.\n\n'+'Tu orden es: ' + ordenNum);
                                setTimeout(()=> {
                                sendMessage( from, 'Comunicate con soporte al: '+telefonoATC +' en caso de incidencia con tu pedido. (solo Whatsapp)' )},1000)
                            }
                        });
                    });
                    delete ultimoPedido[from];
                } else {
                    console.log('No hay datos de pedido para guardar.');
                }
                break;
            //opciones de configiracion admin
            case 'tasa':
                if (numeroAutorizado.includes(from)) {
                    actualizarTasa();
                    sendMessage(from, '✅ Tasa dolar actualizada correctamnete Bs.' +tasaActual);
                } else {
                    sendMessage(from, '⚠️ No podemos entender tu orden');
                }
                break;
            case 'sabores':
                cargarSaboresDesdeBD(()=>{
                            if (numeroAutorizado.includes(from)) {
                            sendMessage(from, `✅ Sabores actualizados`);
                            } else {
                                sendMessage(from, `⚠️ No podemos entender tu orden`);
                            }
                        })
                break;
            default:
                // --- SOLO lógica por CÓDIGOS ---

                const match = texto.match(/^(\d+)\s+(.+)$/);
                let cantidad = 1;
                let producto = null;
                let nombreProducto = texto.trim().toLowerCase();
                if (match) {
                    cantidad = parseInt(match[1]);
                    nombreProducto = match[2].trim().toLowerCase();
                }

                // Lógica para arepas por código

                const matchCodigoArepa = arepasCod[nombreProducto.toUpperCase()];
                if (matchCodigoArepa) {
                    // Si requiere sabores
                    if (matchCodigoArepa.nombre.includes('2 sabores')) {
                        seleccionSabores[from] = {
                            producto: {
                                item: matchCodigoArepa.nombre,
                                precio: matchCodigoArepa.precio,
                                cantidad: cantidad,
                                subtotal: cantidad * matchCodigoArepa.precio
                            },
                            esperando: true,
                            tipo: matchCodigoArepa.nombre.includes('mariscos') ? 'mariscos' : 'normal',
                            cantidad: 2
                        };
                        cargarSaboresDesdeBD(()=>{
                            if (matchCodigoArepa.nombre.includes('mariscos')) {
                            sendMessage(from, `Sabores normales:\n${menuSabores}\nSabores de mar:\n${menuSaboresMar}\n\nℹ️ Responde solo con el código exacto de los sabores que deseas separados por coma.\n\nEjemplo: *SA10, SM1* - para ordenar una arepa con pulpo y queso amarillo. ✅\n\nℹ️ Si envias, más de 2 sabores: SA1, SM1, SA5 - No entendere. ❌`);
                            } else {
                                sendMessage(from, `*Sabores rellenos:*\n${menuSabores}\n\nℹ️ Responde solo con el código exacto de los sabores que deseas separados por coma.\n\nEjemplo: *SA1, SA7* - para ordenar una arepa con pollo y tocineta. ✅\n\nℹ️ Si envias, más de 2 sabores: SA1, SA7, SA5 - No entendere. ❌`);
                            }
                        })
                        return;
                    } else {
                        // Arepa sin sabores
                        const producto = {
                            item: matchCodigoArepa.nombre,
                            precio: matchCodigoArepa.precio,
                            cantidad: cantidad,
                            subtotal: cantidad * matchCodigoArepa.precio
                        };
                        pedidos[from] = pedidos[from] || [];
                        pedidos[from].push(producto);
                        iniciarTimeoutPedido(from);
                        sendMessage(from, `✅ Hemos agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nPuedes seguir agregando productos de nuestros menú.\n\nℹ️Escribe *A* para menú de arepas.\n\nℹ️Escribe *B* para menú de hamburguesas.\n\nℹ️ Si tu pedido esta completo, escribe *V* para verlo.`);
                        return;
                    }
                }

                // --- Lógica para hamburguesas por código ---
                const matchCodigoBurger = hamburguesasCod[nombreProducto.toUpperCase()];
                if (matchCodigoBurger) {
                    seleccionSabores[from] = {
                        producto: {
                            item: matchCodigoBurger.nombre,
                            codigo: nombreProducto.toUpperCase(),
                            cantidad: cantidad,
                        },
                        esperandoVariante: true
                    };
                    sendMessage(
                        from,
                        `¿Cómo deseas tu ${matchCodigoBurger.nombre}?\nResponde con:\n*S* para sola ($${matchCodigoBurger.precios.S})\n*P* para con papas ($${matchCodigoBurger.precios.P})\n*C* para en combo ($${matchCodigoBurger.precios.C})`
                    );
                    return;
                }

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
                            `✅ Hemos agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nPuedes seguir agregando productos de nuestros menú.\n\nℹ️Escribe *A* para menú de arepas.\n\nℹ️Escribe *B* para menú de hamburguesas.\n\nℹ️ Si tu pedido esta completo, escribe *V* para verlo.`
                        );
                    } else {
                        sendMessage(from, '⚠️ Opción inválida.\n\nℹ️ Responde con las opciones indicadas.\n\nEjemplo: *S* - para hambuerguesa sola ó *C* - para hamburguesa en combo.');
                    }
                    return;
                }

                // Nuggets
               /*  const matchCodigoNugget = nuggetsCod[nombreProducto.toUpperCase()];
                if (matchCodigoNugget) {
                    seleccionSabores[from] = {
                        producto: {
                            item: matchCodigoNugget.nombre,
                            codigo: nombreProducto.toUpperCase(),
                            cantidad: cantidad,
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
                } */

                // Papas
                const matchCodigoPapa = papasCod[nombreProducto.toUpperCase()];
                if (matchCodigoPapa) {
                    const producto = {
                        item: matchCodigoPapa.nombre,
                        precio: matchCodigoPapa.precio,
                        cantidad: cantidad,
                        subtotal: 1 * matchCodigoPapa.precio
                    };
                    pedidos[from] = pedidos[from] || [];
                    pedidos[from].push(producto);
                    iniciarTimeoutPedido(from);
                    sendMessage(from, `✅ Hemos agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nPuedes seguir agregando productos de nuestros menú.\n\nℹ️Escribe *A* para menú de arepas.\n\nℹ️Escribe *B* para menú de hamburguesas.\n\nℹ️ Si tu pedido esta completo, escribe *V* para verlo.`);
                    return;
                }

                // Bebidas
                const matchCodigoBebida = bebidasCod[nombreProducto.toUpperCase()];
                if (matchCodigoBebida) {
                    if (matchCodigoBebida.nombre.includes('Refresco') || matchCodigoBebida.nombre.includes('Lipton')) {
                        seleccionSabores[from] = {
                        producto: {
                            item: matchCodigoBebida.nombre,
                            precio: matchCodigoBebida.precio,
                            cantidad: cantidad,
                            subtotal: cantidad * matchCodigoBebida.precio
                        },
                        esperando: true,
                        tipo: matchCodigoBebida.nombre.includes('Refresco') ? 'refresco' : 'lipton',
                        cantidad: 1
                    };
                    cargarSaboresDesdeBD(()=>{
                        if (matchCodigoBebida.nombre.includes('Refresco')) {
                            sendMessage(from, `Sabores:\n${menuSaboresRefresco}\n\nℹ️ Responde con el código exacto del sabor.\n\nEjemplo: *RF1* - para ordenar Pepsi`);
                        } else if (matchCodigoBebida.nombre.includes('Lipton')) {
                           sendMessage(from, `*Sabores:*\n${menuSaboresLipton}\n\nℹ️ Responde con el código exacto del sabor.\n\nEjemplo: *LT1* - para ordenar Té Verde`);
                        }
                    });
                    return;
                } else {
                    const producto = {
                            item: matchCodigoBebida.nombre,
                            precio: matchCodigoBebida.precio,
                            cantidad: cantidad,
                            subtotal: cantidad * matchCodigoBebida.precio
                        };
                    pedidos[from] = pedidos[from] || [];
                    pedidos[from].push(producto);
                    iniciarTimeoutPedido(from);
                    sendMessage(from, `✅ Hemos agregado: ${producto.cantidad} x ${producto.item} ($${producto.precio} c/u) = $${producto.subtotal}\n\nPuedes seguir agregando productos de nuestros menú.\n\nℹ️Escribe *A* para menú de arepas.\n\nℹ️Escribe *B* para menú de hamburguesas.\n\nℹ️ Si tu pedido esta completo, escribe *V* para verlo.`);
                    return;
                }
                    }

                // --- Lógica para zona de delivery por código ---
                const matchCodigoDelivery = zonasCod[texto.toUpperCase()];
                if (matchCodigoDelivery) {
                    pedidos[from] = pedidos[from] || [];
                    const yaTieneDelivery = pedidos[from].some(p => p.item && p.item.startsWith('Delivery'));
                    if (yaTieneDelivery) {
                        sendMessage(from, 'ℹ️ Ya habias agregado una zona de delivery a tu pedido.\n\nEscribe *M* para continuar con tu orden.');
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
                            `🛵 Gracias por compartir tu zona de entrega.\n\nℹ️ Escribe *M* para iniciar tu pedido.\n\nℹ️ Escribe *V* para ver tu pedido si ya agregaste productos.`
                        );
                    }
                    return;
                }

                // Si llega aquí, no entendió el mensaje BRUTO
                erroresUsuario[from] = (erroresUsuario[from] || 0) + 1;
                if (erroresUsuario[from] >= LIMITE_ERRORES) {
                sendMessage(from, `¿Necesitas ayuda? Puedes comunicarte con soporte al: ${telefonoATC} (solo Whatsapp).`);
                erroresUsuario[from] = 0; // Reinicia el contador tras mostrar el mensaje de soporte
                return;
                }
                sendMessage(from, '🤖 ¡Hola! Estás interactuando con un bot automatizado.\n\nNo pudimos entender tu mensaje.\n\n‼️ Por favor, asegúrate de escribir el comando indicado en el mensaje anterior correctamente si estas en el curso de un pedido.\n\nℹ️ Si no haz comenzado tu pedido, escribe *D* y sigue las instrucciones paso a paso.');
        }
    });
};

const sendMessage = (to, message) => {

    console.log(`[${to}] Bot: ${message}`);
    logConversacion(to, 'Bot', message);
    client.sendMessage(to, message);
};

const sendMedia = (to, file, caption = '') => {
    const mediaFile = MessageMedia.fromFilePath(`./mediaSend/${file}`);
    console.log(`[${to}] Bot: ${caption}`);
    client.sendMessage(to, mediaFile, { caption });
    logConversacion(to, 'Bot', caption);
};

const iniciarTimeoutPedido = (from) => {
    clearTimeout(pedidoTimeouts[from]);
    delete pedidoTimeouts[from];
    pedidoTimeouts[from] = setTimeout(() => {
        pedidos[from] = [];
        sendMessage(from, '⏰ Su pedido ha sido eliminado por inactividad. Escriba _*D*_ para volver a comenzar.');
    }, 20 * 60 * 1000);
};