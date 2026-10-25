import sqlite3
import json
import hashlib
import hmac
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent / "smartquote.db"

def generar_token_seguridad(codigo: str, emisor_doc: str, total: float, anticipo: float, numero_pago: str) -> str:
    """Genera un hash criptográfico de integridad SHA-256 para prevenir hackeos, manipulación de montos o cambio de cuenta/QR."""
    secret = "SmartQuote_AntiFraud_SecretKey_2026_Colombia"
    raw = f"{codigo}|{emisor_doc}|{total:.2f}|{anticipo:.2f}|{numero_pago}"
    digest = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"SQ-SEC-{digest[:12].upper()}"

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Tabla de cotizaciones
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cotizaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        cliente TEXT NOT NULL,
        servicio TEXT NOT NULL,
        direccion TEXT,
        validez TEXT,
        margen REAL DEFAULT 35,
        contingencia REAL DEFAULT 5,
        regimen_tributario TEXT DEFAULT 'simple',
        costo_directo REAL NOT NULL,
        costo_imprevistos REAL NOT NULL,
        ganancia_neta REAL NOT NULL,
        total_cotizacion REAL NOT NULL,
        anticipo_monto REAL NOT NULL,
        abonos_monto REAL DEFAULT 0,
        estado TEXT DEFAULT 'Borrador',
        items_json TEXT NOT NULL,
        alertas_json TEXT DEFAULT '[]',
        moneda TEXT DEFAULT 'COP',
        emisor_nombre TEXT,
        emisor_doc TEXT,
        dias_entrega INTEGER DEFAULT 8,
        canal_pago TEXT DEFAULT 'nequi',
        numero_pago TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    # Migración: asegurar que columnas nuevas existan
    cursor.execute("PRAGMA table_info(cotizaciones)")
    cols = [col[1] for col in cursor.fetchall()]
    if "abonos_monto" not in cols:
        cursor.execute("ALTER TABLE cotizaciones ADD COLUMN abonos_monto REAL DEFAULT 0")
    if "comprobante_ref" not in cols:
        cursor.execute("ALTER TABLE cotizaciones ADD COLUMN comprobante_ref TEXT DEFAULT ''")
    if "comprobante_img" not in cols:
        cursor.execute("ALTER TABLE cotizaciones ADD COLUMN comprobante_img TEXT DEFAULT ''")
    if "security_token" not in cols:
        cursor.execute("ALTER TABLE cotizaciones ADD COLUMN security_token TEXT DEFAULT ''")
    if "pago_reportado_at" not in cols:
        cursor.execute("ALTER TABLE cotizaciones ADD COLUMN pago_reportado_at TEXT DEFAULT ''")
    if "licencia_pagada" not in cols:
        cursor.execute("ALTER TABLE cotizaciones ADD COLUMN licencia_pagada INTEGER DEFAULT 0")

    # Tabla de configuración de nuestra empresa (SmartQuote FinTech) para cobro de $5.000 / $49.000
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS configuracion_smartquote_empresa (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        nombre_titular TEXT DEFAULT 'Arriero Pro (David Pineda)',
        nit_titular TEXT DEFAULT 'Nequi Negocios',
        llave_nequi_breb TEXT DEFAULT '0091679903',
        qr_empresa_url TEXT DEFAULT 'assets/qr_nequi_square.png',
        link_bold_5k TEXT DEFAULT '',
        link_bold_49k TEXT DEFAULT '',
        pin_admin TEXT DEFAULT '2026',
        whatsapp_contacto TEXT DEFAULT '',
        updated_at TEXT NOT NULL
    )
    """)
    cursor.execute("PRAGMA table_info(configuracion_smartquote_empresa)")
    sq_cols = [c["name"] for c in cursor.fetchall()]
    if "whatsapp_contacto" not in sq_cols:
        cursor.execute("ALTER TABLE configuracion_smartquote_empresa ADD COLUMN whatsapp_contacto TEXT DEFAULT ''")

    cursor.execute("SELECT COUNT(*) as count FROM configuracion_smartquote_empresa WHERE id = 1")
    if cursor.fetchone()["count"] == 0:
        cursor.execute("""
        INSERT INTO configuracion_smartquote_empresa (id, nombre_titular, nit_titular, llave_nequi_breb, qr_empresa_url, link_bold_5k, link_bold_49k, pin_admin, whatsapp_contacto, updated_at)
        VALUES (1, 'Arriero Pro (David Pineda)', 'Nequi Negocios', '0091679903', 'assets/qr_nequi_square.png', '', '', '2026', '', ?)
        """, (datetime.utcnow().isoformat(),))

    # Tabla de solicitudes de licencia / pago con verificación por código y WhatsApp
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS solicitudes_licencia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_cotizacion TEXT NOT NULL,
        nombre_solicitante TEXT NOT NULL,
        celular_solicitante TEXT NOT NULL,
        codigo_verificacion TEXT NOT NULL,
        plan TEXT DEFAULT 'single',
        monto INTEGER DEFAULT 5000,
        estado TEXT DEFAULT 'pendiente',
        comprobante_img TEXT DEFAULT '',
        comprobante_ref TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        aprobado_at TEXT
    )
    """)
    cursor.execute("PRAGMA table_info(solicitudes_licencia)")
    sol_cols = [c["name"] for c in cursor.fetchall()]
    if "comprobante_img" not in sol_cols:
        cursor.execute("ALTER TABLE solicitudes_licencia ADD COLUMN comprobante_img TEXT DEFAULT ''")
    if "comprobante_ref" not in sol_cols:
        cursor.execute("ALTER TABLE solicitudes_licencia ADD COLUMN comprobante_ref TEXT DEFAULT ''")

    # Tabla de configuración de identidad del emisor / empresa
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS configuracion_emisor (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        nombre TEXT DEFAULT 'Ing. Alejandro Morales P.',
        documento TEXT DEFAULT 'NIT: 901.458.712-3',
        empresa TEXT DEFAULT 'Servicios Especializados de Ingeniería',
        telefono TEXT DEFAULT '310 456 7890',
        canal_pago TEXT DEFAULT 'nequi',
        numero_pago TEXT DEFAULT '310 456 7890',
        logo_url TEXT DEFAULT '',
        updated_at TEXT NOT NULL
    )
    """)

    # Tabla de feedback y sugerencias de contratistas y clientes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS feedback_sugerencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT DEFAULT '',
        contacto TEXT DEFAULT '',
        tipo TEXT DEFAULT 'mejora',
        mensaje TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """)

    # Inicializar emisor por defecto si está vacío
    cursor.execute("SELECT COUNT(*) as count FROM configuracion_emisor WHERE id = 1")
    if cursor.fetchone()["count"] == 0:
        cursor.execute("""
        INSERT INTO configuracion_emisor (id, nombre, documento, empresa, telefono, canal_pago, numero_pago, logo_url, updated_at)
        VALUES (1, 'Ing. Alejandro Morales P.', 'NIT: 901.458.712-3', 'Servicios Especializados de Ingeniería', '310 456 7890', 'nequi', '310 456 7890', '', ?)
        """, (datetime.utcnow().isoformat(),))

    # Índices de alto rendimiento para consultas concurrentes y búsquedas rápidas
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cotizaciones_created ON cotizaciones(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON cotizaciones(estado)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_solicitudes_codigo ON solicitudes_licencia(codigo_cotizacion, codigo_verificacion)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_sugerencias(created_at DESC)")

    conn.commit()
    conn.close()

def guardar_cotizacion(data: dict) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()

    codigo = data.get("codigo")
    if not codigo:
        # Generar código tipo COT-2025-001 basado en conteo anual
        ano = datetime.now().year
        cursor.execute("SELECT COUNT(*) as total FROM cotizaciones WHERE codigo LIKE ?", (f"COT-{ano}-%",))
        conteo = cursor.fetchone()["total"] + 1
        codigo = f"COT-{ano}-{conteo:03d}"

    items_json = json.dumps(data.get("items", []))
    alertas_json = json.dumps(data.get("alertas", []))

    cursor.execute("SELECT id FROM cotizaciones WHERE codigo = ?", (codigo,))
    row = cursor.fetchone()

    if row:
        # Actualizar existente
        cursor.execute("""
        UPDATE cotizaciones SET
            cliente = ?, servicio = ?, direccion = ?, validez = ?, margen = ?,
            contingencia = ?, regimen_tributario = ?, costo_directo = ?,
            costo_imprevistos = ?, ganancia_neta = ?, total_cotizacion = ?,
            anticipo_monto = ?, estado = ?, items_json = ?, alertas_json = ?,
            moneda = ?, emisor_nombre = ?, emisor_doc = ?, dias_entrega = ?,
            canal_pago = ?, numero_pago = ?, updated_at = ?
        WHERE codigo = ?
        """, (
            data.get("cliente", "Cliente General"),
            data.get("servicio", "Servicio Técnico"),
            data.get("direccion", ""),
            data.get("validez", "30 días calendario"),
            data.get("margen", 35),
            data.get("contingencia", 5),
            data.get("regimen_tributario", "simple"),
            data.get("costo_directo", 0),
            data.get("costo_imprevistos", 0),
            data.get("ganancia_neta", 0),
            data.get("total_cotizacion", 0),
            data.get("anticipo_monto", 0),
            data.get("estado", "Borrador"),
            items_json,
            alertas_json,
            data.get("moneda", "COP"),
            data.get("emisor_nombre", ""),
            data.get("emisor_doc", ""),
            data.get("dias_entrega", 8),
            data.get("canal_pago", "nequi"),
            data.get("numero_pago", ""),
            now,
            codigo
        ))
        cot_id = row["id"]
    else:
        # Insertar nueva cotización
        cursor.execute("""
        INSERT INTO cotizaciones (
            codigo, cliente, servicio, direccion, validez, margen, contingencia,
            regimen_tributario, costo_directo, costo_imprevistos, ganancia_neta,
            total_cotizacion, anticipo_monto, estado, items_json, alertas_json,
            moneda, emisor_nombre, emisor_doc, dias_entrega, canal_pago, numero_pago,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            codigo,
            data.get("cliente", "Cliente General"),
            data.get("servicio", "Servicio Técnico"),
            data.get("direccion", ""),
            data.get("validez", "30 días calendario"),
            data.get("margen", 35),
            data.get("contingencia", 5),
            data.get("regimen_tributario", "simple"),
            data.get("costo_directo", 0),
            data.get("costo_imprevistos", 0),
            data.get("ganancia_neta", 0),
            data.get("total_cotizacion", 0),
            data.get("anticipo_monto", 0),
            data.get("estado", "Borrador"),
            items_json,
            alertas_json,
            data.get("moneda", "COP"),
            data.get("emisor_nombre", ""),
            data.get("emisor_doc", ""),
            data.get("dias_entrega", 8),
            data.get("canal_pago", "nequi"),
            data.get("numero_pago", ""),
            now,
            now
        ))
        cot_id = cursor.lastrowid

    conn.commit()
    conn.close()
    return {"id": cot_id, "codigo": codigo, "status": "guardado"}

def listar_cotizaciones():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, codigo, cliente, servicio, total_cotizacion, anticipo_monto, COALESCE(abonos_monto, 0) as abonos_monto, estado, created_at, updated_at
    FROM cotizaciones
    ORDER BY id DESC
    """)
    rows = cursor.fetchall()
    res = [dict(r) for r in rows]
    conn.close()
    return res

def registrar_abono_cotizacion(codigo_o_id, monto: float):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    if str(codigo_o_id).isdigit():
        cursor.execute("SELECT id, codigo, total_cotizacion, COALESCE(abonos_monto, 0) as abonos_monto, estado FROM cotizaciones WHERE id = ?", (int(codigo_o_id),))
    else:
        cursor.execute("SELECT id, codigo, total_cotizacion, COALESCE(abonos_monto, 0) as abonos_monto, estado FROM cotizaciones WHERE codigo = ?", (str(codigo_o_id),))
    
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise ValueError("Cotización no encontrada")

    nuevo_abono = float(row["abonos_monto"]) + float(monto)
    total = float(row["total_cotizacion"])
    saldo = max(0.0, total - nuevo_abono)
    
    nuevo_estado = row["estado"]
    if saldo <= 0:
        nuevo_estado = "Cobrada"
    elif nuevo_abono > 0 and nuevo_estado == "Borrador":
        nuevo_estado = "Aprobada"

    if str(codigo_o_id).isdigit():
        cursor.execute("UPDATE cotizaciones SET abonos_monto = ?, estado = ?, updated_at = ? WHERE id = ?", (nuevo_abono, nuevo_estado, now, int(codigo_o_id)))
    else:
        cursor.execute("UPDATE cotizaciones SET abonos_monto = ?, estado = ?, updated_at = ? WHERE codigo = ?", (nuevo_abono, nuevo_estado, now, str(codigo_o_id)))

    conn.commit()
    conn.close()
    return {
        "status": "abono_registrado",
        "codigo": row["codigo"],
        "monto_abonado": float(monto),
        "total_abonos": nuevo_abono,
        "saldo_pendiente": saldo,
        "nuevo_estado": nuevo_estado
    }

def reportar_pago_anticipo(codigo_o_id, monto: float, ref_bancaria: str, comprobante_img: str = "") -> dict:
    """Registra de forma segura el comprobante de transferencia (CUS / Nequi / Bre-B) reportado por el cliente."""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()

    if str(codigo_o_id).isdigit():
        cursor.execute("SELECT id, codigo, total_cotizacion, COALESCE(abonos_monto, 0) as abonos_monto, estado FROM cotizaciones WHERE id = ?", (int(codigo_o_id),))
    else:
        cursor.execute("SELECT id, codigo, total_cotizacion, COALESCE(abonos_monto, 0) as abonos_monto, estado FROM cotizaciones WHERE codigo = ?", (str(codigo_o_id),))

    row = cursor.fetchone()
    if not row:
        conn.close()
        raise ValueError("Cotización no encontrada")

    nuevo_abono = float(row["abonos_monto"]) + float(monto)
    total = float(row["total_cotizacion"])
    saldo = max(0.0, total - nuevo_abono)

    nuevo_estado = "Cobrada" if saldo <= 0 else "Aprobada"
    campo_id = "id" if str(codigo_o_id).isdigit() else "codigo"
    val_id = int(codigo_o_id) if str(codigo_o_id).isdigit() else str(codigo_o_id)

    cursor.execute(f"""
    UPDATE cotizaciones SET
        abonos_monto = ?,
        comprobante_ref = ?,
        comprobante_img = ?,
        pago_reportado_at = ?,
        estado = ?,
        updated_at = ?
    WHERE {campo_id} = ?
    """, (nuevo_abono, str(ref_bancaria), str(comprobante_img or ""), now, nuevo_estado, now, val_id))

    conn.commit()
    conn.close()

    return {
        "status": "pago_reportado",
        "codigo": row["codigo"],
        "monto_reportado": float(monto),
        "total_abonos": nuevo_abono,
        "saldo_pendiente": saldo,
        "nuevo_estado": nuevo_estado,
        "comprobante_ref": ref_bancaria,
        "timestamp": now
    }

def obtener_cotizacion(codigo_o_id):
    conn = get_connection()
    cursor = conn.cursor()
    if str(codigo_o_id).isdigit():
        cursor.execute("SELECT * FROM cotizaciones WHERE id = ?", (int(codigo_o_id),))
    else:
        cursor.execute("SELECT * FROM cotizaciones WHERE codigo = ?", (str(codigo_o_id),))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["abonos_monto"] = float(d.get("abonos_monto") or 0)
    d["items"] = json.loads(d["items_json"]) if d["items_json"] else []
    d["alertas"] = json.loads(d["alertas_json"]) if d["alertas_json"] else []
    
    # Asegurar token criptográfico antifraude si no está persistido
    if not d.get("security_token"):
        d["security_token"] = generar_token_seguridad(
            d.get("codigo", ""),
            d.get("emisor_doc", ""),
            float(d.get("total_cotizacion", 0)),
            float(d.get("anticipo_monto", 0)),
            d.get("numero_pago", "")
        )
    return d

def actualizar_estado_cotizacion(codigo_o_id, nuevo_estado: str):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    if str(codigo_o_id).isdigit():
        cursor.execute("UPDATE cotizaciones SET estado = ?, updated_at = ? WHERE id = ?", (nuevo_estado, now, int(codigo_o_id)))
    else:
        cursor.execute("UPDATE cotizaciones SET estado = ?, updated_at = ? WHERE codigo = ?", (nuevo_estado, now, str(codigo_o_id)))
    conn.commit()
    conn.close()
    return {"status": "actualizado", "nuevo_estado": nuevo_estado}

def eliminar_cotizacion(codigo_o_id):
    conn = get_connection()
    cursor = conn.cursor()
    if str(codigo_o_id).isdigit():
        cursor.execute("DELETE FROM cotizaciones WHERE id = ?", (int(codigo_o_id),))
    else:
        cursor.execute("DELETE FROM cotizaciones WHERE codigo = ?", (str(codigo_o_id),))
    conn.commit()
    conn.close()
    return {"status": "eliminado"}

def obtener_emisor():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM configuracion_emisor WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {}

def guardar_emisor(data: dict):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute("""
    UPDATE configuracion_emisor SET
        nombre = ?, documento = ?, empresa = ?, telefono = ?,
        canal_pago = ?, numero_pago = ?, logo_url = ?, updated_at = ?
    WHERE id = 1
    """, (
        data.get("nombre", "Ing. Alejandro Morales P."),
        data.get("documento", "NIT: 901.458.712-3"),
        data.get("empresa", "Servicios Especializados de Ingeniería"),
        data.get("telefono", "310 456 7890"),
        data.get("canal_pago", "nequi"),
        data.get("numero_pago", "310 456 7890"),
        data.get("logo_url", ""),
        now
    ))
    conn.commit()
    conn.close()
    return {"status": "emisor_actualizado"}

def obtener_config_smartquote():
    """Obtiene los datos oficiales de recaudo de nuestra empresa SmartQuote ($5.000 / $49.000)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM configuracion_smartquote_empresa WHERE id = 1")
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {}

def guardar_config_smartquote(data: dict):
    """Guarda o actualiza la cuenta y QR oficial de SmartQuote para recibir los cobros a los usuarios."""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute("""
    UPDATE configuracion_smartquote_empresa SET
        nombre_titular = ?, nit_titular = ?, llave_nequi_breb = ?,
        qr_empresa_url = ?, link_bold_5k = ?, link_bold_49k = ?,
        pin_admin = ?, whatsapp_contacto = ?, updated_at = ?
    WHERE id = 1
    """, (
        data.get("nombre_titular", "Arriero Pro (David Pineda)"),
        data.get("nit_titular", "Nequi Negocios"),
        data.get("llave_nequi_breb", "0091679903"),
        data.get("qr_empresa_url", "assets/qr_nequi_square.png"),
        data.get("link_bold_5k", ""),
        data.get("link_bold_49k", ""),
        data.get("pin_admin", "2026"),
        data.get("whatsapp_contacto", ""),
        now
    ))
    conn.commit()
    conn.close()
    return {"status": "config_smartquote_actualizada"}

def desbloquear_licencia_smartquote(codigo_cotizacion: str, tipo_plan: str = "single", referencia_pago: str = ""):
    """Desbloquea el documento PDF limpio sin marca de agua para una cotización o para todo el usuario."""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    if codigo_cotizacion:
        cursor.execute("UPDATE cotizaciones SET licencia_pagada = 1, updated_at = ? WHERE codigo = ?", (now, codigo_cotizacion))
    conn.commit()
    conn.close()
    return {
        "status": "licencia_activada",
        "codigo": codigo_cotizacion,
        "plan": tipo_plan,
        "referencia": referencia_pago,
        "pdf_limpio_desbloqueado": True
    }

def crear_solicitud_licencia(codigo_cotizacion: str, nombre: str, celular: str, plan: str = "single", monto: int = 5000):
    import random
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    codigo_verificacion = f"{random.randint(1000, 9999)}"
    cursor.execute("""
    INSERT INTO solicitudes_licencia (codigo_cotizacion, nombre_solicitante, celular_solicitante, codigo_verificacion, plan, monto, estado, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)
    """, (codigo_cotizacion, nombre.strip(), celular.strip(), codigo_verificacion, plan, monto, now))
    solicitud_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {
        "id": solicitud_id,
        "codigo_cotizacion": codigo_cotizacion,
        "nombre": nombre,
        "celular": celular,
        "codigo_verificacion": codigo_verificacion,
        "plan": plan,
        "monto": monto,
        "estado": "pendiente"
    }

def aprobar_solicitud_licencia(codigo_verificacion: str):
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute("SELECT * FROM solicitudes_licencia WHERE codigo_verificacion = ?", (codigo_verificacion.strip(),))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    cursor.execute("""
    UPDATE solicitudes_licencia SET estado = 'aprobado', aprobado_at = ? WHERE id = ?
    """, (now, row["id"]))
    if row["codigo_cotizacion"]:
        cursor.execute("UPDATE cotizaciones SET licencia_pagada = 1, updated_at = ? WHERE codigo = ?", (now, row["codigo_cotizacion"]))
    conn.commit()
    conn.close()
    return {
        "status": "aprobado",
        "codigo_verificacion": codigo_verificacion,
        "codigo_cotizacion": row["codigo_cotizacion"]
    }

def verificar_codigo_solicitud(codigo_cotizacion: str, codigo_o_pin: str, pin_admin: str = "2026"):
    codigo_o_pin = str(codigo_o_pin).strip()
    if codigo_o_pin == pin_admin:
        return desbloquear_licencia_smartquote(codigo_cotizacion, "single", f"PIN-ADMIN-{pin_admin}")
    
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM solicitudes_licencia 
    WHERE codigo_cotizacion = ? AND codigo_verificacion = ?
    ORDER BY id DESC LIMIT 1
    """, (codigo_cotizacion, codigo_o_pin))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return {"error": "Código o PIN no reconocido. Verifica el número o solicítalo por WhatsApp.", "valido": False}
    
    if row["estado"] == "aprobado":
        return desbloquear_licencia_smartquote(codigo_cotizacion, row["plan"], f"VERIF-{codigo_o_pin}")
    
    return {
        "status": "pendiente",
        "mensaje": "Tu comprobante está en revisión. Envía el pantallazo a nuestro WhatsApp o pide tu PIN de activación.",
        "codigo_verificacion": codigo_o_pin,
        "valido": True
    }

