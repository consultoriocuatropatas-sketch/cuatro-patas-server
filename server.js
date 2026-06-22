// server.js — Servidor backend de Veterinaria Cuatro Patas
// Conecta la app de Windows y Android con MongoDB Atlas y Google Drive

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Subida de archivos en memoria (para pasarlos a Google Drive)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── Verificación de API Secret (seguridad básica) ────────────────────────────
function verificarSecret(req, res, next) {
  const secret = req.headers['x-api-secret'];
  if (secret !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ── Conexión a MongoDB ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// ── Esquemas de MongoDB ──────────────────────────────────────────────────────
const consultaSchema = new mongoose.Schema({
  id:             String,
  fecha:          String,
  hora:           String,
  motivo:         String,
  temp:           String,
  hidrat:         String,
  fccard:         String,
  fcresp:         String,
  peso:           String,
  llc:            String,
  reftus:         String,
  tcoag:          String,
  mucosas:        String,
  ganglios:       String,
  oidos:          String,
  ojos:           String,
  diagnostico:    String,
  pruebasSug:     String,
  pruebasReal:    String,
  resultado:      String,
  tratClinica:    String,
  tratCasa:       String,
  revision:       String,
  proximaCita:    String,
  proximaCitaMotivo: String,
  mvz:            String,
  receta:         String,
  archivos:       [{ nombreArchivo: String, nombreOriginal: String, driveId: String, driveUrl: String }],
  creadoEn:       String,
}, { _id: false });

const pacienteSchema = new mongoose.Schema({
  id:           { type: String, required: true, unique: true },
  nombre:       String,
  tipo:         String,
  raza:         String,
  edad:         String,
  sexo:         String,
  color:        String,
  peso:         String,
  condicion:    String,
  tutor:        String,
  tel:          String,
  domicilio:    String,
  convive:      String,
  vive:         String,
  gestante:     String,
  esteril:      String,
  lactando:     String,
  garrap:       String,
  celo:         String,
  desparasit:   String,
  vacuna:       String,
  vacunaFecha:  String,
  frecuencia:   String,
  nutricion:    String,
  enfermedades: String,
  piel:         String,
  recordFecha:  String,
  recordTipo:   String,
  recordNota:   String,
  consultas:    [consultaSchema],
  creadoEn:     String,
  actualizadoEn: String,
});

const Paciente = mongoose.model('Paciente', pacienteSchema);

// ── Google Drive ─────────────────────────────────────────────────────────────
function getDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function subirArchivoADrive(buffer, nombreArchivo, mimeType, pacienteId) {
  const drive = getDriveClient();

  // Buscar/crear carpeta del paciente dentro de la carpeta principal
  let carpetaId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const carpetaBusqueda = await drive.files.list({
    q: `name='${pacienteId}' and mimeType='application/vnd.google-apps.folder' and '${carpetaId}' in parents and trashed=false`,
    fields: 'files(id)',
  });

  if (carpetaBusqueda.data.files.length > 0) {
    carpetaId = carpetaBusqueda.data.files[0].id;
  } else {
    const nuevaCarpeta = await drive.files.create({
      requestBody: { name: pacienteId, mimeType: 'application/vnd.google-apps.folder', parents: [carpetaId] },
      fields: 'id',
    });
    carpetaId = nuevaCarpeta.data.id;
  }

  // Subir el archivo
  const bufferStream = new stream.PassThrough();
  bufferStream.end(buffer);

  const archivo = await drive.files.create({
    requestBody: { name: nombreArchivo, parents: [carpetaId] },
    media: { mimeType, body: bufferStream },
    fields: 'id, webViewLink, webContentLink',
  });

  // Hacer el archivo público para que se pueda ver desde la app
  await drive.permissions.create({
    fileId: archivo.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    driveId: archivo.data.id,
    driveUrl: archivo.data.webViewLink,
    directUrl: `https://drive.google.com/uc?id=${archivo.data.id}`,
  };
}

async function eliminarArchivoDeDrive(driveId) {
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId: driveId });
  } catch (e) {
    console.error('Error eliminando de Drive:', e.message);
  }
}

// ── Ruta de salud (para UptimeRobot) ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── RUTAS DE PACIENTES ───────────────────────────────────────────────────────

// GET /pacientes — Obtener todos los pacientes
app.get('/pacientes', verificarSecret, async (req, res) => {
  try {
    const pacientes = await Paciente.find().lean();
    res.json(pacientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /pacientes/:id — Obtener un paciente por ID
app.get('/pacientes/:id', verificarSecret, async (req, res) => {
  try {
    const p = await Paciente.findOne({ id: req.params.id }).lean();
    if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /pacientes — Crear paciente
app.post('/pacientes', verificarSecret, async (req, res) => {
  try {
    const p = new Paciente({ ...req.body, actualizadoEn: new Date().toISOString() });
    await p.save();
    res.status(201).json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /pacientes/:id — Actualizar paciente completo
app.put('/pacientes/:id', verificarSecret, async (req, res) => {
  try {
    const p = await Paciente.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body, actualizadoEn: new Date().toISOString() },
      { new: true, upsert: true }
    );
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /pacientes/:id — Eliminar paciente
app.delete('/pacientes/:id', verificarSecret, async (req, res) => {
  try {
    const p = await Paciente.findOne({ id: req.params.id });
    if (p) {
      // Eliminar todos los archivos de Drive de este paciente
      for (const consulta of p.consultas || []) {
        for (const archivo of consulta.archivos || []) {
          if (archivo.driveId) await eliminarArchivoDeDrive(archivo.driveId);
        }
      }
      await Paciente.deleteOne({ id: req.params.id });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RUTAS DE CONSULTAS ───────────────────────────────────────────────────────

// POST /pacientes/:id/consultas — Agregar consulta
app.post('/pacientes/:id/consultas', verificarSecret, async (req, res) => {
  try {
    const p = await Paciente.findOne({ id: req.params.id });
    if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });
    const consulta = { ...req.body, archivos: req.body.archivos || [] };
    p.consultas.unshift(consulta);
    p.actualizadoEn = new Date().toISOString();
    await p.save();
    res.status(201).json(consulta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /pacientes/:pacienteId/consultas/:consultaId — Eliminar consulta
app.delete('/pacientes/:pacienteId/consultas/:consultaId', verificarSecret, async (req, res) => {
  try {
    const p = await Paciente.findOne({ id: req.params.pacienteId });
    if (!p) return res.status(404).json({ error: 'Paciente no encontrado' });

    const consulta = p.consultas.find(c => c.id === req.params.consultaId);
    if (consulta) {
      for (const archivo of consulta.archivos || []) {
        if (archivo.driveId) await eliminarArchivoDeDrive(archivo.driveId);
      }
    }

    p.consultas = p.consultas.filter(c => c.id !== req.params.consultaId);
    p.actualizadoEn = new Date().toISOString();
    await p.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RUTAS DE ARCHIVOS (Google Drive) ────────────────────────────────────────

// POST /archivos/subir — Subir un archivo a Google Drive
app.post('/archivos/subir', verificarSecret, upload.single('archivo'), async (req, res) => {
  try {
    console.log('📁 Recibiendo archivo...');
    console.log('Body:', JSON.stringify(req.body));
    console.log('File:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'NO FILE');

    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: 'Google Drive no configurado aún' });
    }

    const { pacienteId, consultaId, nombreOriginal } = req.body;
    console.log(`📤 Subiendo a Drive: paciente=${pacienteId}, consulta=${consultaId}`);

    const resultado = await subirArchivoADrive(
      req.file.buffer,
      `${Date.now()}_${req.file.originalname}`,
      req.file.mimetype,
      pacienteId
    );

    console.log('✅ Subido a Drive:', resultado.driveId);

    // Guardar referencia del archivo en la consulta del paciente
    const p = await Paciente.findOne({ id: pacienteId });
    if (p) {
      const consulta = p.consultas.find(c => c.id === consultaId);
      if (consulta) {
        consulta.archivos = consulta.archivos || [];
        consulta.archivos.push({
          nombreArchivo: `${Date.now()}_${req.file.originalname}`,
          nombreOriginal: nombreOriginal || req.file.originalname,
          driveId: resultado.driveId,
          driveUrl: resultado.driveUrl,
        });
        p.actualizadoEn = new Date().toISOString();
        await p.save();
      }
    }

    res.json(resultado);
  } catch (err) {
    console.error('❌ Error subiendo archivo:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /archivos/:driveId — Eliminar un archivo de Google Drive
app.delete('/archivos/:driveId', verificarSecret, async (req, res) => {
  try {
    await eliminarArchivoDeDrive(req.params.driveId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// GET /archivos/thumb/:driveId — Proxy de miniaturas para evitar CORS
app.get('/archivos/thumb/:driveId', async (req, res) => {
  try {
    const drive = getDriveClient();
    const response = await drive.files.get(
      { fileId: req.params.driveId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(response.data));
  } catch (e) {
    res.status(404).json({ error: 'No encontrado' });
  }
});
// ── Arrancar servidor ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🐾 Servidor Cuatro Patas corriendo en puerto ${PORT}`);
});
