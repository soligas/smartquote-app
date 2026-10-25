# SmartQuote / CotizaSeguro Pro 🚀

Aplicación web full-stack ligera de dos capas para contratistas y profesionales independientes.
Combina un **Frontend reactivo y moderno** con un **Micro-backend en Python** potenciado por el SDK oficial de **Google GenAI (`google-genai`)**, el modelo `gemini-2.5-flash` y **Structured Outputs (Pydantic)**.

---

## 📁 Estructura del Proyecto

```plaintext
smartquote-app/
├── backend/
│   ├── app.py             # Servidor Flask con endpoints REST, SQLite y servicio estático
│   ├── gemini_service.py  # Lógica de IA con Salida Estructurada (JSON) con google-genai y Pydantic
│   ├── database.py        # Capa de persistencia SQLite (smartquote.db)
│   ├── requirements.txt   # Dependencias mínimas del backend
│   └── .env               # Variable GEMINI_API_KEY
├── frontend/
│   ├── index.html         # Interfaz de usuario responsiva con iconos Iconoir (https://iconoir.com)
│   ├── app.js             # Lógica reactiva de cálculo financiero y conexión al backend
│   └── styles.css         # Estilos, alineación de Iconoir y vista de impresión para PDF Suizo
└── README.md
```

---

## 🧮 Lógica Financiera de Margen Comercial Real

A diferencia del sobreprecio ingenuo (*markup*), la aplicación implementa la fórmula financiera actuarial de margen comercial seguro:

$$\text{Precio Venta} = \frac{\text{Costo Directo} + \text{Colchón Imprevistos}}{1 - \left(\frac{\text{Margen \%}}{100}\right)}$$

$$\text{Ganancia Neta} = \text{Precio Venta} - (\text{Costo Directo} + \text{Colchón Imprevistos})$$

---

## ⚙️ Configuración y Ejecución

### 1. Variables de Entorno
Edita el archivo `backend/.env` y define tu clave de Google AI:
```env
GEMINI_API_KEY=tu_clave_de_gemini_aqui
```

> **Nota:** Si no se suministra una clave de API, el backend cuenta con un generador heurístico de respaldo que simula el desglose estructurado sin bloquear la aplicación.

### 2. Instalación de Dependencias
```powershell
pip install -r backend/requirements.txt
```

### 3. Iniciar el Servidor Backend
```powershell
python backend/app.py
```
El servidor se iniciará en `http://127.0.0.1:5000`.

---

## 🔌 Endpoints de la API

### `POST /api/analizar`
Recibe texto informal o audio transcrito del requerimiento y devuelve el desglose estructurado validado por Pydantic.

**Payload:**
```json
{
  "texto": "3 bultos de cemento 90mil, pintor 250mil y acarreo 60mil",
  "moneda": "COP"
}
```

**Respuesta:**
```json
{
  "titulo_proyecto": "Remodelación y Obra Civil",
  "items": [
    {
      "descripcion": "Cemento gris para albañilería",
      "categoria": "Materiales",
      "cantidad": 3.0,
      "costo_unitario_estimado": 30000.0
    },
    {
      "descripcion": "Pintor profesional de acabados",
      "categoria": "Mano de obra",
      "cantidad": 1.0,
      "costo_unitario_estimado": 250000.0
    },
    {
      "descripcion": "Transporte y acarreo urbano",
      "categoria": "Servicios",
      "cantidad": 1.0,
      "costo_unitario_estimado": 60000.0
    }
  ],
  "alertas_imprevistos": [
    "Flete y acarreos de escombros/materiales hacia el sitio",
    "Tornillería, anclajes, selladores o consumibles menores",
    "Herramientas menores y equipos de protección personal (EPP / ARL)"
  ],
  "tiempo_estimado_dias": 8,
  "condiciones_pago": "50% Anticipo de inicio, 50% Acta de liquidación final"
}
```

### `POST /api/cotizaciones`
Guarda o actualiza una cotización completa con código consecutivo (ej. `COT-2026-001`).

### `GET /api/cotizaciones`
Retorna el listado completo de cotizaciones registradas para el panel de historial.

### `GET /api/cotizaciones/<codigo_o_id>`
Obtiene todos los ítems, márgenes y cálculos de una cotización para abrirla en el editor o compartirla.

### `PATCH /api/cotizaciones/<codigo_o_id>/estado`
Actualiza el ciclo de vida de la cotización (`Borrador`, `Enviada`, `Aprobada`, `Cobrada`).

### `DELETE /api/cotizaciones/<codigo_o_id>`
Elimina una propuesta de la base de datos local.

### `GET /api/emisor` y `POST /api/emisor`
Consulta y guarda de forma persistente la identidad corporativa del contratista o empresa.

### `GET /api/health`
Estado del servicio, verificación de Gemini y estado de la base de datos SQLite.

---

## 🖥️ Características de la Interfaz

1. **Desglose Instantáneo con IA:** Barra de lenguaje natural para ingresar listas informales.
2. **Terminal de Ganancia en Vivo:** Cálculo de utilidad neta en tiempo real mediante slider de margen (0% a 65%).
3. **Plantilla Suiza de Alta Fidelidad para PDF:** Modal con formato de cotización tipográfico y botón directo de impresión en PDF.
4. **Marca de Agua & Bloqueo Previo al Pago:**
   - En estado **Borrador / Sin Pagar**, la vista previa muestra una marca de agua diagonal de seguridad (*"VISTA PREVIA • NO OFICIAL • PAGO REQUERIDO"*).
   - Al pulsar en **"Descargar PDF Oficial"**, el sistema bloquea la descarga limpia y abre la pasarela de pagos.
   - Tras procesar el pago (vía Wompi PSE, Nequi QR o Tarjeta), la marca de agua se elimina automáticamente y el PDF oficial se descarga con plena validez legal.
   - Incluye botón **"Demo: Alternar Pago"** para verificar y testear ambos estados en tiempo real.
5. **Pasarela de Pago Simulada (Wompi / PSE / Nequi / Stripe):** Modal interactivo para recaudar anticipos del 50%.
6. **Membrete Corporativo:** Personalización de datos y firma digital del contratista guardados en SQLite.
7. **Códigos QR Dinámicos & Compartir por WhatsApp:** Generación instantánea de QR de recaudo y mensaje preformateado para envío al cliente con un solo clic.
8. **Modo Claro / Modo Oscuro Nativo:** Toggle accesible en el encabezado con iconos de Iconoir y persistencia en `localStorage`.
9. **Arquitectura Cero Fricción (Resiliencia Total):** Motor de respaldo heurístico que funciona al 100% de inmediato incluso sin configurar claves de API o sin conexión a internet.

