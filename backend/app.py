# SmartQuote / CotizaSeguro Pro 🚀

Aplicación web full-stack ligera de dos capas para contratistas y profesionales independientes.
Combina un Frontend reactivo y moderno con un micro-backend en Python potenciado por el SDK oficial de Google GenAI (`google-genai`), el modelo `gemini-2.5-flash` y salida estructurada.

---

## 📁 Estructura del proyecto

```plaintext
smartquote-app/
├── api/
│   └── index.py            # Entry point para Vercel / Python Serverless
├── backend/
│   ├── app.py              # Servidor Flask con endpoints REST y archivos estáticos
│   ├── database.py         # SQLite y lógica de cotizaciones/licencias
│   ├── gemini_service.py   # Lógica de IA con salida estructurada
│   ├── requirements.txt    # Dependencias del backend
│   └── smartquote.db       # Base local (copiada a /tmp en Vercel)
├── frontend/
│   ├── index.html          # Interfaz web
│   ├── app.js              # Lógica del frontend
│   ├── styles.css          # Estilos
│   ├── manifest.json       # PWA
│   ├── sw.js               # Service worker
│   └── assets/
├── .env.example            # Variables de entorno de ejemplo
├── Dockerfile              # Contenedor local opcional
├── docker-compose.yml      # Opcional para pruebas locales
├── requirements.txt        # Dependencias para Vercel
├── render.yaml             # Deploy alterno para Render
├── vercel.json             # Configuración de Vercel
├── README.md
└── Procfile                # Deploy Heroku/Render alterno
```

---

## 🚀 Despliegue en Vercel

Esta versión está preparada para desplegarse con Vercel manteniendo:
- backend Flask en `/api/index.py`
- frontend estático en `/frontend`
- base de datos SQLite en `/tmp` cuando `VERCEL` está activo

### 1) Preparar el repositorio

Conecta el repo `soligas/smartquote-app` a Vercel.

- Framework Preset: `Other` o `Node` (si Vercel lo detecta como Python, deja la detección automática)
- Root Directory: repositorio raíz
- Build Command: vacío o dejarlo en blanco
- Output Directory: vacío

### 2) Variables de entorno

En Vercel, configura estas variables:

```env
GEMINI_API_KEY=tu_clave_de_google_ai
PORT=5000
FLASK_DEBUG=0
```

Si no configuras `GEMINI_API_KEY`, la app sigue funcionando con un fallback heurístico, pero la parte de IA no será real.

### 3) Deploy

Haz commit y push al `main` (o la rama que Vercel observe), y Vercel desplegará la app usando el `requirements.txt` raíz y la función `api/index.py`.

### 4) Verificación rápida

Luego del deploy, prueba estas rutas:

- `https://tuapp.vercel.app/api/health`
- `https://tuapp.vercel.app/`

La API debe responder con un JSON de estado y el frontend debe cargar la interfaz principal.

---

## 🧮 Lógica financiera

A diferencia del sobreprecio ingenuo (*markup*), la aplicación implementa la fórmula financiera actuarial de margen comercial seguro:

$$\text{Precio Venta} = \frac{\text{Costo Directo} + \text{Colchón Imprevistos}}{1 - \left(\frac{\text{Margen \%}}{100}\right)}$$

$$\text{Ganancia Neta} = \text{Precio Venta} - (\text{Costo Directo} + \text{Colchón Imprevistos})$$

---

## ⚙️ Ejecución local

### Variables de entorno

```env
GEMINI_API_KEY=tu_clave_de_google_ai
PORT=5000
```

### Instalación

```bash
pip install -r requirements.txt
```

### Ejecutar

```bash
python backend/app.py
```

El servidor queda en `http://127.0.0.1:5000`.

---

## 🔌 Endpoints principales

- `POST /api/analizar`
- `GET /api/cotizaciones`
- `POST /api/cotizaciones`
- `GET /api/cotizaciones/<codigo_o_id>`
- `PATCH /api/cotizaciones/<codigo_o_id>/estado`
- `DELETE /api/cotizaciones/<codigo_o_id>`
- `GET /api/emisor` / `POST /api/emisor`
- `GET /api/health`

---

## 🧠 Nota importante sobre Vercel

La app usa SQLite. En Vercel el sistema de archivos es efímero y casi siempre de solo lectura. Por eso la base de datos se copia a `/tmp` cuando la variable `VERCEL` está presente. Esto evita errores de escritura y hace que el despliegue sea más estable.

Además, la ruta estática del frontend se resuelve con una ruta absoluta para no depender del directorio de trabajo de Vercel.

---

## 📝 Recomendación

Para despliegues más tranquilos en producción, usa:
- Vercel para frontend + API Python
- SQLite local/temporal para pruebas y demos rápidas
- variables de entorno en Vercel para `GEMINI_API_KEY`
- un backup de la base de datos si la app llega a un uso serio

