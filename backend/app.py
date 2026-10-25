import os
import urllib.parse
from flask import Flask, request, jsonify
from flask_cors import CORS
from gemini_service import optimizar_alcance_con_ia
from database import (
    init_db, guardar_cotizacion, listar_cotizaciones,
    obtener_cotizacion, actualizar_estado_cotizacion,
    eliminar_cotizacion, obtener_emisor, guardar_emisor,
    registrar_abono_cotizacion, reportar_pago_anticipo,
    obtener_config_smartquote, guardar_config_smartquote,
    desbloquear_licencia_smartquote, crear_solicitud_licencia,
    aprobar_solicitud_licencia, verificar_codigo_solicitud,
    adjuntar_comprobante_y_aprobar,
    guardar_feedback, listar_feedback
)

# Inicializar Base de Datos SQLite
init_db()

# Inicializar Flask con ruta estática al frontend
app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

@app.route("/")
def index():
    return app.send_static_file("index.html")

# ----------------- ENDPOINT GEMINI AI -----------------
@app.route("/api/analizar", methods=["POST"])
def analizar():
    data = request.json or {}
    texto = data.get("texto", "")
    moneda = data.get("moneda", "COP")
    if not texto or not texto.strip():
        return jsonify({"error": "El campo de requerimiento 'texto' es obligatorio."}), 400
    try:
        resultado = optimizar_alcance_con_ia(texto.strip(), moneda)
        return jsonify(resultado.model_dump())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- ENDPOINTS COTIZACIONES (SQLITE) -----------------
@app.route("/api/cotizaciones", methods=["GET"])
def get_cotizaciones():
    try:
        lista = listar_cotizaciones()
        return jsonify(lista)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cotizaciones", methods=["POST"])
def post_cotizacion():
    data = request.json or {}
    if not data:
        return jsonify({"error": "Cuerpo JSON vacío"}), 400
    try:
        res = guardar_cotizacion(data)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cotizaciones/<codigo_o_id>", methods=["GET"])
def get_una_cotizacion(codigo_o_id):
    try:
        cot = obtener_cotizacion(codigo_o_id)
        if not cot:
            return jsonify({"error": "Cotización no encontrada"}), 404
        return jsonify(cot)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cotizaciones/<codigo_o_id>/estado", methods=["PATCH"])
def patch_estado(codigo_o_id):
    data = request.json or {}
    nuevo_estado = data.get("estado", "Borrador")
    try:
        res = actualizar_estado_cotizacion(codigo_o_id, nuevo_estado)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cotizaciones/<codigo_o_id>/abono", methods=["POST", "PATCH"])
def patch_abono(codigo_o_id):
    data = request.json or {}
    monto = float(data.get("monto", 0))
    if monto <= 0:
        return jsonify({"error": "El monto del abono debe ser mayor a cero"}), 400
    try:
        res = registrar_abono_cotizacion(codigo_o_id, monto)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cotizaciones/<codigo_o_id>/reportar-pago", methods=["POST"])
def post_reportar_pago(codigo_o_id):
    data = request.json or {}
    monto = float(data.get("monto", 0))
    ref = str(data.get("referencia", "")).strip()
    comprobante_img = str(data.get("comprobante_img", "")).strip()
    if monto <= 0:
        return jsonify({"error": "El monto del anticipo debe ser mayor a cero"}), 400
    try:
        res = reportar_pago_anticipo(codigo_o_id, monto, ref, comprobante_img)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cotizaciones/<codigo_o_id>", methods=["DELETE"])
def delete_cotizacion(codigo_o_id):
    try:
        res = eliminar_cotizacion(codigo_o_id)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- ENDPOINTS IDENTIDAD EMISOR / EMPRESA -----------------
@app.route("/api/emisor", methods=["GET"])
def get_emisor_data():
    try:
        data = obtener_emisor()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/emisor", methods=["POST"])
def post_emisor_data():
    data = request.json or {}
    try:
        res = guardar_emisor(data)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- MONETIZACIÓN SMARTQUOTE ($5.000 / $49.000) -----------------
@app.route("/api/smartquote/config", methods=["GET"])
def get_sq_config():
    try:
        data = obtener_config_smartquote()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/smartquote/config", methods=["POST"])
def post_sq_config():
    data = request.json or {}
    try:
        res = guardar_config_smartquote(data)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/smartquote/solicitar", methods=["POST"])