def adjuntar_comprobante_y_aprobar(codigo_cotizacion: str, comprobante_img: str, comprobante_ref: str = "", plan: str = "single"):
    """Guarda el comprobante de pago subido por el usuario y aprueba de inmediato la licencia para descargar el PDF limpio."""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    if codigo_cotizacion:
        cursor.execute("""
        UPDATE cotizaciones 
        SET licencia_pagada = 1, comprobante_img = ?, comprobante_ref = ?, pago_reportado_at = ?, updated_at = ?
        WHERE codigo = ?
        """, (comprobante_img, comprobante_ref, now, now, codigo_cotizacion))
        
    cursor.execute("""
    UPDATE solicitudes_licencia
    SET estado = 'aprobado', comprobante_img = ?, comprobante_ref = ?, aprobado_at = ?
    WHERE codigo_cotizacion = ?
    """, (comprobante_img, comprobante_ref, now, codigo_cotizacion))
    
    conn.commit()
    conn.close()
    return {
        "status": "aprobado",
        "codigo": codigo_cotizacion,
        "plan": plan,
        "comprobante_guardado": True,
        "pdf_limpio_desbloqueado": True
    }

def guardar_feedback(data: dict):
    """Guarda una sugerencia, idea o reporte de mejora enviado por un contratista o cliente."""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    nombre = data.get("nombre", "").strip()
    contacto = data.get("contacto", "").strip()
    tipo = data.get("tipo", "mejora").strip()
    mensaje = data.get("mensaje", "").strip()

    cursor.execute("""
    INSERT INTO feedback_sugerencias (nombre, contacto, tipo, mensaje, created_at)
    VALUES (?, ?, ?, ?, ?)
    """, (nombre, contacto, tipo, mensaje, now))
    fid = cursor.lastrowid
    conn.commit()
    conn.close()
    return {
        "status": "guardado",
        "id": fid,
        "mensaje": "¡Gracias por tu aporte! Tu sugerencia fue recibida y nos ayuda a mejorar SmartQuote para toda Colombia."
    }

def listar_feedback():
    """Retorna todas las sugerencias y mejoras registradas."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM feedback_sugerencias ORDER BY id DESC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows
