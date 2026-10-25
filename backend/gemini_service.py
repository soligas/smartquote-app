import os
import re
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Cargar variables de entorno desde .env
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# Esquema estricto que Gemini debe devolver obligatoriamente
class CotizacionItem(BaseModel):
    descripcion: str = Field(description="Nombre técnico del material o servicio")
    categoria: str = Field(description="'Materiales', 'Mano de obra' o 'Servicios'")
    cantidad: float = Field(description="Cantidad requerida")
    costo_unitario_estimado: float = Field(description="Costo base en moneda local")

class PropuestaEstructurada(BaseModel):
    titulo_proyecto: str = Field(description="Título formal y técnico del proyecto")
    items: list[CotizacionItem] = Field(description="Lista desglosada de insumos, servicios y mano de obra")
    alertas_imprevistos: list[str] = Field(description="Costos ocultos que el usuario olvidó incluir")
    tiempo_estimado_dias: int = Field(description="Tiempo estimado de ejecución en días hábiles")
    condiciones_pago: str = Field(description="Condición comercial sugerida (ej. 50% anticipo, 50% contraentrega)")

# Base de conocimiento experta en Construcción y Remodelaciones en Colombia (APU - Precios 2026)
CATALOGO_DESGLOSE_OFICIOS = {
    "remodelacion_casa": {
        "keywords": ["remodelar mi casa", "remodelar la casa", "remodelacion de casa", "remodelacion casa", "remodelar apartamento", "remodelar apto", "remodelacion completa"],
        "titulo": "Remodelación Integral de Vivienda y Acabados de Obra Blanca",
        "dias": 20,
        "items": [
            ("Demolición de muros, retiro de escombros y cargue de volqueta", "Servicios", 2, 380000),
            ("Bultos de cemento gris Argos 50kg y arena lavada", "Materiales", 18, 36000),
            ("Estuco plástico interior y lija para preparación de muros", "Materiales", 6, 85000),
            ("Pintura Vinilo Tipo 1 lavable (Cuñete Koraza / Pintuco)", "Materiales", 3, 240000),
            ("Piso porcelanato / cerámica 60x60 antideslizante (cajas)", "Materiales", 22, 62000),
            ("Pegante cerámico Corona / Pegacor gris y blanco (bultos)", "Materiales", 8, 38000),
            ("Mano de obra oficial de obra y ayudante (Jornales de obra blanca)", "Mano de obra", 18, 140000),
            ("Acarreo y flete urbano de materiales de ferretería y volqueta", "Servicios", 2, 120000),
            ("Aseo general fino y entrega de acabados", "Servicios", 1, 160000)
        ],
        "alertas": [
            "Póliza de ARL vigente para todo el personal que ingresa a la obra",
            "Permiso de administración del edificio y horarios restringidos de ruido",
            "Costos imprevistos de tuberías hidráulicas o eléctricas ocultas deterioradas"
        ]
    },
    "remodelacion_bano": {
        "keywords": ["bano", "baño", "remodelar bano", "remodelar baño", "enchapar bano", "ducha"],
        "titulo": "Remodelación de Baño, Enchape e Impermeabilización",
        "dias": 7,
        "items": [
            ("Enchape cerámico / porcelanato para muros y piso (cajas)", "Materiales", 8, 58000),
            ("Pegante cerámico impermeable Pegacor y boquilla anti-hongos", "Materiales", 4, 39000),
            ("Impermeabilizante para zona húmeda (Sika 101 o similar)", "Materiales", 2, 75000),
            ("Juego de grifería ahorradora, ducha monocontrol y desagüe", "Materiales", 1, 290000),
            ("Sanitario ecológico doble descarga y lavamanos con pedestal", "Materiales", 1, 480000),
            ("Tubería PVC sanitaria, codos, sifón y accesorios de desagüe", "Materiales", 1, 125000),
            ("Mano de obra oficial plomero y enchapador con ayudante", "Mano de obra", 6, 150000),
            ("Retiro y acarreo de escombros de enchape anterior", "Servicios", 1, 90000)
        ],
        "alertas": [
            "Revisión de pendientes de desagüe para evitar encharcamientos en la ducha",
            "Instalación de válvula de paso independiente para cortes de emergencia",
            "Silicona antihongos en bordes de lavamanos y sanitarios"
        ]
    },
    "remodelacion_cocina": {
        "keywords": ["cocina", "remodelar cocina", "cocina integral", "mesón", "meson"],
        "titulo": "Remodelación de Cocina Integral y Red de Gas / Hidráulica",
        "dias": 10,
        "items": [
            ("Mueble superior e inferior en aglomerado RH resistente a humedad", "Materiales", 1, 1650000),
            ("Mesón en granito natural / cuarzo pulido con poceta", "Materiales", 1, 850000),
            ("Grifería de cocina cuello de ganso flexible e instalación", "Materiales", 1, 185000),
            ("Enchape salpicadero tipo metro / cerámica decorativa", "Materiales", 3, 52000),
            ("Punto de gas certificado y manguera flexible de seguridad", "Materiales", 1, 110000),
            ("Mano de obra ensamble, nivelación e instalación hidráulica", "Mano de obra", 5, 160000),
            ("Transporte especializado y flete de muebles", "Servicios", 1, 95000)
        ],
        "alertas": [
            "Prueba de estanqueidad de gas y certificación técnica",
            "Tomas eléctricas independientes para horno microondas y licuadora",
            "Sellado perimetral del mesón con poliuretano no corrosivo"
        ]
    },
    "pintura": {
        "keywords": ["pintar", "pintura", "estucar", "resanar", "pintor", "fachada"],
        "titulo": "Servicio de Pintura Arquitectónica, Resane y Estuco",
        "dias": 4,
        "items": [
            ("Cuñete de pintura Vinilo Tipo 1 lavable Pintuco", "Materiales", 2, 235000),
            ("Galón de esmalte sintético para marcos y puertas metálicas", "Materiales", 1, 78000),
            ("Cuñete de estuco plástico para resanes profundos", "Materiales", 1, 95000),
            ("Lijas de agua, espátulas, rodillos y brochas de cerda fina", "Materiales", 1, 65000),
            ("Plásticos de protección de pisos y cinta de enmascarar", "Materiales", 3, 22000),
            ("Mano de obra pintor profesional certificado", "Mano de obra", 4, 130000)
        ],
        "alertas": [
            "Limpieza y raspado previo de pintura soplada o con humedad",
            "Mínimo 2 a 3 manos de pintura para cobertura uniforme de color",
            "Protección de muebles y zócalos antes de iniciar"
        ]
    },
    "plomeria": {
        "keywords": ["plomero", "tuberia", "tubería", "gotera", "fuga", "hidraulico", "hidráulico", "hidraulica"],
        "titulo": "Reparación y Reposición de Red Hidráulica y Sanitaria",
        "dias": 2,
        "items": [
            ("Tubos de PVC presión RDE 13.5 y accesorios (codos, tees)", "Materiales", 4, 28000),
            ("Soldadura PVC y limpiador desengrasante Pavco", "Materiales", 2, 24000),
            ("Válvula de corte de bola 1/2 pulgada en bronce", "Materiales", 2, 38000),
            ("Mortero y cemento gris para tapado de regatas", "Materiales", 1, 42000),
            ("Mano de obra técnico plomero especialista en detección de fugas", "Mano de obra", 2, 160000)
        ],
        "alertas": [
            "Prueba de presión con manómetro antes de resanar la pared",
            "Verificar si se requiere permiso de suspensión de agua comunitaria"
        ]
    },
    "electricidad": {
        "keywords": ["electrico", "eléctrico", "electricista", "tomas", "breakers", "cableado", "lamparas", "luces", "panel"],
        "titulo": "Adecuación de Red Eléctrica e Iluminación LED",
        "dias": 3,
        "items": [
            ("Rollo de cable de cobre Centelsa calibre 12 AWG (100m)", "Materiales", 1, 260000),
            ("Tomas dobles polarizadas con polo a tierra y placas", "Materiales", 8, 16500),
            ("Interruptores conmutables y sencillos", "Materiales", 4, 14000),
            ("Tacos breakers termomagnéticos 15A/20A Legrand", "Materiales", 3, 28000),
            ("Panel LED sobreponer / incrustar luz cálida o blanca 18W", "Materiales", 6, 26000),
            ("Mano de obra técnico electricista certificado con tarjeta Conte", "Mano de obra", 3, 150000)
        ],
        "alertas": [
            "Cumplimiento de norma técnica RETIE en calibres de cableado",
            "Balanceo de cargas en el tablero general de distribución"
        ]
    },
    "drywall": {
        "keywords": ["drywall", "muro liviano", "superboard", "cielo raso", "panel yeso"],
        "titulo": "Instalación de Muro Liviano en Drywall y Cielo Raso",
        "dias": 4,
        "items": [
            ("Láminas de panel yeso Gyplac 1/2 pulgada estándar", "Materiales", 8, 38500),
            ("Perfiles metálicos canal y parales galvanizados cal. 26", "Materiales", 14, 18500),
            ("Tornillos drywall estructura y punta fina (caja)", "Materiales", 2, 26000),
            ("Cinta de papel microperforada y masilla para juntas (cuñete)", "Materiales", 1, 98000),
            ("Lana de fibra de vidrio aislante acústico / térmico", "Materiales", 2, 85000),
            ("Mano de obra especialista instalador drywall y masillador", "Mano de obra", 4, 140000),
            ("Acarreo y flete urbano de láminas", "Servicios", 1, 75000)
        ],
        "alertas": [
            "Espaciado de parales a máximo 40.7 cm o 61 cm según altura",
            "Mínimo 3 manos de masilla lijadas suavemente para juntas invisibles"
        ]
    }
}

def _generar_propuesta_fallback(texto_usuario: str, moneda: str = "COP") -> PropuestaEstructurada:
    """Generador inteligente que identifica la necesidad del usuario y desglosa materiales y mano de obra reales."""
    txt_lower = texto_usuario.lower().strip()
    
    # 1. Buscar coincidencia con la base de conocimiento de oficios y remodelaciones
    for clave, data in CATALOGO_DESGLOSE_OFICIOS.items():
        if any(kw in txt_lower for kw in data["keywords"]):
            items_res = [
                CotizacionItem(
                    descripcion=it[0],
                    categoria=it[1],
                    cantidad=float(it[2]),
                    costo_unitario_estimado=float(it[3])
                )
                for it in data["items"]
            ]
            return PropuestaEstructurada(
                titulo_proyecto=data["titulo"],
                items=items_res,
                alertas_imprevistos=data["alertas"],
                tiempo_estimado_dias=data["dias"],
                condiciones_pago="50% Anticipo de inicio, 50% Acta de entrega y liquidación"
            )

    # 2. Si no es una remodelación general, parsear oraciones o listas que el usuario escribió
    items = []
    fragmentos = re.split(r",|\sy\s|\se\s|\n|;|\+", texto_usuario, flags=re.IGNORECASE)
    
    for f in fragmentos:
        txt = f.strip()
        if not txt or len(txt) < 3:
            continue
        
        costo = 95000.0
        qty = 1.0
        categoria = "Materiales"
        
        # Clasificación por categoría
        if any(w in txt.lower() for w in ["pintor", "oficial", "ayudante", "plomero", "electricista", "instalador", "mano de obra", "jornal", "maestro"]):
            categoria = "Mano de obra"
            costo = 140000.0
        elif any(w in txt.lower() for w in ["transporte", "flete", "acarreo", "alquiler", "andamio", "servicio", "volqueta"]):
            categoria = "Servicios"
            costo = 80000.0

        # Detectar costos tipo '90mil', '90k', o '$90000'
        mil_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:mil|k)", txt, re.IGNORECASE)
        if mil_match:
            costo = float(mil_match.group(1)) * 1000.0
        else:
            num_match = re.search(r"\$?(\d{1,3}(?:\.\d{3})+|\d{4,9})", txt)
            if num_match:
                costo = float(num_match.group(1).replace(".", ""))

        # Detectar cantidad al inicio (ej: "3 bultos de cemento", "10 metros de cable")
        qty_match = re.match(r"^(\d+(?:\.\d+)?)\s*(?:bultos?|metros?|m2|m3|unid|unidades?|cajas?|galones?|cuñetes?|tarros?|jornales?|dias?|horas?)?\s*(?:de\s+)?(.+)", txt, re.IGNORECASE)
        if qty_match:
            qty = float(qty_match.group(1))
            desc = qty_match.group(2)
        else:
            desc = txt
            
        # Limpiar texto del costo dentro del nombre del ítem
        desc_limpia = re.sub(r"\$?\d+[\d\.,]*(?:\s*(?:mil|k))?", "", desc, flags=re.IGNORECASE)
        desc_limpia = re.sub(r"\b(por|a|de|c/u)\s*$", "", desc_limpia, flags=re.IGNORECASE).strip()
        if not desc_limpia:
            desc_limpia = desc.strip()

        items.append(CotizacionItem(
            descripcion=desc_limpia.capitalize(),
            categoria=categoria,
            cantidad=qty,
            costo_unitario_estimado=costo
        ))

    # 3. Si no pudo extraer ítems específicos del texto, generar desglose inteligente estándar
    if not items:
        items = [
            CotizacionItem(descripcion="Materiales e insumos principales requeridos", categoria="Materiales", cantidad=1.0, costo_unitario_estimado=450000.0),
            CotizacionItem(descripcion="Mano de obra calificada (Oficial y ayudante)", categoria="Mano de obra", cantidad=3.0, costo_unitario_estimado=130000.0),
            CotizacionItem(descripcion="Transporte, acarreo de materiales y flete", categoria="Servicios", cantidad=1.0, costo_unitario_estimado=70000.0),
        ]

    # Alertas de imprevistos detectadas inteligentemente
    alertas = [
        "Flete y acarreos de escombros/materiales hacia el sitio de trabajo",
        "Tornillería, selladores o consumibles menores (reserva del 5% al 10%)",
        "Seguridad social, EPP y afiliación ARL obligatoria del personal"
    ]

    # Título dinámico basado en lo que escribió el usuario
    titulo_gen = "Ejecución de Obra: " + (texto_usuario[:45].capitalize() + ("..." if len(texto_usuario) > 45 else ""))

    return PropuestaEstructurada(
        titulo_proyecto=titulo_gen,
        items=items,
        alertas_imprevistos=alertas,
        tiempo_estimado_dias=6,
        condiciones_pago="50% Anticipo de inicio, 50% Contraentrega"
    )

def optimizar_alcance_con_ia(texto_usuario: str, moneda: str = "COP") -> PropuestaEstructurada:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        # Usar motor heurístico experto con catálogo APU colombiano
        return _generar_propuesta_fallback(texto_usuario, moneda)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = f"""
        Eres un ingeniero civil y cotizador experto en construcción, remodelaciones y oficios independientes en Colombia.
        El usuario ingresó esta necesidad informal:
        "{texto_usuario}"
        
        INSTRUCCIÓN CRÍTICA:
        - Si el usuario dice algo general como "quiero remodelar mi casa", "remodelar baño", "pintar un apartamento", NO devuelvas un solo ítem vago.
        - DESGLOSA OBLIGATORIAMENTE TODOS los materiales que se necesitan (cemento, arena, pegantes, pintura, enchape, tubería, tornillos, etc.), la mano de obra (oficial, ayudante, pintor) con sus jornales, y los servicios (fletes, botada de escombros).
        - Asígnale a cada ítem cantidades y costos unitarios realistas en moneda {moneda} del mercado colombiano actual 2026.
        - Detecta costos ocultos (imprevistos) que el cliente o contratista suele olvidar (ARL, permisos, tuberías viejas, fletes).
        """

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PropuestaEstructurada,
                temperature=0.2,
            ),
        )
        if response.parsed:
            return response.parsed
        return _generar_propuesta_fallback(texto_usuario, moneda)
    except Exception as exc:
        print(f"Advertencia al consultar Gemini API: {exc}. Usando motor heurístico colombiano.")
        return _generar_propuesta_fallback(texto_usuario, moneda)

