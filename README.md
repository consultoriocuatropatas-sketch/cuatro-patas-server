# Servidor Cuatro Patas

Backend para sincronizar datos entre la app de Windows y Android.

## Variables de entorno necesarias en Render

```
MONGODB_URI=mongodb+srv://cuatropatas:cuatropatas1234@cuatropatas.f6elhos.mongodb.net/cuatropatas?retryWrites=true&w=majority&appName=Cuatropatas
API_SECRET=cuatropatas_secret_2026
GOOGLE_CLIENT_ID=(se configura después)
GOOGLE_CLIENT_SECRET=(se configura después)
GOOGLE_REFRESH_TOKEN=(se configura después)
GOOGLE_DRIVE_FOLDER_ID=(se configura después)
```

## Endpoints principales

- GET  /health — Verificar que el servidor está activo (para UptimeRobot)
- GET  /pacientes — Obtener todos los pacientes
- POST /pacientes — Crear paciente
- PUT  /pacientes/:id — Actualizar paciente
- DELETE /pacientes/:id — Eliminar paciente
- POST /pacientes/:id/consultas — Agregar consulta
- DELETE /pacientes/:id/consultas/:cid — Eliminar consulta
- POST /archivos/subir — Subir foto/PDF a Google Drive
- DELETE /archivos/:driveId — Eliminar archivo de Drive