def post_sq_solicitar():
    data = request.json or {}
    codigo = data.get("codigo", "").strip()
    nombre = data.get("nombre", "").strip()
    celular = data.get("celular", "").strip()
    plan = data.get("plan", "single")
    monto = 49000 if plan == "pro" else 5000

    if not nombre or not celular:
        return jsonify({"error": "Por favor ingresa tu Nombre y Celular (WhatsApp) para generar el código."}), 400

    try:
        solicitud = crear_solicitud_licencia(codigo, nombre, celular, plan, monto)
        cfg = obtener_config_smartquote()
        raw_num = cfg.get("whatsapp_contacto") or cfg.get("llave_nequi_breb", "")
        num_digits = "".join([c for c in raw_num if c.isdigit()])
        if num_digits.startswith("57") and len(num_digits) >= 12:
            whatsapp_target = num_digits
        elif num_digits.startswith("3") and len(num_digits) == 10:
            whatsapp_target = f"57{num_digits}"
        else:
            whatsapp_target = cfg.get("whatsapp_contacto") or "573104567890"

        plan_nombre = "$49.000 COP (Plan Pro Ilimitado)" if plan == "pro" else "$5.000 COP (1 Cotización)"
        mensaje_wa = (
            f"¡Hola {cfg.get('nombre_titular', 'SmartQuote')}! 🚀\n\n"
            f"Acabo de realizar el pago para activar mi cotización.\n\n"
            f"👤 Nombre: {nombre}\n"
            f"📱 Celular: {celular}\n"
            f"🔑 Código de Verificación: {solicitud['codigo_verificacion']}\n"
            f"📄 Cotización: {codigo}\n"
            f"💰 Plan: {plan_nombre}\n\n"
            f"Adjunto el comprobante de Nequi / Bre-B para que me activen el PDF oficial limpio. ¡Muchas gracias!"
        )
        whatsapp_url = f"https://wa.me/{whatsapp_target}?text={urllib.parse.quote(mensaje_wa)}"

        return jsonify({
            "status": "ok",
            "solicitud": solicitud,
            "whatsapp_url": whatsapp_url
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/smartquote/desbloquear", methods=["POST"])
def post_sq_desbloquear():
    data = request.json or {}
    codigo = data.get("codigo", "").strip()
    codigo_o_pin = data.get("codigo_verificacion") or data.get("pin") or data.get("referencia") or ""
    codigo_o_pin = str(codigo_o_pin).strip()

    if not codigo_o_pin:
        return jsonify({"error": "Por favor ingresa tu código de verificación o PIN recibido."}), 400

    cfg = obtener_config_smartquote()
    pin_admin = cfg.get("pin_admin", "2026")

    try:
        res = verificar_codigo_solicitud(codigo, codigo_o_pin, pin_admin)
        if res.get("valido") is False:
            return jsonify(res), 400
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/smartquote/aprobar", methods=["POST"])
def post_sq_aprobar():
    data = request.json or {}
    codigo_verif = str(data.get("codigo_verificacion", "")).strip()
    pin = str(data.get("pin", "")).strip()

    cfg = obtener_config_smartquote()
    if pin != cfg.get("pin_admin", "2026"):
        return jsonify({"error": "PIN administrativo incorrecto."}), 403

    try:
        res = aprobar_solicitud_licencia(codigo_verif)
        if not res:
            return jsonify({"error": "No se encontró solicitud con ese código."}), 404
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/smartquote/adjuntar-comprobante", methods=["POST"])
def post_sq_adjuntar_comprobante():
    data = request.json or {}
    codigo = data.get("codigo", "").strip()
    comprobante_img = data.get("comprobante_img", "").strip()
    ref = data.get("referencia", "").strip()
    plan = data.get("plan", "single")

    if not codigo:
        return jsonify({"error": "Código de cotización requerido"}), 400
    if not comprobante_img:
        return jsonify({"error": "Por favor adjunta la foto o imagen de tu comprobante de pago."}), 400

    try:
        res = adjuntar_comprobante_y_aprobar(codigo, comprobante_img, ref, plan)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- FEEDBACK & MEJORAS DE CLIENTES/CONTRATISTAS -----------------
@app.route("/api/feedback", methods=["POST"])
def post_feedback():
    data = request.json or {}
    mensaje = data.get("mensaje", "").strip()
    if not mensaje:
        return jsonify({"error": "Por favor escribe lo que te gustaría agregar o mejorar."}), 400
    try:
        res = guardar_feedback(data)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/feedback", methods=["GET"])
def get_feedback():
    try:
        res = listar_feedback()
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ----------------- HEALTH CHECK -----------------
@app.route("/api/health", methods=["GET"])
def health():
    has_gemini = bool(os.environ.get("GEMINI_API_KEY"))
    return jsonify({
        "status": "online",
        "service": "SmartQuote Backend",
        "gemini_configured": has_gemini,
        "engine": "gemini-2.5-flash",
        "database": "sqlite3",
        "db_file": "smartquote.db"
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("FLASK_DEBUG", "1").lower() in ("1", "true")
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
