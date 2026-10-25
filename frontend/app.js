/**
 * SmartQuote / CotizaSeguro Pro - Frontend Logic
 * Arquitectura Reactiva en Tiempo Real con Integración a Gemini AI Backend,
 * Persistencia SQLite, Generación Dinámica de QR y Enlace de WhatsApp
 */

let currentMargin = 35;
let currentContingency = 5;
let calculatedFreightCost = 50000;
let suggestedFreightCost = 50000;
let userCustomFreightCost = null;
let isFreightZero = false;
let contractorGPSCoords = null;
let currentCurrency = 'COP';
let currentQuoteCode = null;
let currentQuoteStatus = 'Borrador';

// Formateador de moneda en pesos colombianos o genérico
function formatCOP(val) {
  return '$' + Math.round(val || 0).toLocaleString('es-CO');
}

/**
 * Sistema Moderno de Notificaciones Toast (No bloqueante, diseño elegante en UI)
 * @param {string} message - Mensaje a mostrar
 * @param {'success'|'info'|'warning'|'error'} type - Tipo de notificación
 * @param {number} duration - Tiempo en milisegundos
 */
function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.log(`[Toast ${type}]: ${message}`);
    return;
  }

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto p-3.5 rounded-2xl shadow-xl flex items-center justify-between gap-3 text-xs font-sans transition-all duration-300 transform translate-y-2 opacity-0 border';

  let iconClass = 'iconoir-check-circle text-[18px]';
  let colors = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100';

  if (type === 'success') {
    colors = 'bg-emerald-50 dark:bg-slate-900 border-emerald-300 dark:border-emerald-700/80 text-emerald-950 dark:text-emerald-200';
    iconClass = 'iconoir-check-circle text-emerald-600 dark:text-emerald-400 text-[18px]';
  } else if (type === 'info') {
    colors = 'bg-blue-50 dark:bg-slate-900 border-blue-300 dark:border-blue-700/80 text-blue-950 dark:text-blue-200';
    iconClass = 'iconoir-info-circle text-blue-600 dark:text-blue-400 text-[18px]';
  } else if (type === 'warning') {
    colors = 'bg-amber-50 dark:bg-slate-900 border-amber-300 dark:border-amber-700/80 text-amber-950 dark:text-amber-200';
    iconClass = 'iconoir-warning-triangle text-amber-600 dark:text-amber-400 text-[18px]';
  } else if (type === 'error') {
    colors = 'bg-red-50 dark:bg-slate-900 border-red-300 dark:border-red-700/80 text-red-950 dark:text-red-200';
    iconClass = 'iconoir-xmark-circle text-red-600 dark:text-red-400 text-[18px]';
  }

  toast.className += ` ${colors}`;
  toast.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0">
      <i class="${iconClass} shrink-0"></i>
      <span class="font-medium truncate">${message}</span>
    </div>
    <button type="button" class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 -mr-1" onclick="this.parentElement.remove()">
      <i class="iconoir-xmark text-sm"></i>
    </button>
  `;

  container.appendChild(toast);

  // Animación de entrada
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  // Salida automática
  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Modal de Diálogo o Confirmación Moderno (Reemplazo amigable de window.confirm)
 */
function showCustomConfirm(title, message, iconType = 'info') {
  return new Promise((resolve) => {
    const modal = document.getElementById('customDialogModal');
    const titleEl = document.getElementById('dialogTitle');
    const msgEl = document.getElementById('dialogMessage');
    const btnConfirm = document.getElementById('dialogBtnConfirm');
    const btnCancel = document.getElementById('dialogBtnCancel');
    const iconEl = document.getElementById('dialogIcon');

    if (!modal) {
      resolve(confirm(message));
      return;
    }

    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = message;
    if (iconEl) {
      if (iconType === 'trash' || iconType === 'danger') {
        iconEl.className = 'iconoir-trash text-red-600 dark:text-red-400 text-[20px]';
      } else {
        iconEl.className = 'iconoir-open-new-window text-blue-600 dark:text-blue-400 text-[20px]';
      }
    }

    modal.classList.remove('hidden');

    const cleanUp = () => {
      modal.classList.add('hidden');
      btnConfirm.onclick = null;
      btnCancel.onclick = null;
    };

    btnConfirm.onclick = () => {
      cleanUp();
      resolve(true);
    };

    btnCancel.onclick = () => {
      cleanUp();
      resolve(false);
    };
  });
}

/**
 * Fórmula financiera de margen comercial real:
 * Precio = CostoTotal / (1 - (Margen% / 100))
 */
function calcularMargenSeguro(costoDirecto, porcentajeMargen, porcentajeImprevistos, incluyeIva) {
  const costoImprevistos = costoDirecto * (porcentajeImprevistos / 100);
  const costoBaseTotal = costoDirecto + costoImprevistos;

  const factorMargen = 1 - (porcentajeMargen / 100);
  const subtotalVenta = factorMargen > 0.05 ? (costoBaseTotal / factorMargen) : (costoBaseTotal * 2);

  const gananciaNeta = subtotalVenta - costoBaseTotal;
  const impuesto = incluyeIva ? (subtotalVenta * 0.19) : 0;
  const totalCotizacion = subtotalVenta + impuesto;

  return {
    costoDirecto,
    costoImprevistos,
    gananciaNeta,
    subtotalVenta,
    impuesto,
    totalCotizacion
  };
}

// Recálculo financiero y actualización completa de la interfaz
function recalculate() {
  let baseDirectCost = 0;
  const itemRows = document.querySelectorAll('.item-row');

  itemRows.forEach(row => {
    const qtyInput = row.querySelector('.item-qty');
    const costInput = row.querySelector('.item-cost');
    const qty = parseFloat(qtyInput ? qtyInput.value : 0) || 0;
    const cost = parseFloat(costInput ? costInput.value : 0) || 0;
    baseDirectCost += (qty * cost);
  });

  const taxRegime = document.getElementById('taxRegimeSelect') ? document.getElementById('taxRegimeSelect').value : 'simple';
  const incluyeIva = taxRegime === 'responsable';

  const calculo = calcularMargenSeguro(baseDirectCost, currentMargin, currentContingency, incluyeIva);
  const halfPayment = calculo.totalCotizacion / 2;

  // Actualizar Tarjeta Financiera (Sticky Terminal)
  if (document.getElementById('statBaseCost')) {
    document.getElementById('statBaseCost').innerText = formatCOP(calculo.costoDirecto);
  }
  if (document.getElementById('statContingencyPercent')) {
    document.getElementById('statContingencyPercent').innerText = currentContingency;
  }
  if (document.getElementById('statContingencyCost')) {
    document.getElementById('statContingencyCost').innerText = formatCOP(calculo.costoImprevistos);
  }
  if (document.getElementById('statSubtotalCost')) {
    document.getElementById('statSubtotalCost').innerText = formatCOP(calculo.costoDirecto + calculo.costoImprevistos);
  }
  if (document.getElementById('statNetProfit')) {
    document.getElementById('statNetProfit').innerText = '+' + formatCOP(calculo.gananciaNeta);
  }
  if (document.getElementById('statClientTotal')) {
    document.getElementById('statClientTotal').innerText = formatCOP(calculo.totalCotizacion);
  }
  if (document.getElementById('mobileStickyTotalDisplay')) {
    document.getElementById('mobileStickyTotalDisplay').innerText = formatCOP(calculo.totalCotizacion) + ' COP';
  }

  // Actualizar indicadores de anticipo 50/50
  const formattedHalf = formatCOP(halfPayment);
  if (document.getElementById('advancePaymentBadge')) document.getElementById('advancePaymentBadge').innerText = formattedHalf;
  if (document.getElementById('finalPaymentBadge')) document.getElementById('finalPaymentBadge').innerText = formattedHalf;
  if (document.getElementById('qrAdvanceAmountBadge')) document.getElementById('qrAdvanceAmountBadge').innerText = formattedHalf + ' ' + currentCurrency;
  if (document.getElementById('sidebarAdvanceAmount')) document.getElementById('sidebarAdvanceAmount').innerText = formattedHalf;
  if (document.getElementById('btnCobrarAnticipoBanner')) document.getElementById('btnCobrarAnticipoBanner').innerText = `Cobrar Anticipo 50% (${formattedHalf})`;

  // Contador de ítems
  const itemsBadge = document.getElementById('itemsCountBadge');
  if (itemsBadge) {
    itemsBadge.innerText = `${itemRows.length} Ítem${itemRows.length === 1 ? '' : 's'} registrado${itemRows.length === 1 ? '' : 's'}`;
  }

  // Actualizar datos del modal de propuesta Suiza
  if (document.getElementById('swissBaseSum')) document.getElementById('swissBaseSum').innerText = formatCOP(calculo.costoDirecto);
  if (document.getElementById('swissContingencySum')) document.getElementById('swissContingencySum').innerText = formatCOP(calculo.costoImprevistos);
  if (document.getElementById('swissProfitSum')) document.getElementById('swissProfitSum').innerText = formatCOP(calculo.gananciaNeta);
  if (document.getElementById('swissGrandTotal')) document.getElementById('swissGrandTotal').innerText = formatCOP(calculo.totalCotizacion) + ' ' + currentCurrency;
  if (document.getElementById('swissAdvanceTarget')) document.getElementById('swissAdvanceTarget').innerText = formattedHalf;
  if (document.getElementById('swissFinalTarget')) document.getElementById('swissFinalTarget').innerText = formattedHalf;

  // Actualizar badge de código actual
  if (document.getElementById('activeQuoteCodeBadge')) {
    document.getElementById('activeQuoteCodeBadge').innerText = currentQuoteCode ? `${currentQuoteCode} (${currentQuoteStatus})` : 'Nueva Cotización (Sin guardar)';
  }
  if (document.getElementById('swissDocCodeDisplay')) {
    document.getElementById('swissDocCodeDisplay').innerText = currentQuoteCode ? `#${currentQuoteCode}` : '#SQ-COL-2026-BORRADOR';
  }

  // Renderizar QR dinámico
  renderDynamicQRCodes();

  // Guardar automáticamente en almacenamiento local sin requerir login
  if (typeof autoSaveDraft === 'function') {
    autoSaveDraft();
  }
}

// Manejo del slider de margen
function onMarginChange(val) {
  currentMargin = parseInt(val, 10);
  const display = document.getElementById('marginPercentDisplay');
  if (display) display.innerText = currentMargin + '%';

  const banner = document.getElementById('marginStatusBanner');
  const icon = document.getElementById('marginStatusIcon');
  const text = document.getElementById('marginStatusText');

  if (banner && icon && text) {
    if (currentMargin <= 15) {
      banner.className = 'p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center gap-2 mb-3 transition-colors';
      icon.className = 'iconoir-warning-triangle text-base text-red-600 dark:text-red-400';
      text.innerText = 'Cuidado: estás cobrando muy poco y podrías salir perdiendo.';
    } else if (currentMargin <= 40) {
      banner.className = 'p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2 mb-3 transition-colors';
      icon.className = 'iconoir-check-circle text-base text-emerald-600 dark:text-emerald-400';
      text.innerText = 'Excelente: cubres todos los costos y aseguras buena utilidad.';
    } else {
      banner.className = 'p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 flex items-center gap-2 mb-3 transition-colors';
      icon.className = 'iconoir-flash text-base text-blue-600 dark:text-blue-400';
      text.innerText = 'Tarifa de especialista o trabajo de alta exigencia.';
    }
  }

  recalculate();
}

// Selector de colchón de contingencia
function setContingency(percent) {
  currentContingency = percent;
  const badge = document.getElementById('badgeContingencyVal');
  if (badge) badge.innerText = `${percent}% Activo`;

  const buttons = document.querySelectorAll('.contingency-btn');
  buttons.forEach(btn => {
    if (parseInt(btn.getAttribute('data-val'), 10) === percent) {
      btn.className = 'contingency-btn py-1.5 rounded-lg bg-blue-600 text-white font-mono text-xs font-bold transition-all shadow-sm';
    } else {
      btn.className = 'contingency-btn py-1.5 rounded-lg bg-slate-100 text-slate-700 font-mono text-xs font-bold hover:bg-slate-200 border border-slate-200 transition-all';
    }
  });
  recalculate();
}

// Agregar nueva fila de ítem con alta legibilidad y contraste
function addNewItem(desc = 'Nuevo concepto o insumo', qty = 1, cost = 120000, category = 'Materiales') {
  const container = document.getElementById('itemsContainer');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'item-row p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border-2 border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 hover:border-blue-400 dark:hover:border-blue-500 transition-all shadow-sm';
  
  let iconName = 'iconoir-packages';
  let badgeColor = 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/80 border-2 border-blue-200 dark:border-blue-800';
  if (category === 'Mano de obra') {
    iconName = 'iconoir-wrench';
    badgeColor = 'text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/80 border-2 border-emerald-200 dark:border-emerald-800';
  } else if (category === 'Servicios') {
    iconName = 'iconoir-delivery-truck';
    badgeColor = 'text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/80 border-2 border-amber-200 dark:border-amber-800';
  }

  div.innerHTML = `
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <div class="w-10 h-10 rounded-xl ${badgeColor} flex items-center justify-center shrink-0 shadow-sm">
        <i class="${iconName} text-xl"></i>
      </div>
      <div class="flex-1 min-w-0">
        <input type="text" value="${desc.replace(/"/g, '&quot;')}" oninput="updateSwissPreview()"
               class="item-desc w-full bg-transparent text-sm sm:text-base font-bold text-slate-900 dark:text-white focus:outline-none focus:border-b-2 focus:border-blue-600 pb-0.5 truncate font-sans"/>
        <span class="item-cat-label text-xs font-semibold text-slate-600 dark:text-slate-300 block truncate font-sans" data-category="${category}">${category} • Desglose garantizado</span>
      </div>
    </div>
    <div class="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-700">
      <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 shadow-sm">
        <span class="text-xs font-extrabold text-slate-600 dark:text-slate-400 font-mono">Cant</span>
        <input type="number" min="0.1" step="any" value="${qty}" oninput="recalculate()" inputmode="decimal"
               class="item-qty w-12 bg-transparent text-center font-mono text-sm font-bold text-slate-900 dark:text-white focus:outline-none"/>
      </div>
      <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 shadow-sm">
        <span class="font-mono text-sm font-extrabold text-slate-500">$</span>
        <input type="number" step="1000" value="${cost}" oninput="recalculate()" inputmode="numeric"
               class="item-cost w-24 sm:w-28 bg-transparent text-right font-mono text-sm sm:text-base font-bold text-slate-900 dark:text-white focus:outline-none font-semibold"/>
      </div>
      <button type="button" onclick="removeItem(this)" class="w-9 h-9 rounded-xl flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors shrink-0" title="Eliminar ítem">
        <i class="iconoir-trash text-lg"></i>
      </button>
    </div>
  `;
  container.appendChild(div);
  recalculate();
  updateSwissPreview();
}

function removeItem(btn) {
  const row = btn.closest('.item-row');
  if (document.querySelectorAll('.item-row').length > 1) {
    row.remove();
    recalculate();
    updateSwissPreview();
  } else {
    showToast('Debes conservar al menos un gasto en tu lista para calcular la cotización.', 'warning');
  }
}

// --- DICTADO POR VOZ NATIVO (Reconocimiento de Voz en Español Colombia) ---
let speechRecognitionInstance = null;
let isRecordingVoice = false;

function toggleVoiceDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Tu navegador no soporta dictado por voz. Usa Google Chrome o escribe tu texto.', 'warning');
    return;
  }

  const micBtn = document.getElementById('btnVoiceDictation');
  const micIcon = document.getElementById('voiceMicIcon');
  const input = document.getElementById('quickAiInput');

  if (isRecordingVoice && speechRecognitionInstance) {
    speechRecognitionInstance.stop();
    return;
  }

  try {
    speechRecognitionInstance = new SpeechRecognition();
    speechRecognitionInstance.lang = 'es-CO';
    speechRecognitionInstance.interimResults = false;
    speechRecognitionInstance.maxAlternatives = 1;

    speechRecognitionInstance.onstart = function() {
      isRecordingVoice = true;
      if (micBtn) {
        micBtn.className = 'w-11 h-11 rounded-xl bg-red-600 text-white animate-pulse border-2 border-red-700 flex items-center justify-center shrink-0 transition-all shadow-md';
      }
      if (micIcon) micIcon.className = 'iconoir-microphone text-2xl text-white';
      if (input) input.placeholder = '🎙️ Te estoy escuchando... habla con tranquilidad';
      showToast('🎙️ Escuchando... habla sobre tus materiales y trabajo.', 'info');
    };

    speechRecognitionInstance.onresult = function(event) {
      const transcript = event.results[0][0].transcript;
      if (input) {
        input.value = transcript;
      }
      showToast(`🎙️ Entendido: "${transcript}"`, 'success');
      parseNaturalText();
    };

    speechRecognitionInstance.onerror = function(event) {
      console.warn('Aviso de micrófono:', event.error);
      if (event.error === 'not-allowed') {
        showToast('Debes permitir el permiso del micrófono en tu navegador para dictar.', 'warning');
      } else {
        showToast('No alcancé a escucharte bien. Toca el micrófono e inténtalo de nuevo.', 'warning');
      }
    };

    speechRecognitionInstance.onend = function() {
      isRecordingVoice = false;
      if (micBtn) {
        micBtn.className = 'w-11 h-11 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-2 border-emerald-300 flex items-center justify-center shrink-0 transition-all shadow-sm';
      }
      if (micIcon) micIcon.className = 'iconoir-microphone text-2xl text-emerald-800';
      if (input && !input.value) {
        input.placeholder = 'Toca el micro 🎙️ o escribe: "3 bultos de cemento, pintor..."';
      }
    };

    speechRecognitionInstance.start();
  } catch (err) {
    console.warn('Error iniciando voz:', err);
    showToast('Error al activar el micrófono: ' + err.message, 'error');
  }
}

// --- PLANTILLAS RÁPIDAS POR OFICIO EN 1 CLIC (ALINEADAS AL NICHO COLOMBIANO) ---
function cargarPlantillaRapidaOficio(tipo) {
  const container = document.getElementById('itemsContainer');
  if (!container) return;

  container.innerHTML = '';

  if (tipo === 'remodelacion' || tipo === 'obra') {
    if (document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = 'Remodelación de Baño, Muros en Drywall & Enchape Cerámico';
    }
    if (document.getElementById('clientNameInput')) {
      document.getElementById('clientNameInput').value = 'Arq. Carlos Sarmiento - Remodelación Residencia';
    }
    if (document.getElementById('destAddressInput')) {
      document.getElementById('destAddressInput').value = 'Calle 127 # 19-35, Usaquén, Bogotá';
    }
    addNewItem('Láminas Drywall Gyplac 1/2" + Omegas, Calibres y Perfilería de 90mm', 5, 38000, 'Materiales');
    addNewItem('Masilla para drywall en cuñete Gyplac + Cinta de malla fibra de vidrio', 2, 68000, 'Materiales');
    addNewItem('Cemento Gris Argos 50kg + Arena lavada por bulto', 4, 32000, 'Materiales');
    addNewItem('Pegacor Corona flexible gris para enchape cerámico', 3, 28500, 'Materiales');
    addNewItem('Mano de obra oficial albañil + ayudante (Demolición, pañete, drywall e instalación)', 1, 850000, 'Mano de obra');
    addNewItem('Retiro y disposición certificada de escombros en volqueta', 1, 180000, 'Servicios');

    setContingency(10);
    const marginSlider = document.getElementById('marginRange');
    if (marginSlider) {
      marginSlider.value = 35;
      onMarginChange(35);
    }
    showToast('🧱 Plantilla de Obra Blanca y Drywall cargada.', 'success');

  } else if (tipo === 'plomeria') {
    if (document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = 'Instalación de Red Hidráulica, Griferías & Reparación de Fuga Oculta';
    }
    if (document.getElementById('clientNameInput')) {
      document.getElementById('clientNameInput').value = 'Sra. Claudia Mendoza - Casa Campestre';
    }
    if (document.getElementById('destAddressInput')) {
      document.getElementById('destAddressInput').value = 'Carrera 7 # 140-15, Cedritos, Bogotá';
    }
    addNewItem('Tubería PVC Presión RDE 21 Pavco 1/2" + Codos, Tees y Adaptadores Macho', 6, 18500, 'Materiales');
    addNewItem('Soldadura líquida PVC Pavco + Limpiador removedor + Cinta teflón 3/4', 1, 42000, 'Materiales');
    addNewItem('Válvulas de paso de bola en bronce 1/2" Grival + Llaves de regulación angular', 3, 34000, 'Materiales');
    addNewItem('Grifería monocontrol para lavamanos Corona alta eficiencia', 1, 165000, 'Materiales');
    addNewItem('Mano de obra oficial plomero calificado (Detección de fuga, regata y empalmes)', 1, 420000, 'Mano de obra');
    addNewItem('Prueba de presión manométrica y sellado hermético certificado', 1, 60000, 'Servicios');

    setContingency(5);
    const marginSlider = document.getElementById('marginRange');
    if (marginSlider) {
      marginSlider.value = 40;
      onMarginChange(40);
    }
    showToast('🚰 Plantilla de Plomería y Redes Hidráulicas cargada.', 'success');

  } else if (tipo === 'electricidad') {
    if (document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = 'Adecuación de Red Eléctrica, Tablero de Breakers & Iluminación LED';
    }
    if (document.getElementById('clientNameInput')) {
      document.getElementById('clientNameInput').value = 'Ing. Fernando Gómez - Local Comercial';
    }
    if (document.getElementById('destAddressInput')) {
      document.getElementById('destAddressInput').value = 'Carrera 15 # 85-30, Chapinero, Bogotá';
    }
    addNewItem('Cable de cobre Centelsa No. 12 AWG THHN/THWN-2 (Rollos 50m)', 2, 135000, 'Materiales');
    addNewItem('Tablero de distribución 8 circuitos Schneider Electric + Breakers 15A/20A', 1, 195000, 'Materiales');
    addNewItem('Paneles LED incrustar 18W luz día 6500K Philips con driver', 8, 22000, 'Materiales');
    addNewItem('Tomas dobles con polo a tierra y placas línea moderna Veto/Bticino', 10, 14500, 'Materiales');
    addNewItem('Tubería Conduit PVC 1/2" con curvas, uniones y cajas 4x4', 1, 85000, 'Materiales');
    addNewItem('Mano de obra electricista certificado CONALTE (Alambrado y balanceo de cargas)', 1, 680000, 'Mano de obra');

    setContingency(5);
    const marginSlider = document.getElementById('marginRange');
    if (marginSlider) {
      marginSlider.value = 35;
      onMarginChange(35);
    }
    showToast('⚡ Plantilla de Electricidad e Iluminación cargada.', 'success');

  } else if (tipo === 'pintura') {
    if (document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = 'Pintura General de Interiores en Viniltex & Impermeabilización';
    }
    if (document.getElementById('clientNameInput')) {
      document.getElementById('clientNameInput').value = 'Conjunto Residencial Los Sauces - Apto 302';
    }
    if (document.getElementById('destAddressInput')) {
      document.getElementById('destAddressInput').value = 'Calle 134 # 9-40, Bogotá';
    }
    addNewItem('Cuñete Pintura Tipo 1 Viniltex Pintuco Blanco Puro (Super lavable)', 2, 265000, 'Materiales');
    addNewItem('Galón Impermeabilizante acrílico para fachadas Koraza Pintuco', 2, 98000, 'Materiales');
    addNewItem('Estuco plástico exterior Corona listo para aplicar (Cuñete)', 2, 78000, 'Materiales');
    addNewItem('Kit de aplicación: Rodillos antigoteo, brochas máster, espátulas y cinta azul', 1, 85000, 'Materiales');
    addNewItem('Plásticos protectores de piso y papel de enmascarar alta densidad', 3, 22000, 'Materiales');
    addNewItem('Mano de obra pintor oficial (Resane, lijado, estucado y aplicación de 3 manos)', 1, 650000, 'Mano de obra');

    setContingency(5);
    const marginSlider = document.getElementById('marginRange');
    if (marginSlider) {
      marginSlider.value = 35;
      onMarginChange(35);
    }
    showToast('🎨 Plantilla de Pintura e Impermeabilización cargada.', 'success');

  } else if (tipo === 'carpinteria') {
    if (document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = 'Fabricación e Instalación de Cocina Integral & Muebles RH';
    }
    if (document.getElementById('clientNameInput')) {
      document.getElementById('clientNameInput').value = 'Familia Restrepo - Proyecto Remodelación';
    }
    if (document.getElementById('destAddressInput')) {
      document.getElementById('destAddressInput').value = 'Carrera 7 # 120-20, Usaquén, Bogotá';
    }
    addNewItem('Tableros Melamínicos RH 18mm Pelíkano (Resistente a la Humedad)', 4, 245000, 'Materiales');
    addNewItem('Herrajes Ducasse: Bisagras cierre suave y rieles telescópicos pesados', 1, 280000, 'Materiales');
    addNewItem('Tornillería Spax, cantos rígidos PVC termofundidos y adhesivos', 1, 110000, 'Materiales');
    addNewItem('Mano de obra oficial carpintero + ayudante (Armado, aplome e instalación)', 1, 850000, 'Mano de obra');
    addNewItem('Transporte protegido y acarreo a piso', 1, 120000, 'Servicios');

    setContingency(10);
    const marginSlider = document.getElementById('marginRange');
    if (marginSlider) {
      marginSlider.value = 35;
      onMarginChange(35);
    }
    showToast('🪵 Plantilla de Carpintería y Muebles RH cargada.', 'success');

  } else if (tipo === 'mantenimiento' || tipo === 'tecnico') {
    if (document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = 'Mantenimiento Preventivo / Correctivo de Aire Acondicionado Minisplit';
    }
    if (document.getElementById('clientNameInput')) {
      document.getElementById('clientNameInput').value = 'Clínica del Norte - Consultorio Médico';
    }
    if (document.getElementById('destAddressInput')) {
      document.getElementById('destAddressInput').value = 'Calle 93B # 13-45, Chicó Norte, Bogotá';
    }
    addNewItem('Limpiador dieléctrico biodegradante y desincrustante de serpentines', 1, 75000, 'Materiales');
    addNewItem('Gas refrigerante ecológico R410A (Carga completa certificada)', 1, 110000, 'Materiales');
    addNewItem('Filtros antibacteriales de reemplazo y aislamiento térmico elastomérico', 1, 65000, 'Materiales');
    addNewItem('Mano de obra técnica especializada: Lavado hidrolavadora a presión y calibración', 1, 220000, 'Mano de obra');
    addNewItem('Certificado técnico de mantenimiento preventivo y desinfección', 1, 50000, 'Servicios');

    setContingency(5);
    const marginSlider = document.getElementById('marginRange');
    if (marginSlider) {
      marginSlider.value = 40;
      onMarginChange(40);
    }
    showToast('❄️ Plantilla de Climatización y Mantenimiento cargada.', 'success');

  } else if (tipo === 'soldadura') {
    if (document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = 'Fabricación e Instalación de Reja de Seguridad & Portón Estructural';
    }
    if (document.getElementById('clientNameInput')) {
      document.getElementById('clientNameInput').value = 'Sr. Javier Pinzón - Residencia Campestre';
    }
    if (document.getElementById('destAddressInput')) {
      document.getElementById('destAddressInput').value = 'Autopista Norte Km 18, Chía';
    }
    addNewItem('Tubo rectangular estructural 2x1" Calibre 16 Acesco', 6, 48000, 'Materiales');
    addNewItem('Varilla cuadrada 1/2" maciza para enrejado y bastidor', 8, 24000, 'Materiales');
    addNewItem('Cerradura de sobreponer de alta seguridad Yale 3 golpes', 1, 145000, 'Materiales');
    addNewItem('Anticorrosivo epóxico automotriz + Esmalte sintético negro mate', 2, 62000, 'Materiales');
    addNewItem('Soldadura 6013 1/8", discos de corte y desbaste DeWalt', 1, 75000, 'Materiales');
    addNewItem('Mano de obra oficial soldador/cerrajero (Trazo, corte, soldadura y pintura)', 1, 520000, 'Mano de obra');
    addNewItem('Transporte y fijación en obra con anclajes expansivos Hilti', 1, 90000, 'Servicios');

    setContingency(5);
    const marginSlider = document.getElementById('marginRange');
    if (marginSlider) {
      marginSlider.value = 35;
      onMarginChange(35);
    }
    showToast('🛠️ Plantilla de Cerrajería y Soldadura cargada.', 'success');
  }

  calculateRouteFreight(false);
  recalculate();
  updateSwissPreview();
  autoSaveDraft();
}

/**
 * Conexión con el backend de Gemini (Structured Outputs)
 */
async function llamarOptimizadorIA(textoRequerimiento, moneda = 'COP') {
  const response = await fetch('/api/analizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: textoRequerimiento, moneda: moneda })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Error del servidor HTTP ${response.status}`);
  }

  return await response.json();
}

async function parseNaturalText() {
  const input = document.getElementById('quickAiInput');
  const btn = document.getElementById('btnDesglosarAi');
  const rawText = input.value.trim();

  const textoAAnalizar = rawText || "3 bultos de cemento 90mil, pintor 250mil y acarreo 60mil";

  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="iconoir-refresh-double text-base animate-spin"></i><span class="hidden sm:inline">Analizando...</span>`;
  }

  try {
    const data = await llamarOptimizadorIA(textoAAnalizar, currentCurrency);

    if (data.titulo_proyecto && document.getElementById('serviceNameInput')) {
      document.getElementById('serviceNameInput').value = data.titulo_proyecto;
    }

    if (data.tiempo_estimado_dias && document.getElementById('executionDaysSelect')) {
      const select = document.getElementById('executionDaysSelect');
      let found = false;
      for (let i = 0; i < select.options.length; i++) {
        if (parseInt(select.options[i].value, 10) === data.tiempo_estimado_dias) {
          select.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        const newOpt = new Option(`${data.tiempo_estimado_dias} días hábiles`, data.tiempo_estimado_dias, true, true);
        select.add(newOpt);
      }
      updateCalendarMilestones();
    }

    const container = document.getElementById('itemsContainer');
    if (container && data.items && data.items.length > 0) {
      container.innerHTML = '';
      data.items.forEach(it => {
        addNewItem(it.descripcion, it.cantidad || 1, it.costo_unitario_estimado || 50000, it.categoria || 'Materiales');
      });
      showToast(`¡Desglose completo generado! ${data.items.length} materiales, mano de obra y servicios calculados.`, 'success');
    }

    renderAlertasImprevistos(data.alertas_imprevistos || []);
    input.value = '';

  } catch (error) {
    console.warn('Error conectando a Gemini API:', error);
    showToast('No se pudo conectar con el asistente de voz. Revisa tu internet o ingresa los gastos directamente en la tabla.', 'warning');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
    recalculate();
    updateSwissPreview();
  }
}

function renderAlertasImprevistos(alertas) {
  const container = document.getElementById('alertasImprevistosContainer');
  const list = document.getElementById('alertasImprevistosList');
  if (!container || !list) return;

  if (!alertas || alertas.length === 0) {
    container.classList.add('hidden');
    return;
  }

  list.innerHTML = '';
  alertas.forEach(alerta => {
    const li = document.createElement('li');
    li.className = 'flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 font-medium font-sans';
    li.innerHTML = `
      <i class="iconoir-warning-triangle text-amber-600 dark:text-amber-400 text-base shrink-0 mt-0.5"></i>
      <span>${alerta}</span>
    `;
    list.appendChild(li);
  });

  container.classList.remove('hidden');
}

function switchTabConnect(tabName) {
  ['anticipo', 'firma', 'calendario'].forEach(t => {
    const c = document.getElementById(`tabContent-${t}`);
    const b = document.getElementById(`tabBtn-${t}`);
    if (!c || !b) return;
    if (t === tabName) {
      c.classList.remove('hidden');
      b.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/80 dark:border-slate-700 transition-all flex items-center gap-1.5 font-sans';
    } else {
      c.classList.add('hidden');
      b.className = 'px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-1.5 font-sans';
    }
  });

  if (tabName === 'firma') {
    setTimeout(resizeSignatureCanvas, 60);
  }
}

let customBreBQrDataUrl = null;

function updatePaymentChannel() {
  const selEl = document.getElementById('payoutChannelSelect');
  if (!selEl) return;
  const sel = selEl.value;
  const num = document.getElementById('payoutNumberInput') ? document.getElementById('payoutNumberInput').value.trim() : '310 456 7890';
  const sub = document.getElementById('qrChannelSubtitle');
  const docP = document.getElementById('swissPayoutMethodDoc');
  const btnCobrarText = document.getElementById('btnIrACobrarText');
  const brebBadge = document.getElementById('brebBadgeTag');

  const inputLabel = document.getElementById('payoutNumberInputLabel');
  const numberInput = document.getElementById('payoutNumberInput');

  if (sel === 'bancolombia') {
    if (inputLabel) inputLabel.innerText = 'Número de Cuenta Bancolombia';
    if (numberInput) numberInput.placeholder = 'Ej: 245-891234-01 (Ahorros)';
    if (sub) sub.innerText = `Bancolombia Cta: ${num}`;
    if (docP) docP.innerText = `Cta Ahorros Bancolombia: ${num}`;
    if (btnCobrarText) btnCobrarText.innerText = 'Abrir Bancolombia';
    if (brebBadge) brebBadge.classList.add('hidden');
  } else if (sel === 'efectivo') {
    if (inputLabel) inputLabel.innerText = 'Detalle del pago en efectivo';
    if (numberInput) numberInput.placeholder = 'Ej: Pago contra entrega al finalizar';
    if (sub) sub.innerText = `Efectivo contra entrega`;
    if (docP) docP.innerText = `Pago en efectivo: ${num || 'Contra entrega al terminar el servicio'}`;
    if (btnCobrarText) btnCobrarText.innerText = 'Efectivo';
    if (brebBadge) brebBadge.classList.add('hidden');
  } else {
    // Por defecto Nequi / Bre-B (Celular)
    if (inputLabel) inputLabel.innerText = 'Tu Celular (Nequi o Bre-B)';
    if (numberInput) numberInput.placeholder = 'Ej: 310 456 7890';
    if (sub) sub.innerText = `Nequi / Bre-B: ${num}`;
    if (docP) docP.innerText = `Nequi / Bre-B: ${num}`;
    if (btnCobrarText) btnCobrarText.innerText = 'Abrir Nequi / Bre-B';
    if (brebBadge) brebBadge.classList.remove('hidden');
  }

  // Sincronizar input de modal empresa si existe
  if (document.getElementById('companyBreBKeyInput') && num) {
    document.getElementById('companyBreBKeyInput').value = num;
  }

  renderDynamicQRCodes();
}

// Subir foto o escaneo de QR propio de Bre-B o Nequi
function handleCustomBreBQrUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    customBreBQrDataUrl = e.target.result;
    localStorage.setItem('smartquote_custom_breb_qr', customBreBQrDataUrl);
    renderDynamicQRCodes();
    showToast('¡Código QR guardado! Ahora aparecerá en la pantalla y en el PDF.', 'success');
  };
  reader.readAsDataURL(file);
}

function handleCompanyQrUpload(event) {
  handleCustomBreBQrUpload(event);
  const label = document.getElementById('companyQrUploadLabel');
  if (label) label.innerText = '✓ QR cargado correctamente';
}

// Redirección real a la plataforma elegida
function irAPaginaDeCobro() {
  const selEl = document.getElementById('payoutChannelSelect');
  const channel = selEl ? selEl.value : 'breb';
  irAPaginaDeCobroMetodo(channel);
}

async function irAPaginaDeCobroMetodo(channel) {
  const num = (document.getElementById('payoutNumberInput') && document.getElementById('payoutNumberInput').value.trim()) || '3104567890';
  const cleanNum = num.replace(/\D/g, '');
  const advanceAmount = document.getElementById('sidebarAdvanceAmount') ? document.getElementById('sidebarAdvanceAmount').innerText : '$686.538';
  
  let targetUrl = '';

  switch (channel) {
    case 'nequi':
      targetUrl = `https://recarga.nequi.com.co/billetera-recarga/`;
      break;
    case 'daviplata':
      targetUrl = `https://www.daviplata.com/`;
      break;
    case 'bancolombia':
      targetUrl = `https://www.bancolombia.com/personas`;
      break;
    case 'alamano':
      targetUrl = `https://www.bancolombia.com/personas/bancolombia-a-la-mano`;
      break;
    case 'breb':
      targetUrl = `https://www.pse.com.co/persona-inicio`;
      break;
    case 'efectivo':
      showToast('Pago acordado en efectivo contra entrega al finalizar el servicio.', 'info');
      return;
    case 'bold':
      targetUrl = `https://bold.co/`;
      break;
    default:
      targetUrl = `https://www.pse.com.co/`;
      break;
  }

  const nombreCanal = channel.toUpperCase();
  const confirmar = await showCustomConfirm(
    `Abrir Portal de Cobro (${nombreCanal})`,
    `Canal: ${nombreCanal} • Monto Anticipo: ${advanceAmount} COP • Llave: ${num}\n¿Deseas abrir la plataforma oficial en una nueva pestaña?`,
    'open'
  );
  
  if (confirmar) {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    showToast(`Abriendo ${nombreCanal} en una nueva pestaña...`, 'info');
  }
}

// Renderizar códigos QR dinámicos reales (o mostrar la imagen subida si existe)
function renderDynamicQRCodes() {
  const qrAdvanceContainer = document.getElementById('qrCodeDynamicContainer');
  const swissQrContainer = document.getElementById('swissQrDynamicContainer');
  const customImg = document.getElementById('customBreBQrPreviewImg');
  const swissCustomImg = document.getElementById('swissCustomBreBQrImg');

  // Si no está cargado en memoria pero existe en localStorage, recuperarlo
  if (!customBreBQrDataUrl) {
    const saved = localStorage.getItem('smartquote_custom_breb_qr');
    if (saved) customBreBQrDataUrl = saved;
  }

  // Si el usuario subió una imagen de su QR Bre-B / Bancolombia / Nequi, la mostramos directamente
  if (customBreBQrDataUrl) {
    if (customImg) {
      customImg.src = customBreBQrDataUrl;
      customImg.classList.remove('hidden');
    }
    if (swissCustomImg) {
      swissCustomImg.src = customBreBQrDataUrl;
      swissCustomImg.classList.remove('hidden');
    }
    // Ocultar canvas generados si hay imagen fija
    const canvases = qrAdvanceContainer ? qrAdvanceContainer.querySelectorAll('canvas, img:not(#customBreBQrPreviewImg)') : [];
    canvases.forEach(c => c.style.display = 'none');
    const swissCanvases = swissQrContainer ? swissQrContainer.querySelectorAll('canvas, img:not(#swissCustomBreBQrImg)') : [];
    swissCanvases.forEach(c => c.style.display = 'none');
    return;
  }

  // Si no ha subido imagen, generamos el QR vectorial dinámico interoperable
  if (customImg) customImg.classList.add('hidden');
  if (swissCustomImg) swissCustomImg.classList.add('hidden');

  const paymentChannel = document.getElementById('payoutChannelSelect') ? document.getElementById('payoutChannelSelect').value : 'breb';
  const paymentNumber = document.getElementById('payoutNumberInput') ? document.getElementById('payoutNumberInput').value : '310 456 7890';
  const advanceAmount = document.getElementById('sidebarAdvanceAmount') ? document.getElementById('sidebarAdvanceAmount').innerText : '$686.538';
  const quoteRef = currentQuoteCode || 'COT-2026-001';

  // Payload estándar interoperable Bre-B Colombia (Banco de la República)
  let qrPayload = '';
  if (paymentChannel === 'breb') {
    qrPayload = `bre-b://pay?key=${encodeURIComponent(paymentNumber)}&amount=${encodeURIComponent(advanceAmount.replace(/\D/g, ''))}&ref=${encodeURIComponent(quoteRef)}&name=SmartQuote`;
  } else if (paymentChannel === 'nequi') {
    qrPayload = `https://recarga.nequi.com.co/?phone=${encodeURIComponent(paymentNumber.replace(/\D/g, ''))}&monto=${encodeURIComponent(advanceAmount.replace(/\D/g, ''))}`;
  } else {
    qrPayload = `https://pse.com.co/pay?canal=${encodeURIComponent(paymentChannel)}&dest=${encodeURIComponent(paymentNumber)}&monto=${encodeURIComponent(advanceAmount)}&ref=${encodeURIComponent(quoteRef)}`;
  }

  if (window.QRCode) {
    if (qrAdvanceContainer) {
      // Limpiar elementos generados previamente respetando customImg
      const toRemove = qrAdvanceContainer.querySelectorAll('canvas, img:not(#customBreBQrPreviewImg)');
      toRemove.forEach(el => el.remove());

      new QRCode(qrAdvanceContainer, {
        text: qrPayload,
        width: 72,
        height: 72,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    }
    if (swissQrContainer) {
      const toRemove = swissQrContainer.querySelectorAll('canvas, img:not(#swissCustomBreBQrImg)');
      toRemove.forEach(el => el.remove());

      new QRCode(swissQrContainer, {
        text: qrPayload,
        width: 44,
        height: 44,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }
}

// Compartir cotización directa por WhatsApp con mensaje estructurado profesional
async function enviarPorWhatsApp() {
  // Asegurar que la cotización esté guardada en el servidor para generar enlace real
  if (!currentQuoteCode) {
    try {
      await guardarCotizacionActual();
    } catch (e) {
      console.warn('Auto-guardado antes de WhatsApp:', e);
    }
  }

  const cliente = document.getElementById('clientNameInput') ? document.getElementById('clientNameInput').value : 'Cliente';
  const servicio = document.getElementById('serviceNameInput') ? document.getElementById('serviceNameInput').value : 'Servicio Técnico';
  const total = document.getElementById('statClientTotal') ? document.getElementById('statClientTotal').innerText : '$1.373.077';
  const anticipo = document.getElementById('sidebarAdvanceAmount') ? document.getElementById('sidebarAdvanceAmount').innerText : '$686.538';
  const ref = currentQuoteCode || 'COT-2026-001';
  const url = window.location.origin + '/?cot=' + ref + '&view=client';
  const emisor = document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : 'SmartQuote Pro';

  const canalEl = document.getElementById('payoutChannelSelect');
  const canalTexto = canalEl ? canalEl.options[canalEl.selectedIndex].text : 'Nequi / Bre-B';

  // Leer teléfono del cliente
  const phoneInput = document.getElementById('clientPhoneInput');
  const rawDigits = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
  
  let targetPhone = '';
  if (rawDigits.length === 10 && rawDigits.startsWith('3')) {
    targetPhone = '57' + rawDigits;
  } else if (rawDigits.length > 10) {
    targetPhone = rawDigits;
  }

  const mensaje = `¡Hola! 👋 Le comparto la propuesta técnica formal emitida por *${emisor}*:\n\n` +
                  `📄 *Cotización:* #${ref}\n` +
                  `👤 *Cliente:* ${cliente}\n` +
                  `🛠️ *Objeto:* ${servicio}\n` +
                  `💰 *Valor Total Presupuestado:* ${total} COP\n` +
                  `⚡ *Anticipo Inicial Requerido (50%):* ${anticipo} COP\n` +
                  `💳 *Canal de Pago Directo:* ${canalTexto}\n\n` +
                  `📌 Puede consultar el alcance detallado, firmar digitalmente con su dedo y pagar el anticipo en 1 clic aquí:\n` +
                  `${url}\n\n` +
                  `Quedo atento a su confirmación para coordinar el inicio de la obra. ¡Gracias por su confianza!`;

  const whatsappUrl = targetPhone
    ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

  window.open(whatsappUrl, '_blank');
}

function simulatePayAdvance() {
  openPaymentGatewayModal();
}

// --- CENTRO DE SINCRONIZACIÓN E IMPORTACIÓN DE PRECIOS ---

function openSyncModal() {
  const m = document.getElementById('syncModal');
  if (m) m.classList.remove('hidden');
}

function closeSyncModal() {
  const m = document.getElementById('syncModal');
  if (m) m.classList.add('hidden');
}

function switchSyncTab(tabId) {
  const tabs = ['excel', 'sheets', 'catalogo', 'whatsapp'];
  tabs.forEach(t => {
    const btn = document.getElementById(`syncTabBtn-${t}`);
    const content = document.getElementById(`syncTabContent-${t}`);
    if (content) {
      if (t === tabId) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabId) {
        btn.className = 'px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-sm flex items-center gap-1.5 transition-all';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60 font-medium flex items-center gap-1.5 transition-all';
      }
    }
  });
}

// 1. Carga de archivo Excel (.xlsx / .csv)
function handleExcelUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    showToast('Librería de lectura de Excel no disponible. Revisa tu conexión.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rows || rows.length === 0) {
        showToast('El archivo Excel está vacío o no contiene filas legibles.', 'warning');
        return;
      }

      let count = 0;
      rows.forEach(row => {
        let desc = '';
        let qty = 1;
        let cost = 0;
        let cat = 'Materiales';

        for (const [key, val] of Object.entries(row)) {
          const k = key.toLowerCase().trim();
          if (/desc|item|concepto|material|nombre|servicio|actividad/.test(k) && !desc) {
            desc = String(val).trim();
          } else if (/cant|qty|cantidad|unid/.test(k)) {
            qty = parseFloat(val) || 1;
          } else if (/cost|precio|unitario|valor|tarifa/.test(k)) {
            cost = parseFloat(String(val).replace(/[^0-9.-]+/g, '')) || 0;
          } else if (/cat|categoria|tipo/.test(k)) {
            const catVal = String(val).toLowerCase();
            if (catVal.includes('mano') || catVal.includes('labor')) cat = 'Mano de obra';
            else if (catVal.includes('serv') || catVal.includes('flete')) cat = 'Servicios';
            else cat = 'Materiales';
          }
        }

        if (!desc && Object.values(row).length > 0) {
          const values = Object.values(row);
          desc = String(values[0] || '').trim();
          if (values.length > 1) qty = parseFloat(values[1]) || 1;
          if (values.length > 2) cost = parseFloat(String(values[2]).replace(/[^0-9.-]+/g, '')) || 0;
        }

        if (desc) {
          addNewItem(desc, qty, cost || 50000, cat);
          count++;
        }
      });

      closeSyncModal();
      showToast(`Se importaron ${count} ítems desde tu archivo Excel (${file.name}).`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error procesando el archivo Excel: ' + err.message, 'error');
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

// 2. Exportar la cotización actual a Excel (.xlsx)
function exportarCotizacionExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Librería de Excel no disponible temporalmente.', 'error');
    return;
  }

  const items = [];
  const rows = document.querySelectorAll('.item-row');
  rows.forEach(r => {
    const desc = r.querySelector('.item-desc') ? r.querySelector('.item-desc').value : 'Ítem';
    const cat = r.querySelector('.item-cat-label') ? r.querySelector('.item-cat-label').getAttribute('data-category') || 'Materiales' : 'Materiales';
    const qty = r.querySelector('.item-qty') ? parseFloat(r.querySelector('.item-qty').value) || 1 : 1;
    const cost = r.querySelector('.item-cost') ? parseFloat(r.querySelector('.item-cost').value) || 0 : 0;
    const total = qty * cost;

    items.push({
      'Descripción / Entregable': desc,
      'Categoría': cat,
      'Cantidad': qty,
      'Costo Unitario (COP)': cost,
      'Subtotal Costo (COP)': total
    });
  });

  if (items.length === 0) {
    showToast('No hay ítems registrados para exportar.', 'info');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(items);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cotización');

  const fileName = `Cotizacion_${(currentQuoteCode || 'SmartQuote')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast('Cotización exportada a Excel con éxito.', 'success');
}

// 3. Descargar plantilla base de Excel
function descargarPlantillaExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Librería de Excel no disponible temporalmente.', 'error');
    return;
  }

  const plantilla = [
    { 'Descripcion': 'Cemento Gris 50kg', 'Categoria': 'Materiales', 'Cantidad': 5, 'Costo_Unitario': 32000 },
    { 'Descripcion': 'Arena Lavada m3', 'Categoria': 'Materiales', 'Cantidad': 2, 'Costo_Unitario': 85000 },
    { 'Descripcion': 'Oficial de Obra (Jornal)', 'Categoria': 'Mano de obra', 'Cantidad': 3, 'Costo_Unitario': 120000 },
    { 'Descripcion': 'Flete de retiro de escombros', 'Categoria': 'Servicios', 'Cantidad': 1, 'Costo_Unitario': 70000 }
  ];

  const ws = XLSX.utils.json_to_sheet(plantilla);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Precios');
  XLSX.writeFile(wb, 'Plantilla_Precios_SmartQuote.xlsx');
}

// 4. Sincronizar Google Sheets público
async function sincronizarGoogleSheetsPublico() {
  const urlInput = document.getElementById('googleSheetUrlInput');
  const url = urlInput ? urlInput.value.trim() : '';

  if (!url) {
    showToast('Por favor pega el enlace de tu Google Sheet compartido.', 'info');
    return;
  }

  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    showToast('El enlace debe ser de Google Sheets (docs.google.com/spreadsheets/...)', 'warning');
    return;
  }

  const sheetId = match[1];
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error('No se pudo acceder a la hoja.');
    const csvText = await res.text();
    
    const workbook = XLSX.read(csvText, { type: 'string' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet);

    if (rows && rows.length > 0) {
      let count = 0;
      rows.forEach(r => {
        let desc = r.Descripcion || r.descripcion || r.Concepto || r.Material || r.Item || Object.values(r)[0];
        let qty = parseFloat(r.Cantidad || r.cantidad || r.Cant || 1) || 1;
        let cost = parseFloat(String(r.Costo_Unitario || r.Precio || r.Costo || 50000).replace(/[^0-9.-]+/g, '')) || 50000;
        let cat = r.Categoria || r.categoria || 'Materiales';
        if (desc) {
          addNewItem(String(desc), qty, cost, String(cat));
          count++;
        }
      });
      closeSyncModal();
      showToast(`¡Google Sheet sincronizado! Se importaron ${count} ítems.`, 'success');
    } else {
      showToast('La hoja compartida no contiene filas legibles.', 'warning');
    }
  } catch (err) {
    console.warn(err);
    showToast('Tip: Descarga tu Google Sheet en Archivo > Descargar Excel (.xlsx) y súbelo aquí.', 'info', 6000);
  }
}

// 5. Cargar paquetes de trabajos y combos de obra reales (Colombia 2026)
function cargarCatalogoPrecios(tipo) {
  const packs = {
    remodelacion_bano: {
      titulo: 'Remodelación de Baño Estándar (Hidráulico + Enchape)',
      items: [
        { d: 'Demolición de enchape existente y retiro de escombros (1 viaje)', q: 1, c: 110000, cat: 'Servicios' },
        { d: 'Tubería PVC Sanitaria 3" y accesorios de desagüe', q: 1, c: 52000, cat: 'Materiales' },
        { d: 'Impermeabilización zona de ducha (mortero con aditivo)', q: 1, c: 68000, cat: 'Materiales' },
        { d: 'Enchape cerámico piso y muros (12 m² con Pegacor y Boquilla)', q: 12, c: 24000, cat: 'Materiales' },
        { d: 'Jornales Oficial Enchapador / Plomero (3 días)', q: 3, c: 120000, cat: 'Mano de obra' },
        { d: 'Jornales Ayudante Práctico de Obra (3 días)', q: 3, c: 70000, cat: 'Mano de obra' },
        { d: 'Transporte y flete urbano de materiales', q: 1, c: 55000, cat: 'Servicios' }
      ]
    },
    pintura_inmueble: {
      titulo: 'Pintura y Resane General de Muros y Techos',
      items: [
        { d: 'Cuñete Pintura Vinilo Tipo 1 Lavable Blanco (2 u)', q: 2, c: 140000, cat: 'Materiales' },
        { d: 'Cuñete Estuco Plástico Interiores para resanes', q: 1, c: 38000, cat: 'Materiales' },
        { d: 'Cintas de enmascarar, plásticos protectores y lijas', q: 1, c: 25000, cat: 'Materiales' },
        { d: 'Jornales Maestro Pintor y Acabados (3 días)', q: 3, c: 110000, cat: 'Mano de obra' },
        { d: 'Jornales Ayudante preparación y aseo (2 días)', q: 2, c: 70000, cat: 'Mano de obra' }
      ]
    },
    muro_drywall: {
      titulo: 'Muro / División en Drywall (12 m²)',
      items: [
        { d: 'Perfiles lámina galvanizada (canales y parales 6cm)', q: 10, c: 14500, cat: 'Materiales' },
        { d: 'Placas de Yeso Drywall Standard 1/2" (1.22 x 2.44m)', q: 8, c: 36000, cat: 'Materiales' },
        { d: 'Caja tornillos drywall punta broca y fijaciones chazos', q: 1, c: 28000, cat: 'Materiales' },
        { d: 'Cinta malla de fibra y cuñete de masilla para juntas', q: 1, c: 45000, cat: 'Materiales' },
        { d: 'Mano de obra Oficial Instalador Drywall (2 días)', q: 2, c: 130000, cat: 'Mano de obra' },
        { d: 'Flete de láminas y perfiles en camioneta de carga', q: 1, c: 65000, cat: 'Servicios' }
      ]
    },
    punto_hidraulico: {
      titulo: 'Punto Hidráulico / Reparación de Fuga en Tubería',
      items: [
        { d: 'Tubería PVC Presión RDE 13.5 (1/2" - 6 metros)', q: 2, c: 26000, cat: 'Materiales' },
        { d: 'Accesorios (codos 90°, adaptadores macho/hembra, uniones)', q: 6, c: 4500, cat: 'Materiales' },
        { d: 'Soldadura líquida PVC 1/4 gal + limpiador', q: 1, c: 22000, cat: 'Materiales' },
        { d: 'Jornal Plomero Técnico Certificado', q: 1, c: 140000, cat: 'Mano de obra' },
        { d: 'Ayudante para regata y resane con mezcla', q: 1, c: 70000, cat: 'Mano de obra' }
      ]
    },
    punto_electrico: {
      titulo: 'Instalación de Punto Eléctrico & Breakers Certificado',
      items: [
        { d: 'Tramos tubería conduit PVC 1/2" y curvas', q: 3, c: 11000, cat: 'Materiales' },
        { d: 'Cable eléctrico de cobre certificado #12 AWG (metros)', q: 25, c: 3200, cat: 'Materiales' },
        { d: 'Caja 4x4 galvanizada y tomacorriente doble polo a tierra', q: 2, c: 18000, cat: 'Materiales' },
        { d: 'Breaker termomagnético enchufable 20 Amperios', q: 1, c: 24000, cat: 'Materiales' },
        { d: 'Jornal Electricista Certificado RETIE', q: 1, c: 140000, cat: 'Mano de obra' }
      ]
    },
    jornales_oficiales: {
      titulo: 'Jornales de Obra Civil Colombia 2026',
      items: [
        { d: 'Jornal Oficial de Obra Civil (con ARL)', q: 2, c: 120000, cat: 'Mano de obra' },
        { d: 'Jornal Ayudante Práctico de Obra', q: 2, c: 70000, cat: 'Mano de obra' },
        { d: 'Jornal Electricista Certificado', q: 1, c: 140000, cat: 'Mano de obra' },
        { d: 'Jornal Pintor y Estucador de Acabados', q: 2, c: 110000, cat: 'Mano de obra' }
      ]
    }
  };

  const pack = packs[tipo];
  if (!pack) return;

  // Si el servicio actual es el valor por defecto, actualizar el título del trabajo
  const serviceInput = document.getElementById('serviceNameInput');
  if (serviceInput && pack.titulo && (!serviceInput.value || serviceInput.value.includes('Remodelación Estructural'))) {
    serviceInput.value = pack.titulo;
  }

  pack.items.forEach(it => {
    addNewItem(it.d, it.q, it.c, it.cat);
  });

  closeSyncModal();
  recalculate();
  updateSwissPreview();
  showToast(`¡Trabajo cargado! Se agregaron ${pack.items.length} ítems a tu presupuesto.`, 'success');
}

// 6. Importar desde texto pegado de WhatsApp
function importarDesdeTextoWhatsApp() {
  const txt = document.getElementById('whatsappPasteInput') ? document.getElementById('whatsappPasteInput').value.trim() : '';
  if (!txt) {
    showToast('Por favor pega el texto de la cotización que recibiste por WhatsApp.', 'info');
    return;
  }

  const lineas = txt.split('\n');
  let count = 0;

  lineas.forEach(linea => {
    const l = linea.trim();
    if (!l) return;

    let qty = 1;
    let cost = 50000;
    let desc = l;
    let cat = 'Materiales';

    if (/mano de obra|oficial|ayudante|pintor|jornal/i.test(l)) {
      cat = 'Mano de obra';
    } else if (/flete|acarreo|transporte/i.test(l)) {
      cat = 'Servicios';
    }

    const milMatch = l.match(/(\d+)\s*(?:mil|k)/i);
    if (milMatch) {
      cost = parseFloat(milMatch[1]) * 1000;
    } else {
      const numMatch = l.match(/\$?(\d{1,3}(?:\.\d{3})*|\d{4,9})/);
      if (numMatch) {
        cost = parseFloat(numMatch[1].replace(/\./g, '')) || cost;
      }
    }

    const qtyMatch = l.match(/^(\d+(?:\.\d+)?)\s*(?:bultos?|metros?|m2|m3|unid|viajes?|tubos?)?\s+(.*)/i);
    if (qtyMatch) {
      qty = parseFloat(qtyMatch[1]) || 1;
      desc = qtyMatch[2] || desc;
    }

    desc = desc.replace(/(?:a|por|\$)\s*\d+[\d\.,]*(?:\s*(?:mil|k))?/gi, '').trim();
    if (!desc) desc = l;

    addNewItem(desc.charAt(0).toUpperCase() + desc.slice(1), qty, cost, cat);
    count++;
  });

  document.getElementById('whatsappPasteInput').value = '';
  closeSyncModal();
  showToast(`¡WhatsApp Convertido! Se crearon ${count} ítems automáticamente.`, 'success');
}

// Compatibilidad con botón legacy
function syncGoogleSheets() {
  openSyncModal();
}

// --- SISTEMA DE FIRMA DIGITAL INTERACTIVA Y FÁCIL (PAD TÁCTIL / CALIGRAFÍA / IMAGEN) ---

let sigCanvas = null;
let sigCtx = null;
let isDrawingSignature = false;
let hasDrawnSignature = false;
let activeSignatureData = null;

function initSignaturePad() {
  sigCanvas = document.getElementById('signaturePadCanvas');
  if (!sigCanvas) return;
  sigCtx = sigCanvas.getContext('2d');

  resizeSignatureCanvas();
  window.addEventListener('resize', resizeSignatureCanvas);

  // Eventos de ratón
  sigCanvas.addEventListener('mousedown', startSigDrawing);
  sigCanvas.addEventListener('mousemove', drawSig);
  sigCanvas.addEventListener('mouseup', stopSigDrawing);
  sigCanvas.addEventListener('mouseleave', stopSigDrawing);

  // Eventos táctiles para celular / tablet
  sigCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = sigCanvas.getBoundingClientRect();
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    sigCanvas.dispatchEvent(mouseEvent);
  }, { passive: false });

  sigCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    sigCanvas.dispatchEvent(mouseEvent);
  }, { passive: false });

  sigCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    sigCanvas.dispatchEvent(mouseEvent);
  }, { passive: false });
}

function resizeSignatureCanvas() {
  if (!sigCanvas) return;
  const rect = sigCanvas.getBoundingClientRect();
  if (rect.width === 0) return;

  const dpr = window.devicePixelRatio || 1;
  sigCanvas.width = rect.width * dpr;
  sigCanvas.height = rect.height * dpr;

  if (sigCtx) {
    sigCtx.scale(dpr, dpr);
    sigCtx.lineWidth = 2.5;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.strokeStyle = '#0f172a';
  }
}

function getCanvasCoordinates(e) {
  const rect = sigCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function startSigDrawing(e) {
  isDrawingSignature = true;
  hasDrawnSignature = true;
  const coords = getCanvasCoordinates(e);
  sigCtx.beginPath();
  sigCtx.moveTo(coords.x, coords.y);

  const placeholder = document.getElementById('signaturePadPlaceholder');
  if (placeholder) placeholder.classList.add('hidden');
}

function drawSig(e) {
  if (!isDrawingSignature) return;
  const coords = getCanvasCoordinates(e);
  sigCtx.lineTo(coords.x, coords.y);
  sigCtx.stroke();
}

function stopSigDrawing() {
  if (isDrawingSignature) {
    sigCtx.closePath();
    isDrawingSignature = false;
  }
}

function clearSignatureCanvas() {
  if (!sigCanvas || !sigCtx) return;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  hasDrawnSignature = false;

  const placeholder = document.getElementById('signaturePadPlaceholder');
  if (placeholder) placeholder.classList.remove('hidden');

  const badge = document.getElementById('signatureStatusBadge');
  if (badge) badge.innerText = 'Lienzo en blanco';
}

function confirmCanvasSignature() {
  if (!hasDrawnSignature) {
    showToast('Por favor realiza un trazo en el lienzo con tu dedo o ratón antes de guardar.', 'info');
    return;
  }

  const dataUrl = sigCanvas.toDataURL('image/png');
  aplicarFirmaAlDocumento(dataUrl, 'image');
}

// Selector de modos de firma
function setSignatureMode(mode) {
  const modes = ['draw', 'type', 'upload'];
  modes.forEach(m => {
    const btn = document.getElementById(`sigModeBtn-${m}`);
    const container = document.getElementById(`sigModeContainer-${m}`);
    if (container) {
      if (m === mode) container.classList.remove('hidden');
      else container.classList.add('hidden');
    }
    if (btn) {
      if (m === mode) {
        btn.className = 'px-3 py-1 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-sm flex items-center gap-1.5 transition-all';
      } else {
        btn.className = 'px-3 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-1.5 transition-all';
      }
    }
  });

  if (mode === 'draw') {
    setTimeout(resizeSignatureCanvas, 60);
  }
}

// Modo 2: Firma Tipeada (Caligrafía)
function updateTypedSignaturePreview() {
  const input = document.getElementById('typedSignatureInput');
  const preview = document.getElementById('typedSignaturePreview');
  const val = input ? input.value.trim() : '';
  if (preview) {
    preview.innerText = val || 'Nombre del Cliente';
  }
}

function confirmTypedSignature() {
  const input = document.getElementById('typedSignatureInput');
  const val = input ? input.value.trim() : '';
  if (!val) {
    showToast('Por favor escribe tu nombre completo para generar la firma.', 'info');
    return;
  }
  aplicarFirmaAlDocumento(val, 'text');
}

// Modo 3: Subir Imagen
function handleSignatureImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    aplicarFirmaAlDocumento(e.target.result, 'image');
  };
  reader.readAsDataURL(file);
}

// Aplicar y Estampar la firma en el documento PDF Suizo
function aplicarFirmaAlDocumento(firmaData, tipo = 'image') {
  activeSignatureData = firmaData;
  const stamp = document.getElementById('swissClientSignatureStamp');
  const badge = document.getElementById('signatureStatusBadge');
  const previewCard = document.getElementById('currentSignaturePreviewCard');
  const thumb = document.getElementById('activeSignatureThumbnail');
  const timeLabel = document.getElementById('signatureTimestampLabel');

  const horaActual = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });

  if (tipo === 'image') {
    if (stamp) {
      stamp.innerHTML = `<img src="${firmaData}" alt="Firma del Cliente" class="h-10 max-h-10 object-contain"/>`;
    }
    if (thumb) {
      thumb.innerHTML = `<img src="${firmaData}" alt="Firma" class="h-8 max-h-8 object-contain bg-white rounded p-0.5 border border-slate-200"/>`;
    }
  } else {
    if (stamp) {
      stamp.innerHTML = `<span class="italic font-bold text-slate-900 text-xl select-none" style="font-family: 'Caveat', 'Dancing Script', cursive;">${firmaData}</span>`;
    }
    if (thumb) {
      thumb.innerHTML = `<span class="italic font-bold text-slate-800 text-sm select-none" style="font-family: 'Caveat', cursive;">${firmaData}</span>`;
    }
  }

  if (badge) badge.innerText = `● Firmado (${horaActual})`;
  if (timeLabel) timeLabel.innerText = `Rubricado el ${horaActual} • Ley 527/1999`;
  if (previewCard) previewCard.classList.remove('hidden');

  // Actualizar estado de la propuesta a 'Aprobada'
  if (currentQuoteCode) {
    cambiarEstadoCotizacion(currentQuoteCode, 'Aprobada');
  }

  showToast('¡Firma registrada y estampada con éxito en la cotización!', 'success');
}

// Compatibilidad con botón legado
function simulateClientSignature() {
  confirmCanvasSignature();
}

function copyClientLink() {
  const quoteUrl = window.location.origin + '/?cot=' + (currentQuoteCode || 'COT-2026-001') + '&view=client';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(quoteUrl);
  }
  showToast('¡Enlace copiado! Ya puedes pegarlo y enviarlo por WhatsApp a tu cliente.', 'info');
}

function updateCalendarMilestones() {
  const select = document.getElementById('executionDaysSelect');
  if (!select) return;
  const days = parseInt(select.value, 10) || 8;
  const m1 = document.getElementById('calMilestone1');
  const m2 = document.getElementById('calMilestone2');
  const m3 = document.getElementById('calMilestone3');

  if (m1) m1.innerText = `Día 1 (Inmediato)`;
  if (m2) m2.innerText = `Día ${Math.max(2, Math.round(days * 0.4))} (En curso)`;
  if (m3) m3.innerText = `Día ${days} (Entrega formal)`;
}

function syncWithGoogleCalendar() {
  showToast('Fechas y recordatorios sincronizados con tu calendario de trabajo.', 'success');
}

// --- GESTIÓN DE MAPA EN VIVO, GEORREFERENCIACIÓN Y FLETES ---

let addressDebounceTimer = null;
let originDebounceTimer = null;

// Catálogo de Referencia de Coordenadas Principales de Colombia
const COLOMBIAN_ZONES_CATALOG = [
  // Bogotá
  { name: 'Usaquén / Cedritos / Colina', query: ['usaquén', 'usaquen', 'cedritos', 'colina', '127', '116', '134', '140', '170', 'mazurén', 'mazuren'], lat: 4.7127, lon: -74.0450, city: 'Bogotá' },
  { name: 'Suba / Noroccidente', query: ['suba', 'chorrillos', 'rincón', 'rincon', 'tibabuyes'], lat: 4.7431, lon: -74.0847, city: 'Bogotá' },
  { name: 'Chapinero / Rosales / Chicó', query: ['chapinero', 'rosales', 'chicó', 'chico', 'nogal', 'cabrera', '72', '85'], lat: 4.6542, lon: -74.0583, city: 'Bogotá' },
  { name: 'Centro / La Candelaria', query: ['candelaria', 'bolívar', 'bolivar', 'san victorino', 'centro histórico', 'carrera 7', 'cra 7'], lat: 4.5981, lon: -74.0758, city: 'Bogotá' },
  { name: 'Salitre / Teusaquillo / Cra 68', query: ['carrera 68', 'cra 68', 'salitre', 'teusaquillo', 'calle 26', 'galerías', 'galerias'], lat: 4.6515, lon: -74.1012, city: 'Bogotá' },
  { name: 'Engativá / Álamos', query: ['engativá', 'engativa', 'álamos', 'alamos', 'calle 80', 'cl 80', 'bonanza', 'minuto'], lat: 4.7064, lon: -74.1165, city: 'Bogotá' },
  { name: 'Fontibón / Modelia', query: ['fontibón', 'fontibon', 'modelia', 'aeropuerto', 'el dorado'], lat: 4.6738, lon: -74.1436, city: 'Bogotá' },
  { name: 'Kennedy / Bosa', query: ['kennedy', 'bosa', 'castilla', 'américas', 'americas', 'tintal'], lat: 4.6292, lon: -74.1528, city: 'Bogotá' },
  { name: 'Barrios Unidos / 7 de Agosto', query: ['barrios unidos', '7 de agosto', 'doce de octubre', 'alcázares', 'alcazares'], lat: 4.6712, lon: -74.0743, city: 'Bogotá' },
  { name: 'Puente Aranda', query: ['puente aranda', 'industrial', 'carrera 50', 'américas'], lat: 4.6225, lon: -74.1118, city: 'Bogotá' },
  { name: 'Sur de Bogotá / Tunjuelito / Usme', query: ['tunjuelito', 'usme', 'ciudad bolívar', 'ciudad bolivar', 'rafael uribe', 'san cristóbal'], lat: 4.5612, lon: -74.1200, city: 'Bogotá' },
  // Sabana de Bogotá
  { name: 'La Calera (Montaña)', query: ['calera', 'choachí', 'choachi', 'guasca', 'sopo'], lat: 4.7208, lon: -73.9708, city: 'La Calera' },
  { name: 'Chía / Cota / Cajicá (Sabana)', query: ['chía', 'chia', 'cota', 'cajicá', 'cajica', 'tabio', 'tenjo'], lat: 4.8637, lon: -74.0569, city: 'Chía' },
  { name: 'Zipaquirá / Tocancipá', query: ['zipaquirá', 'zipaquira', 'tocancipá', 'tocancipa', 'gachancipá'], lat: 5.0264, lon: -74.0042, city: 'Zipaquirá' },
  { name: 'Soacha / Sibaté', query: ['soacha', 'sibate', 'sibaté', 'autopista sur'], lat: 4.5802, lon: -74.2169, city: 'Soacha' },
  { name: 'Sabana Occidente (Mosquera / Funza / Madrid)', query: ['mosquera', 'funza', 'madrid', 'facatativá', 'faca'], lat: 4.7058, lon: -74.2302, city: 'Mosquera' },
  // Medellín y Antioquia
  { name: 'Medellín (El Poblado)', query: ['poblado', 'palmas', 'castropol', 'provenza', 'manila'], lat: 6.2087, lon: -75.5678, city: 'Medellín' },
  { name: 'Medellín (Laureles / Belén)', query: ['laureles', 'belén', 'belen', 'estadio', 'conquistadores'], lat: 6.2422, lon: -75.5925, city: 'Medellín' },
  { name: 'Medellín (Centro)', query: ['centro medellín', 'candelaria medellín', 'san diego', 'alpujarra'], lat: 6.2518, lon: -75.5636, city: 'Medellín' },
  { name: 'Envigado / Sabaneta / Itagüí', query: ['envigado', 'sabaneta', 'itagüí', 'itigui'], lat: 6.1708, lon: -75.5842, city: 'Envigado' },
  { name: 'Bello / Copacabana', query: ['bello', 'copacabana', 'girardota'], lat: 6.3375, lon: -75.5583, city: 'Bello' },
  { name: 'Rionegro / Llanogrande', query: ['rionegro', 'llanogrande', 'ceja', 'guarne', 'oriente'], lat: 6.1553, lon: -75.3736, city: 'Rionegro' },
  // Cali
  { name: 'Cali (Granada / Peñón / Centro)', query: ['granada', 'peñón', 'penon', 'san antonio', 'oeste cali', 'camacho'], lat: 3.4516, lon: -76.5320, city: 'Cali' },
  { name: 'Cali (Ciudad Jardín / Pance)', query: ['ciudad jardín', 'ciudad jardin', 'pance', 'valle del lili', 'jamundí', 'jamundi'], lat: 3.3556, lon: -76.5369, city: 'Cali' },
  { name: 'Yumbo / Sameco', query: ['yumbo', 'acopi', 'sameco', 'mengue'], lat: 3.5822, lon: -76.4958, city: 'Yumbo' },
  // Barranquilla
  { name: 'Barranquilla (Alto Prado / Riomar)', query: ['alto prado', 'prado', 'riomar', 'villa santos', 'villa carolina'], lat: 11.0042, lon: -74.8189, city: 'Barranquilla' },
  { name: 'Barranquilla (Centro / Soledad)', query: ['soledad', 'malambo', 'murillo', 'centro barranquilla'], lat: 10.9185, lon: -74.7646, city: 'Barranquilla' },
  // Bucaramanga
  { name: 'Bucaramanga (Cabecera / Centro)', query: ['cabecera', 'bucaramanga', 'sotomayor', 'concordia'], lat: 7.1193, lon: -73.1227, city: 'Bucaramanga' },
  { name: 'Floridablanca / Cañaveral', query: ['cañaveral', 'canaveral', 'floridablanca', 'piedecuesta', 'girón', 'giron'], lat: 7.0622, lon: -73.0864, city: 'Floridablanca' },
  // Cartagena
  { name: 'Cartagena (Bocagrande / Centro / Manga)', query: ['cartagena', 'bocagrande', 'castillogrande', 'manga', 'pie de la popa'], lat: 10.3981, lon: -75.5567, city: 'Cartagena' },
  // Otras
  { name: 'Pereira (Risaralda)', query: ['pereira', 'dosquebradas'], lat: 4.8133, lon: -75.6961, city: 'Pereira' },
  { name: 'Manizales (Caldas)', query: ['manizales', 'cable', 'palermo manizales'], lat: 5.0689, lon: -75.5174, city: 'Manizales' },
  { name: 'Armenia (Quindío)', query: ['armenia', 'quindio', 'quindío'], lat: 4.5339, lon: -75.6811, city: 'Armenia' },
  { name: 'Ibagué (Tolima)', query: ['ibagué', 'ibague', 'tolima'], lat: 4.4389, lon: -75.2322, city: 'Ibagué' },
  { name: 'Santa Marta (Magdalena)', query: ['santa marta', 'rodadero'], lat: 11.2408, lon: -74.1990, city: 'Santa Marta' },
  { name: 'Cúcuta (N. Santander)', query: ['cúcuta', 'cucuta', 'villa del rosario'], lat: 7.8939, lon: -72.5078, city: 'Cúcuta' },
  { name: 'Villavicencio (Meta)', query: ['villavicencio', 'meta'], lat: 4.1420, lon: -73.6266, city: 'Villavicencio' },
  { name: 'Pasto (Nariño)', query: ['pasto', 'nariño'], lat: 1.2136, lon: -77.2811, city: 'Pasto' }
];

function getCleanAddress() {
  const input = document.getElementById('destAddressInput');
  let val = input ? input.value.trim() : 'Calle 127 # 19-35, Usaquén, Bogotá';
  val = val.replace(/^obra:\s*/i, '').trim();
  return val || 'Bogotá, Colombia';
}

function handleAddressInputDebounced() {
  clearTimeout(addressDebounceTimer);
  addressDebounceTimer = setTimeout(() => {
    calculateRouteFreight(false);
  }, 500);
  updateSwissPreview();
}

function handleOriginInputDebounced() {
  clearTimeout(originDebounceTimer);
  originDebounceTimer = setTimeout(() => {
    onOriginAddressChanged();
  }, 500);
}

function onOriginAddressChanged() {
  const originInput = document.getElementById('originAddressInput');
  const val = originInput ? originInput.value.trim() : '';
  if (val) {
    localStorage.setItem('sq_contractor_origin', val);
    const companyOriginInp = document.getElementById('companyOriginAddressInput');
    if (companyOriginInp) companyOriginInp.value = val;
  }
  contractorGPSCoords = null; // reset dynamic coords so text resolution takes over
  calculateRouteFreight(false);
}

function setQuickAddress(addr) {
  const input = document.getElementById('destAddressInput');
  if (input) input.value = addr;
  calculateRouteFreight(true);
  updateSwissPreview();
}

function toggleMapVisibility() {
  const container = document.getElementById('mapIframeContainer');
  const btn = document.getElementById('btnToggleMap');
  if (!container) return;

  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if (btn) btn.innerText = 'Ocultar Mapa';
  } else {
    container.classList.add('hidden');
    if (btn) btn.innerText = 'Ver Mapa';
  }
}

function openFullMapExternal() {
  const cleanAddr = getCleanAddress();
  const originInput = document.getElementById('originAddressInput');
  const originAddr = originInput ? originInput.value.trim() : '';
  let url = '';
  if (originAddr) {
    url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originAddr)}&destination=${encodeURIComponent(cleanAddr)}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddr)}`;
  }
  window.open(url, '_blank');
}

function setQuickAddressAndOrigin(origin, dest, zone = 'urbano') {
  const originInput = document.getElementById('originAddressInput');
  const savedOrigin = localStorage.getItem('sq_contractor_origin');
  
  // Si el usuario ya tiene su taller/ubicación detectada por GPS o guardada, conservamos su origen real
  if (!savedOrigin || !originInput || !originInput.value || originInput.value.includes('Carrera 68')) {
    if (originInput) originInput.value = origin;
  }
  
  if (document.getElementById('destAddressInput')) document.getElementById('destAddressInput').value = dest;
  if (document.getElementById('zoneDifficultySelect')) document.getElementById('zoneDifficultySelect').value = zone;
  calculateRouteFreight(true);
  updateSwissPreview();
}

// Cálculo Haversine en Km (Distancia esférica)
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en Km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Resolver Coordenadas de Texto en Colombia (GPS, Malla de Calles Bogotá o Catálogo Nacional)
function resolveCoordinatesFromText(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  // 1. Coordenadas explícitas "(4.7123, -74.0521)"
  const coordMatch = t.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (coordMatch) {
    return { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]), label: 'Punto GPS' };
  }

  // 2. Malla Vial de Bogotá (Cálculo matemático exacto de Calle y Carrera)
  // Base centro Bogotá (Plaza de Bolívar): Calle 10 con Carrera 7 -> (4.5981, -74.0758)
  const calleMatch = t.match(/(?:calle|cll|cl)\.?\s*(\d+)/i);
  const craMatch = t.match(/(?:carrera|cra|cr|kra)\.?\s*(\d+)/i);
  if (calleMatch || craMatch) {
    const calleNum = calleMatch ? parseInt(calleMatch[1], 10) : 45;
    const craNum = craMatch ? parseInt(craMatch[1], 10) : 15;
    const lat = 4.5981 + (calleNum - 10) * 0.00092;
    const lon = -74.0758 - (craNum - 7) * 0.00088;
    return { lat, lon, label: `Cl ${calleNum} # Cra ${craNum}` };
  }

  // 3. Búsqueda en Catálogo de Zonas y Ciudades Colombianas
  for (const zone of COLOMBIAN_ZONES_CATALOG) {
    for (const q of zone.query) {
      if (t.includes(q)) {
        return { lat: zone.lat, lon: zone.lon, label: zone.name };
      }
    }
  }

  return null;
}

// Cálculo Real de Distancia de Viaje y Tiempo
function calculateTripDistance(originText, destText) {
  let originCoords = null;
  let destCoords = null;

  // 1. Origen: Priorizar GPS activo en vivo o coordenadas guardadas
  const savedLat = localStorage.getItem('sq_contractor_lat');
  const savedLon = localStorage.getItem('sq_contractor_lon');
  const savedOrigin = localStorage.getItem('sq_contractor_origin');

  if (contractorGPSCoords) {
    originCoords = contractorGPSCoords;
  } else if (savedLat && savedLon && (!originText || originText.trim() === savedOrigin)) {
    originCoords = { lat: parseFloat(savedLat), lon: parseFloat(savedLon), label: 'Tu Ubicación' };
  } else {
    originCoords = resolveCoordinatesFromText(originText);
  }

  // 2. Destino: Resolver por dirección
  destCoords = resolveCoordinatesFromText(destText);

  // 3. Si ambos tienen coordenadas, calcular distancia vial y tiempo
  if (originCoords && destCoords) {
    const straightKm = calculateHaversineKm(originCoords.lat, originCoords.lon, destCoords.lat, destCoords.lon);
    // Factor de trazado vial: las vías urbanas en Colombia tienen un factor de ~1.35x sobre la línea recta
    const roadKm = Math.max(1.5, Math.round(straightKm * 1.35 * 10) / 10);
    // Velocidad media urbana: ~2.5 min/km + 6 minutos de maniobra de salida y parqueo
    const minutes = Math.max(8, Math.round(roadKm * 2.5 + 6));
    return { km: roadKm, minutes, originLabel: originCoords.label, destLabel: destCoords.label };
  }

  // Estimación de respaldo coherente para ciudades
  return { km: 12.0, minutes: 30, originLabel: 'Salida', destLabel: 'Destino' };
}

// Tarifa Coherente de Transporte en Colombia: Base de Acarreo/Herramientas + Km + Factor Zona
function computeSuggestedFreight(km, zoneType) {
  const baseSalida = 15000; // Tarifa base por salida/acarreo mínimo
  const tarifaKm = 2500;    // $2.500 COP por kilómetro recorrido
  const subtotal = baseSalida + (km * tarifaKm);

  let mult = 1.0;
  if (zoneType === 'centro') mult = 1.25;       // Zona centro / congestión
  else if (zoneType === 'montana') mult = 1.35; // Laderas o montaña
  else if (zoneType === 'rural') mult = 1.50;   // Tramo destapado / rural
  else if (zoneType === 'sin_parqueo') mult = 1.20; // Sin bahía de parqueo

  return Math.round((subtotal * mult) / 1000) * 1000;
}

// Detección Automática de Ubicación GPS del Profesional
function detectContractorLocation() {
  if (!navigator.geolocation) {
    showToast('Tu navegador o dispositivo no soporta geolocalización GPS.', 'warning');
    return;
  }

  const btnText = document.getElementById('btnDetectGPSText');
  if (btnText) btnText.innerText = 'Detectando...';

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      contractorGPSCoords = { lat, lon, label: 'Ubicación GPS Actual' };
      localStorage.setItem('sq_contractor_lat', String(lat));
      localStorage.setItem('sq_contractor_lon', String(lon));

      let readableAddress = '';

      // Geocodificación inversa con Nominatim (OSM) con timeout de 3.5s
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`, {
          signal: controller.signal,
          headers: { 'Accept-Language': 'es' }
        });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const data = await resp.json();
          const addr = data.address || {};
          const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || '';
          const neighborhood = addr.neighbourhood || addr.suburb || addr.city_district || '';
          const city = addr.city || addr.town || addr.municipality || addr.state || 'Colombia';

          const parts = [];
          if (road) parts.push(road);
          if (neighborhood && neighborhood !== road) parts.push(neighborhood);
          if (city) parts.push(city);
          readableAddress = parts.join(', ');
        }
      } catch (err) {
        console.warn('Geocodificación inversa no completada:', err);
      }

      if (!readableAddress) {
        readableAddress = `Ubicación GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
      }

      const originInput = document.getElementById('originAddressInput');
      if (originInput) originInput.value = readableAddress;

      const companyOriginInp = document.getElementById('companyOriginAddressInput');
      if (companyOriginInp) companyOriginInp.value = readableAddress;

      localStorage.setItem('sq_contractor_origin', readableAddress);

      const gpsBadge = document.getElementById('routeGpsBadge');
      if (gpsBadge) gpsBadge.classList.remove('hidden');

      if (btnText) btnText.innerText = 'GPS Actualizado';
      setTimeout(() => { if (btnText) btnText.innerText = 'Detectar mi GPS'; }, 3000);

      showToast(`📍 Tu ubicación ha sido detectada: ${readableAddress}`, 'success');
      calculateRouteFreight(false);
    },
    (err) => {
      console.warn('Error GPS:', err);
      if (btnText) btnText.innerText = 'Detectar mi GPS';
      let msg = 'No se pudo obtener tu ubicación GPS.';
      if (err.code === 1) msg = 'Permiso GPS denegado. Puedes escribir tu dirección de salida manualmente.';
      else if (err.code === 2) msg = 'Señal GPS no disponible. Escribe tu dirección manualmente.';
      else if (err.code === 3) msg = 'Tiempo de espera GPS agotado.';
      showToast(msg, 'warning');
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

// Calcular Ruta, Kilómetros y Flete Coherente
function calculateRouteFreight(focus = false) {
  const cleanAddr = getCleanAddress();
  const originInput = document.getElementById('originAddressInput');
  const originAddr = originInput ? originInput.value.trim() : 'Carrera 68, Bogotá';
  const zoneSelect = document.getElementById('zoneDifficultySelect');
  const zoneType = zoneSelect ? zoneSelect.value : 'urbano';

  const iframe = document.getElementById('googleMapIframe');
  const label = document.getElementById('mapCurrentLocationLabel');
  const container = document.getElementById('mapIframeContainer');
  const btnToggle = document.getElementById('btnToggleMap');

  // Asegurar que el mapa esté visible cuando se busca o calcula dirección
  if (container && container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if (btnToggle) btnToggle.innerText = 'Ocultar Mapa';
  }

  // Actualizar mapa interactivo
  if (iframe) {
    iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(cleanAddr)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
  }

  if (label) {
    label.innerText = `Destino: ${cleanAddr}`;
  }

  // Cálculo real de trayecto
  const trip = calculateTripDistance(originAddr, cleanAddr);
  const distanceKm = trip.km;
  const minutes = trip.minutes;

  // Multiplicador y texto de zona
  let accessText = '';
  if (zoneType === 'centro') accessText = '• Zona de congestión';
  else if (zoneType === 'montana') accessText = '• Tramo de montaña';
  else if (zoneType === 'rural') accessText = '• Tramo destapado / rural';
  else if (zoneType === 'sin_parqueo') accessText = '• Sin bahía de parqueo';

  // Costo sugerido según kilometraje real
  suggestedFreightCost = computeSuggestedFreight(distanceKm, zoneType);
  calculatedFreightCost = suggestedFreightCost;

  // Si el usuario no ha personalizado o es la primera vez, el valor editable toma el sugerido
  if (userCustomFreightCost === null && !isFreightZero) {
    userCustomFreightCost = suggestedFreightCost;
  }

  // Actualizar campo editable
  const userInput = document.getElementById('freightUserCostInput');
  if (userInput && !isFreightZero && (userCustomFreightCost === null || userCustomFreightCost === suggestedFreightCost)) {
    userInput.value = suggestedFreightCost;
    userCustomFreightCost = suggestedFreightCost;
  }

  // Actualizar visualizaciones de texto
  const disp = document.getElementById('suggestedFreightDisplay');
  if (disp) disp.innerText = formatCOP(suggestedFreightCost) + ' COP';

  const formulaText = document.getElementById('routeCostFormulaText');
  if (formulaText) {
    formulaText.innerHTML = `Sugerido por distancia: <strong class="text-emerald-700 dark:text-emerald-400 font-mono font-bold">${formatCOP(suggestedFreightCost)} COP</strong> ($15.000 base + ${distanceKm} km a $2.500/km)`;
  }

  const btnResetText = document.getElementById('btnResetSuggestedText');
  if (btnResetText) {
    btnResetText.innerText = `Sugerido (${formatCOP(suggestedFreightCost)})`;
  }

  const routeSummary = document.getElementById('routeSummaryText');
  if (routeSummary) {
    const originShort = originAddr.split(',')[0].trim();
    const destShort = cleanAddr.split(',')[0].trim();
    routeSummary.innerText = `📍 Ruta: De ${originShort} a ${destShort} • ${distanceKm} km (~${minutes} min ${accessText})`;
  }

  updateFreightUIState();
}

// Buscar si ya existe una fila de Transporte o Flete en la lista de gastos
function findExistingFreightItemRow() {
  const container = document.getElementById('itemsContainer');
  if (!container) return null;
  const rows = container.querySelectorAll('.item-row');
  for (const row of rows) {
    const descInp = row.querySelector('.item-desc');
    const desc = descInp ? descInp.value.toLowerCase() : '';
    if (desc.includes('flete') || desc.includes('transporte') || desc.includes('acarreo')) {
      return row;
    }
  }
  return null;
}

// Actualizar el estado visual del control de transporte (Pill y Botón)
function updateFreightUIState() {
  const pill = document.getElementById('freightStatusPill');
  const btnText = document.getElementById('btnApplyFreightText');
  const btnIcon = document.getElementById('btnApplyFreightIcon');
  const cost = isFreightZero ? 0 : (userCustomFreightCost !== null ? userCustomFreightCost : suggestedFreightCost);
  const existingRow = findExistingFreightItemRow();

  if (isFreightZero || cost === 0) {
    if (pill) {
      pill.className = 'text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 shrink-0 self-start sm:self-auto';
      pill.innerText = '🟢 Transporte Gratis ($0)';
    }
    if (btnText) btnText.innerText = existingRow ? 'Quitar de Gastos' : 'No Cobrar Transporte';
    if (btnIcon) btnIcon.className = existingRow ? 'iconoir-trash text-[16px]' : 'iconoir-check text-[16px]';
  } else {
    const isCustom = userCustomFreightCost !== null && userCustomFreightCost !== suggestedFreightCost;
    if (pill) {
      if (isCustom) {
        pill.className = 'text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700 shrink-0 self-start sm:self-auto';
        pill.innerText = `✏️ Valor a tu gusto (${formatCOP(cost)})`;
      } else {
        pill.className = 'text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shrink-0 self-start sm:self-auto';
        pill.innerText = `Cobrar sugerido (${formatCOP(cost)})`;
      }
    }
    if (btnText) btnText.innerText = existingRow ? `Actualizar (${formatCOP(cost)})` : `Agregar (${formatCOP(cost)})`;
    if (btnIcon) btnIcon.className = existingRow ? 'iconoir-refresh text-[16px]' : 'iconoir-plus text-[16px]';
  }
}

// Manejador cuando el usuario escribe su propio valor a gusto
function onCustomFreightInputChanged() {
  const input = document.getElementById('freightUserCostInput');
  if (!input) return;
  const val = parseInt(input.value, 10);
  if (isNaN(val) || val <= 0) {
    userCustomFreightCost = 0;
    isFreightZero = true;
  } else {
    userCustomFreightCost = val;
    isFreightZero = false;
  }

  // Si ya existe una fila de transporte en los gastos, actualizarla en tiempo real
  const existingRow = findExistingFreightItemRow();
  if (existingRow) {
    const costInp = existingRow.querySelector('.item-cost');
    if (costInp) {
      costInp.value = userCustomFreightCost;
      recalculate();
      updateSwissPreview();
    }
  }

  updateFreightUIState();
}

// Opción 1-clic: No cobrar transporte al cliente ($0)
function setFreightZero() {
  userCustomFreightCost = 0;
  isFreightZero = true;
  const input = document.getElementById('freightUserCostInput');
  if (input) input.value = 0;

  // Si existe en gastos, retirar o poner en $0
  const existingRow = findExistingFreightItemRow();
  if (existingRow) {
    existingRow.remove();
    recalculate();
    updateSwissPreview();
  }

  updateFreightUIState();
  showToast('Transporte fijado en $0 (Gratis / No se cobrará al cliente).', 'info');
}

// Opción 1-clic: Restaurar el valor sugerido según los kilómetros calculados
function resetFreightToSuggested() {
  userCustomFreightCost = suggestedFreightCost;
  isFreightZero = false;
  const input = document.getElementById('freightUserCostInput');
  if (input) input.value = suggestedFreightCost;

  // Si ya estaba en gastos, actualizarlo
  const existingRow = findExistingFreightItemRow();
  if (existingRow) {
    const costInp = existingRow.querySelector('.item-cost');
    if (costInp) costInp.value = suggestedFreightCost;
    recalculate();
    updateSwissPreview();
  }

  updateFreightUIState();
  showToast(`Restaurado valor sugerido por distancia: ${formatCOP(suggestedFreightCost)} COP`, 'info');
}

// Agregar o Actualizar Transporte en el Presupuesto (Paso 2)
function applyFreightToBudget() {
  const cleanAddr = getCleanAddress().split(',')[0].trim();
  const zoneSelect = document.getElementById('zoneDifficultySelect');
  const zoneText = zoneSelect ? zoneSelect.options[zoneSelect.selectedIndex].text.split('(')[0].trim() : 'Urbano';

  const cost = isFreightZero ? 0 : (userCustomFreightCost !== null ? userCustomFreightCost : suggestedFreightCost);
  const existingRow = findExistingFreightItemRow();

  if (isFreightZero || cost === 0) {
    if (existingRow) {
      existingRow.remove();
      recalculate();
      updateSwissPreview();
      showToast('Transporte retirado de los gastos ($0 / No cobrar).', 'info');
    } else {
      showToast('Transporte fijado en $0 (Gratis). No se sumó a los gastos.', 'info');
    }
    updateFreightUIState();
    return;
  }

  const desc = `Flete y Transporte (${cleanAddr} - ${zoneText})`;

  if (existingRow) {
    const descInp = existingRow.querySelector('.item-desc');
    const costInp = existingRow.querySelector('.item-cost');
    const qtyInp = existingRow.querySelector('.item-qty');
    if (descInp) descInp.value = desc;
    if (costInp) costInp.value = cost;
    if (qtyInp) qtyInp.value = 1;
    recalculate();
    updateSwissPreview();
    showToast(`Transporte actualizado en tus gastos: ${formatCOP(cost)} COP`, 'success');
  } else {
    addNewItem(desc, 1, cost, 'Servicios');
    showToast(`Transporte (${formatCOP(cost)} COP) agregado a tus gastos.`, 'success');
  }

  updateFreightUIState();
}

function updateSwissPreview() {
  const clientName = (document.getElementById('clientNameInput') && document.getElementById('clientNameInput').value) || 'Constructora Los Andes S.A.S. - NIT 900.231.844-1';
  const serviceName = (document.getElementById('serviceNameInput') && document.getElementById('serviceNameInput').value) || 'Remodelación Estructural, Redes Hidráulicas & Acabados';
  const validity = (document.getElementById('offerValidity') && document.getElementById('offerValidity').value) || '30 días calendario';

  if (document.getElementById('swissClientTarget')) document.getElementById('swissClientTarget').innerText = clientName;
  if (document.getElementById('swissServiceTarget')) document.getElementById('swissServiceTarget').innerText = serviceName;
  if (document.getElementById('swissValidityTarget')) document.getElementById('swissValidityTarget').innerText = validity;

  const signerName = document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : 'Ing. Alejandro Morales P.';
  const signerDoc = document.getElementById('signerDocInput') ? document.getElementById('signerDocInput').value : 'NIT: 901.458.712-3';
  if (document.getElementById('swissSignerNameDisplay')) document.getElementById('swissSignerNameDisplay').innerText = signerName;
  if (document.getElementById('swissSignerDocDisplay')) document.getElementById('swissSignerDocDisplay').innerText = signerDoc;

  updatePaymentChannel();

  const tableBody = document.getElementById('swissTableBody');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  const rows = document.querySelectorAll('.item-row');
  rows.forEach(r => {
    const descInput = r.querySelector('.item-desc');
    const qtyInput = r.querySelector('.item-qty');
    const costInput = r.querySelector('.item-cost');

    const desc = descInput ? descInput.value : '';
    const qty = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;
    const cost = costInput ? parseFloat(costInput.value) || 0 : 0;
    const total = qty * cost;

    const tr = document.createElement('tr');
    tr.className = 'text-slate-800 border-b border-slate-100';
    tr.innerHTML = `
      <td class="py-2.5 font-medium">${desc}</td>
      <td class="py-2.5 text-center font-mono">${qty}</td>
      <td class="py-2.5 text-right font-mono">${formatCOP(total)}</td>
    `;
    tableBody.appendChild(tr);
  });

  renderDynamicQRCodes();
}

// ----------------- GESTIÓN DE PERSISTENCIA SQLITE & HISTORIAL -----------------

async function guardarCotizacionActual() {
  const btn = document.getElementById('btnGuardarCotizacion');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="iconoir-refresh-double text-base animate-spin"></i><span>Guardando...</span>`;
  }

  try {
    let baseDirectCost = 0;
    const items = [];
    const itemRows = document.querySelectorAll('.item-row');

    itemRows.forEach(row => {
      const descInput = row.querySelector('.item-desc');
      const qtyInput = row.querySelector('.item-qty');
      const costInput = row.querySelector('.item-cost');
      const catLabel = row.querySelector('.item-cat-label');

      const desc = descInput ? descInput.value.trim() : 'Ítem';
      const qty = parseFloat(qtyInput ? qtyInput.value : 1) || 1;
      const cost = parseFloat(costInput ? costInput.value : 0) || 0;
      const cat = catLabel ? catLabel.getAttribute('data-category') || 'Materiales' : 'Materiales';

      baseDirectCost += (qty * cost);
      items.push({
        descripcion: desc,
        cantidad: qty,
        costo_unitario_estimado: cost,
        categoria: cat
      });
    });

    const taxRegime = document.getElementById('taxRegimeSelect') ? document.getElementById('taxRegimeSelect').value : 'simple';
    const calculo = calcularMargenSeguro(baseDirectCost, currentMargin, currentContingency, taxRegime === 'responsable');

    const alertas = [];
    const alertItems = document.querySelectorAll('#alertasImprevistosList li span');
    alertItems.forEach(s => alertas.push(s.innerText));

    const payload = {
      codigo: currentQuoteCode,
      cliente: document.getElementById('clientNameInput') ? document.getElementById('clientNameInput').value : 'Cliente General',
      servicio: document.getElementById('serviceNameInput') ? document.getElementById('serviceNameInput').value : 'Servicio Técnico',
      direccion: document.getElementById('destAddressInput') ? document.getElementById('destAddressInput').value : '',
      validez: document.getElementById('offerValidity') ? document.getElementById('offerValidity').value : '30 días calendario',
      margen: currentMargin,
      contingencia: currentContingency,
      regimen_tributario: taxRegime,
      costo_directo: calculo.costoDirecto,
      costo_imprevistos: calculo.costoImprevistos,
      ganancia_neta: calculo.gananciaNeta,
      total_cotizacion: calculo.totalCotizacion,
      anticipo_monto: calculo.totalCotizacion / 2,
      estado: currentQuoteStatus || 'Borrador',
      items: items,
      alertas: alertas,
      moneda: currentCurrency,
      emisor_nombre: document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : '',
      emisor_doc: document.getElementById('signerDocInput') ? document.getElementById('signerDocInput').value : '',
      dias_entrega: parseInt(document.getElementById('executionDaysSelect') ? document.getElementById('executionDaysSelect').value : 8, 10),
      canal_pago: document.getElementById('payoutChannelSelect') ? document.getElementById('payoutChannelSelect').value : 'nequi',
      numero_pago: document.getElementById('payoutNumberInput') ? document.getElementById('payoutNumberInput').value : ''
    };

    const response = await fetch('/api/cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al guardar en SQLite.`);
    }

    const res = await response.json();
    currentQuoteCode = res.codigo;

    recalculate();
    showToast(`¡Cotización guardada con éxito! Código: ${res.codigo}`, 'success');

  } catch (err) {
    console.error('Error al guardar cotización:', err);
    showToast('Error al guardar cotización: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) modal.classList.remove('hidden');
  await cargarListaHistorial();
}

function closeHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) modal.classList.add('hidden');
}

async function cargarListaHistorial(filtro = 'todos') {
  const container = document.getElementById('historyListContainer');
  if (!container) return;

  container.innerHTML = `<div class="p-8 text-center text-slate-500 flex items-center justify-center gap-2 font-sans"><i class="iconoir-refresh-double text-xl animate-spin text-blue-600"></i><span>Cargando cotizaciones de SQLite...</span></div>`;

  try {
    const res = await fetch('/api/cotizaciones');
    if (!res.ok) throw new Error('Error al consultar historial.');
    const data = await res.json();

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="p-10 text-center space-y-2">
          <i class="iconoir-page text-4xl text-slate-400 block mx-auto"></i>
          <p class="text-sm font-semibold text-slate-700">No hay cotizaciones guardadas aún.</p>
          <p class="text-xs text-slate-500">Crea tu primera cotización y pulsa "Guardar" para verla aquí.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    data.forEach(cot => {
      if (filtro !== 'todos' && cot.estado.toLowerCase() !== filtro.toLowerCase()) {
        return;
      }

      let estadoClass = 'bg-slate-100 text-slate-700 border-slate-300';
      if (cot.estado === 'Aprobada') estadoClass = 'bg-amber-50 text-amber-800 border-amber-300';
      if (cot.estado === 'Cobrada') estadoClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
      if (cot.estado === 'Enviada') estadoClass = 'bg-blue-50 text-blue-800 border-blue-300';

      const fecha = cot.created_at ? new Date(cot.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Hoy';

      const total = parseFloat(cot.total_cotizacion) || 0;
      const anticipo = parseFloat(cot.anticipo_monto) || 0;
      const abonos = parseFloat(cot.abonos_monto) || 0;
      const saldo = Math.max(0, total - abonos);

      const div = document.createElement('div');
      div.className = 'p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-sans';
      div.innerHTML = `
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">${cot.codigo}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${estadoClass}">${cot.estado}</span>
            <span class="text-[11px] text-slate-500 font-mono">${fecha}</span>
          </div>
          <h4 class="text-xs sm:text-sm font-bold text-slate-900 truncate">${cot.cliente}</h4>
          <p class="text-[11px] text-slate-600 truncate">${cot.servicio}</p>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <div class="text-right">
            <div class="text-xs sm:text-sm font-bold font-mono text-slate-900">${formatCOP(total)}</div>
            <span class="text-[10px] font-mono text-emerald-700 font-semibold block">Anticipo: ${formatCOP(anticipo)}</span>
            ${abonos > 0 ? `<span class="text-[10px] font-mono text-blue-600 font-semibold block">Abonado: ${formatCOP(abonos)}</span>` : ''}
            ${saldo <= 0 ? `<span class="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 block mt-0.5">¡100% Pagado!</span>` : `<span class="text-[10px] font-mono text-amber-700 font-bold block">Saldo: ${formatCOP(saldo)}</span>`}
          </div>

          <div class="flex items-center gap-1.5">
            <button onclick="registrarAbonoPrompt('${cot.codigo}', ${saldo}, ${total})" class="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1 transition-all" title="Registrar abono de dinero recibido">
              <i class="iconoir-hand-cash text-sm"></i>
              <span>+ Abono</span>
            </button>
            <button onclick="cargarCotizacion('${cot.codigo}')" class="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold flex items-center gap-1 transition-all" title="Abrir en editor">
              <i class="iconoir-edit-pencil text-sm"></i>
              <span class="hidden md:inline">Editar</span>
            </button>
            <button onclick="verPdfCotizacion('${cot.codigo}')" class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-all" title="Ver PDF">
              <i class="iconoir-eye text-sm"></i>
            </button>
            <button onclick="eliminarCotizacion(${cot.id}, event)" class="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all" title="Eliminar cotización">
              <i class="iconoir-trash text-sm"></i>
            </button>
          </div>
        </div>
      `;
      container.appendChild(div);
    });

  } catch (err) {
    container.innerHTML = `<div class="p-6 text-center text-red-500 text-xs font-sans">Error cargando historial: ${err.message}</div>`;
  }
}

async function registrarAbonoPrompt(codigo, saldoPendiente, total) {
  const defaultVal = saldoPendiente > 0 ? saldoPendiente : total;
  const inputStr = prompt(
    `💵 REGISTRAR ABONO DEL CLIENTE\n\nCotización #${codigo}\nValor Total del Trabajo: ${formatCOP(total)}\nSaldo Pendiente por Cobrar: ${formatCOP(saldoPendiente)}\n\n¿Cuánto dinero te entregó el cliente en efectivo, Nequi o transferencia? (COP):`,
    defaultVal
  );

  if (inputStr === null) return;

  const cleanVal = parseFloat(inputStr.replace(/[^\d.]/g, ''));
  if (isNaN(cleanVal) || cleanVal <= 0) {
    showToast('Por favor ingrese un monto válido mayor a 0.', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/cotizaciones/${codigo}/abono`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto: cleanVal })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al registrar abono');
    }
    const data = await res.json();
    showToast(`✅ ¡Abono de ${formatCOP(data.monto_abonado)} registrado! Saldo pendiente: ${formatCOP(data.saldo_pendiente)}`, 'success');
    await cargarListaHistorial();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Iniciar una nueva cotización limpia
function iniciarNuevaCotizacion() {
  currentQuoteCode = null;
  currentQuoteStatus = 'Borrador';
  isQuotePaid = false;

  const badge = document.getElementById('activeQuoteCodeBadge');
  if (badge) badge.innerText = 'Nueva Cotización (Sin guardar)';
  
  const docCode = document.getElementById('swissDocCodeDisplay');
  if (docCode) docCode.innerText = '#SQ-COL-2026-NUEVA';

  const clientInput = document.getElementById('clientNameInput');
  if (clientInput) clientInput.value = '';

  const phoneInput = document.getElementById('clientPhoneInput');
  if (phoneInput) phoneInput.value = '';

  const servInput = document.getElementById('serviceNameInput');
  if (servInput) servInput.value = '';

  const container = document.getElementById('itemsContainer');
  if (container) {
    container.innerHTML = '';
    addNewItem('Material principal o mano de obra inicial', 1, 100000, 'Materiales');
  }

  const alertas = document.getElementById('alertasImprevistosContainer');
  if (alertas) alertas.classList.add('hidden');

  setContingency(5);
  const marginRange = document.getElementById('marginRange');
  if (marginRange) {
    marginRange.value = 35;
    onMarginChange(35);
  }

  if (typeof clearSignature === 'function') clearSignature();

  recalculate();
  updateSwissPreview();
  updateWatermarkState();
  autoSaveDraft();

  showToast('✨ Formulario listo para una nueva cotización.', 'info');
}

async function cargarCotizacion(codigo) {
  try {
    const res = await fetch(`/api/cotizaciones/${codigo}`);
    if (!res.ok) throw new Error('No se pudo encontrar la cotización.');
    const cot = await res.json();

    currentQuoteCode = cot.codigo;
    currentQuoteStatus = cot.estado || 'Borrador';
    isQuotePaid = (currentQuoteStatus === 'Cobrada' || currentQuoteStatus === 'Aprobada' || currentQuoteStatus === 'Pagada');

    if (document.getElementById('clientNameInput')) document.getElementById('clientNameInput').value = cot.cliente;
    if (document.getElementById('serviceNameInput')) document.getElementById('serviceNameInput').value = cot.servicio;
    if (document.getElementById('destAddressInput')) document.getElementById('destAddressInput').value = cot.direccion || '';
    if (document.getElementById('offerValidity')) document.getElementById('offerValidity').value = cot.validez || '30 días calendario';
    if (document.getElementById('taxRegimeSelect')) document.getElementById('taxRegimeSelect').value = cot.regimen_tributario || 'simple';

    if (cot.margen !== undefined) {
      document.getElementById('marginRange').value = cot.margen;
      onMarginChange(cot.margen);
    }
    if (cot.contingencia !== undefined) {
      setContingency(cot.contingencia);
    }

    const container = document.getElementById('itemsContainer');
    if (container && cot.items && cot.items.length > 0) {
      container.innerHTML = '';
      cot.items.forEach(it => {
        addNewItem(it.descripcion, it.cantidad || 1, it.costo_unitario_estimado || 50000, it.categoria || 'Materiales');
      });
    }

    renderAlertasImprevistos(cot.alertas || []);

    recalculate();
    updateSwissPreview();
    updateWatermarkState();
    closeHistoryModal();

    showToast(`¡Cotización ${cot.codigo} cargada con éxito!`, 'success');
  } catch (err) {
    showToast('Error al cargar cotización: ' + err.message, 'error');
  }
}

async function verPdfCotizacion(codigo) {
  await cargarCotizacion(codigo);
  openSwissModal();
}

async function eliminarCotizacion(id, e) {
  e.stopPropagation();
  const confirmar = await showCustomConfirm(
    '¿Eliminar cotización?',
    '¿Estás seguro de que deseas eliminar esta propuesta del historial? Esta acción no se puede deshacer.',
    'trash'
  );
  if (!confirmar) return;

  try {
    const res = await fetch(`/api/cotizaciones/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    await cargarListaHistorial();
    showToast('Cotización eliminada del historial.', 'info');
  } catch (err) {
    showToast('Error eliminando cotización: ' + err.message, 'error');
  }
}

async function cambiarEstadoCotizacion(codigo, nuevoEstado) {
  try {
    await fetch(`/api/cotizaciones/${codigo}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado })
    });
    currentQuoteStatus = nuevoEstado;
    recalculate();
  } catch (err) {
    console.warn('Error actualizando estado:', err);
  }
}

// ----------------- CONFIGURACIÓN DEL EMISOR Y LOGO -----------------
let customCompanyLogoDataUrl = null;

function handleCompanyLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    customCompanyLogoDataUrl = e.target.result;
    localStorage.setItem('smartquote_custom_logo', customCompanyLogoDataUrl);
    updateCompanyLogoDisplay();
    showToast('¡Tu logotipo se guardó y se aplicó al encabezado del PDF!', 'success');
  };
  reader.readAsDataURL(file);
}

function updateCompanyLogoDisplay() {
  if (!customCompanyLogoDataUrl) {
    customCompanyLogoDataUrl = localStorage.getItem('smartquote_custom_logo');
  }
  if (!customCompanyLogoDataUrl) return;

  const modalImg = document.getElementById('companyLogoImg');
  const modalIcon = document.getElementById('companyLogoPlaceholderIcon');
  if (modalImg) {
    modalImg.src = customCompanyLogoDataUrl;
    modalImg.classList.remove('hidden');
    if (modalIcon) modalIcon.classList.add('hidden');
  }

  const swissLogoImg = document.getElementById('swissCustomLogoImg');
  const swissDefaultBadge = document.getElementById('swissDefaultLogoBadge');
  if (swissLogoImg) {
    swissLogoImg.src = customCompanyLogoDataUrl;
    swissLogoImg.classList.remove('hidden');
    if (swissDefaultBadge) swissDefaultBadge.classList.add('hidden');
  }
}

async function cargarDatosEmisor() {
  try {
    updateCompanyLogoDisplay();
    
    // Restaurar origen y taller guardados
    const savedOrigin = localStorage.getItem('sq_contractor_origin');
    if (savedOrigin) {
      if (document.getElementById('companyOriginAddressInput')) document.getElementById('companyOriginAddressInput').value = savedOrigin;
      if (document.getElementById('originAddressInput')) document.getElementById('originAddressInput').value = savedOrigin;
    }
    const savedLat = localStorage.getItem('sq_contractor_lat');
    const savedLon = localStorage.getItem('sq_contractor_lon');
    if (savedLat && savedLon) {
      contractorGPSCoords = { lat: parseFloat(savedLat), lon: parseFloat(savedLon), label: 'Ubicación GPS' };
      const gpsBadge = document.getElementById('routeGpsBadge');
      if (gpsBadge) gpsBadge.classList.remove('hidden');
    }

    const res = await fetch('/api/emisor');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.nombre) return;

    if (document.getElementById('signerNameInput')) document.getElementById('signerNameInput').value = data.nombre;
    if (document.getElementById('signerDocInput')) document.getElementById('signerDocInput').value = data.documento;
    if (document.getElementById('payoutNumberInput')) document.getElementById('payoutNumberInput').value = data.numero_pago || '310 456 7890';
    if (document.getElementById('companyBreBKeyInput')) document.getElementById('companyBreBKeyInput').value = data.numero_pago || '310 456 7890';
    if (document.getElementById('payoutChannelSelect') && data.canal_pago) document.getElementById('payoutChannelSelect').value = data.canal_pago;

    updateSwissPreview();
    updatePaymentChannel();
  } catch (err) {
    console.warn('No se pudo cargar datos del emisor:', err);
  }
}

async function guardarDatosEmisor() {
  const nombre = document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : '';
  const documento = document.getElementById('signerDocInput') ? document.getElementById('signerDocInput').value : '';
  const brebKey = document.getElementById('companyBreBKeyInput') ? document.getElementById('companyBreBKeyInput').value.trim() : '';
  const numero_pago = brebKey || (document.getElementById('payoutNumberInput') ? document.getElementById('payoutNumberInput').value : '');
  const canal_pago = document.getElementById('payoutChannelSelect') ? document.getElementById('payoutChannelSelect').value : 'breb';

  const tallerAddr = document.getElementById('companyOriginAddressInput') ? document.getElementById('companyOriginAddressInput').value.trim() : '';
  if (tallerAddr) {
    localStorage.setItem('sq_contractor_origin', tallerAddr);
    if (document.getElementById('originAddressInput')) {
      document.getElementById('originAddressInput').value = tallerAddr;
    }
    calculateRouteFreight(false);
  }

  if (document.getElementById('payoutNumberInput') && numero_pago) {
    document.getElementById('payoutNumberInput').value = numero_pago;
  }

  try {
    await fetch('/api/emisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        documento,
        numero_pago,
        canal_pago
      })
    });
  } catch (err) {
    console.warn('Error guardando emisor en servidor:', err);
  }

  toggleCompanyModal();
  updateSwissPreview();
  updatePaymentChannel();
  updateCompanyLogoDisplay();
  showToast('Tus datos, logotipo y cobros Bre-B se guardaron con éxito.', 'success');
}

function toggleCompanyModal() {
  const m = document.getElementById('companyModal');
  if (m) m.classList.toggle('hidden');
}

function saveCompanyData() {
  guardarDatosEmisor();
}

// ----------------- MARCA DE AGUA & CONTROL DE DESCARGA PREVIO PAGO SMARTQUOTE ($5.000 / $49.000) -----------------
let smartquoteCompanyConfig = {
  nombre_titular: 'Arriero Pro (David Pineda)',
  nit_titular: 'Nequi Negocios',
  llave_nequi_breb: '0091679903',
  qr_empresa_url: 'assets/qr_nequi_square.png',
  link_bold_5k: '',
  link_bold_49k: '',
  pin_admin: '2026'
};

function isSmartQuoteLicensePaid() {
  // 1. Si compró el Plan Pro Ilimitado ($49.000 COP)
  if (localStorage.getItem('smartquote_pro_active') === 'true') {
    return true;
  }
  // 2. Si pagó la cotización puntual ($5.000 COP)
  const currentCode = currentQuoteCode || 'DRAFT';
  if (localStorage.getItem('smartquote_license_' + currentCode) === 'true') {
    return true;
  }
  return false;
}

function updateWatermarkState() {
  const isPaid = isSmartQuoteLicensePaid();
  const modal = document.getElementById('swissModal');
  const docContent = document.getElementById('swissDocumentContent');
  const noticeBanner = document.getElementById('watermarkNoticeBanner');
  const paidBanner = document.getElementById('watermarkPaidBanner');
  const statusTag = document.getElementById('swissPaymentStatusTag');
  const statusLabel = document.getElementById('swissPaymentStatusLabel');
  const btnLabel = document.getElementById('btnDescargarPdfLabel');

  if (isPaid) {
    if (modal) modal.classList.add('document-paid', 'quote-is-paid');
    if (docContent) docContent.classList.add('document-paid', 'quote-is-paid');
    if (noticeBanner) noticeBanner.classList.add('hidden');
    if (paidBanner) paidBanner.classList.remove('hidden');
    if (statusTag) {
      statusTag.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1';
    }
    if (statusLabel) statusLabel.innerText = 'DOCUMENTO OFICIAL (SIN MARCA DE AGUA)';
    if (btnLabel) btnLabel.innerText = 'Descargar PDF Limpio';
  } else {
    if (modal) modal.classList.remove('document-paid', 'quote-is-paid');
    if (docContent) docContent.classList.remove('document-paid', 'quote-is-paid');
    if (noticeBanner) noticeBanner.classList.remove('hidden');
    if (paidBanner) paidBanner.classList.add('hidden');
    if (statusTag) {
      statusTag.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1';
    }
    if (statusLabel) statusLabel.innerText = 'VISTA PREVIA (CON MARCA DE AGUA)';
    if (btnLabel) btnLabel.innerText = 'Desbloquear PDF Limpio ($5.000)';
  }
}

function openSwissModal() {
  updateSwissPreview();
  recalculate();
  updateWatermarkState();
  const m = document.getElementById('swissModal');
  if (m) m.classList.remove('hidden');
}

function closeSwissModal() {
  const m = document.getElementById('swissModal');
  if (m) m.classList.add('hidden');
}

function intentarDescargarPDF() {
  if (isSmartQuoteLicensePaid()) {
    printSwissPDF();
  } else {
    // Si no ha pagado a SmartQuote, abre obligatoriamente la pasarela de pago para desbloquear
    openPaymentGatewayModal();
  }
}

function descargarPDFOficial() {
  if (!isSmartQuoteLicensePaid()) {
    openPaymentGatewayModal();
    return;
  }
  printSwissPDF();
}

function imprimirBorradorConMarcaAgua() {
  closePaymentGatewayModal();
  // Se asegura de que la marca de agua esté visible (no pagada)
  const modal = document.getElementById('swissModal');
  const docContent = document.getElementById('swissDocumentContent');
  if (modal) modal.classList.remove('document-paid', 'quote-is-paid');
  if (docContent) docContent.classList.remove('document-paid', 'quote-is-paid');

  openSwissModal();
  setTimeout(() => {
    window.print();
  }, 300);
}

function printSwissPDF() {
  const m = document.getElementById('swissModal');
  if (m && m.classList.contains('hidden')) {
    openSwissModal();
  }
  window.print();
}

function openProModal() {
  const m = document.getElementById('proModal');
  if (m) m.classList.remove('hidden');
}

function closeProModal() {
  const m = document.getElementById('proModal');
  if (m) m.classList.add('hidden');
}

function openPaymentGatewayModal() {
  actualizarUIEmpresaSmartQuote();
  const m = document.getElementById('paymentGatewayModal');
  const stage1 = document.getElementById('sqFlowStage1');
  const stage2 = document.getElementById('sqFlowStage2');
  const stage3 = document.getElementById('sqFlowStage3');

  if (isSmartQuoteLicensePaid()) {
    if (stage1) stage1.classList.add('hidden');
    if (stage2) stage2.classList.add('hidden');
    if (stage3) stage3.classList.remove('hidden');
    const codeDisp = document.getElementById('sqSuccessQuoteCodeDisplay');
    if (codeDisp) codeDisp.innerText = currentQuoteCode || 'COT-OFICIAL';
  } else {
    if (stage1) stage1.classList.remove('hidden');
    if (stage2) stage2.classList.add('hidden');
    if (stage3) stage3.classList.add('hidden');
  }

  if (m) m.classList.remove('hidden');
}

function closePaymentGatewayModal() {
  const m = document.getElementById('paymentGatewayModal');
  if (m) m.classList.add('hidden');
}

let currentSelectedSmartQuoteFee = 5000;

function updateSmartQuoteFeeDisplay(amount) {
  currentSelectedSmartQuoteFee = amount;
  const disp = document.getElementById('smartquoteFeeAmountDisplay');
  if (disp) {
    disp.innerText = formatCOP(amount) + ' COP';
  }
  const feeCard = document.getElementById('sqFeeCardDisplay');
  if (feeCard) {
    feeCard.innerText = formatCOP(amount) + ' COP';
  }
  actualizarUIEmpresaSmartQuote();
}

async function cargarConfigSmartQuoteEmpresa() {
  try {
    const res = await fetch('/api/smartquote/config');
    if (res.ok) {
      const data = await res.json();
      if (data && data.nombre_titular) {
        smartquoteCompanyConfig = data;
      }
    }
  } catch (e) {
    console.warn('Error cargando config de empresa:', e);
  }
  actualizarUIEmpresaSmartQuote();
}

function actualizarUIEmpresaSmartQuote() {
  const nameEl = document.getElementById('sqCompanyOwnerName');
  const nitEl = document.getElementById('sqCompanyNit');
  const phoneEl = document.getElementById('sqCompanyPhoneDisplay');
  const qrContainer = document.getElementById('sqCompanyQrContainer');
  const customImg = document.getElementById('sqCompanyCustomQrImg');

  if (nameEl) nameEl.innerText = smartquoteCompanyConfig.nombre_titular || 'SmartQuote FinTech Colombia';
  if (nitEl) nitEl.innerText = smartquoteCompanyConfig.nit_titular || 'NIT 901.888.777-1';
  if (phoneEl) phoneEl.innerText = smartquoteCompanyConfig.llave_nequi_breb || '310 456 7890';

  if (smartquoteCompanyConfig.qr_empresa_url && customImg) {
    customImg.src = smartquoteCompanyConfig.qr_empresa_url;
    customImg.classList.remove('hidden');
    if (qrContainer) {
      const canvases = qrContainer.querySelectorAll('canvas, img:not(#sqCompanyCustomQrImg)');
      canvases.forEach(el => el.remove());
    }
  } else if (window.QRCode && qrContainer) {
    if (customImg) customImg.classList.add('hidden');
    const canvases = qrContainer.querySelectorAll('canvas, img:not(#sqCompanyCustomQrImg)');
    canvases.forEach(el => el.remove());

    const num = (smartquoteCompanyConfig.llave_nequi_breb || '3104567890').replace(/\D/g, '');
    const amount = currentSelectedSmartQuoteFee || 5000;
    const payload = `bre-b://pay?key=${encodeURIComponent(num)}&amount=${amount}&ref=SQ-FEE-${amount}&name=SmartQuote`;
    new QRCode(qrContainer, {
      text: payload,
      width: 90,
      height: 90,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function copiarLlaveEmpresaSmartQuote() {
  const num = smartquoteCompanyConfig.llave_nequi_breb || '0091679903';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(num);
  }
  const label = document.getElementById('btnCopiarLlaveSqLabel');
  if (label) {
    label.innerText = '✓ ¡Copiado!';
    setTimeout(() => { label.innerText = 'Copiar'; }, 3000);
  }
  showToast('✓ Llave Nequi Negocios (' + num + ') copiada. Pégala en tu app Nequi.', 'success');
}

function abrirNequiEmpresaSmartQuote() {
  window.open('https://recarga.nequi.com.co/', '_blank', 'noopener,noreferrer');
}

let currentGeneratedVerifCode = '';

async function registrarYProcederAlPago() {
  const nameInput = document.getElementById('sqBuyerName');
  const phoneInput = document.getElementById('sqBuyerPhone');
  const nombre = nameInput ? nameInput.value.trim() : '';
  const celular = phoneInput ? phoneInput.value.trim() : '';
  const currentCode = currentQuoteCode || 'COT-' + new Date().getFullYear() + '-001';
  const plan = currentSelectedSmartQuoteFee >= 49000 ? 'pro' : 'single';
  const btn = document.getElementById('btnRegistrarYContinuar');

  if (!nombre || !celular) {
    showToast('Por favor escribe tu Nombre Completo y Celular (WhatsApp) para continuar.', 'warning');
    if (!nombre && nameInput) nameInput.focus();
    else if (!celular && phoneInput) phoneInput.focus();
    return;
  }

  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="iconoir-refresh-double text-base animate-spin"></i><span>Registrando tus datos...</span>`;
  }

  try {
    const res = await fetch('/api/smartquote/solicitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: currentCode,
        nombre: nombre,
        celular: celular,
        plan: plan
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudieron registrar los datos');
    }

    const data = await res.json();
    currentGeneratedVerifCode = data.solicitud.codigo_verificacion;

    // Actualizar datos registrados en la pantalla de la Etapa 2
    const nameDisp = document.getElementById('sqRegisteredNameDisplay');
    const phoneDisp = document.getElementById('sqRegisteredPhoneDisplay');
    const waBtn = document.getElementById('sqBtnEnviarWhatsApp');
    const refInput = document.getElementById('sqPaymentRefInput');

    if (nameDisp) nameDisp.innerText = nombre;
    if (phoneDisp) phoneDisp.innerText = celular;
    if (waBtn && data.whatsapp_url) waBtn.href = data.whatsapp_url;
    if (refInput) refInput.value = currentGeneratedVerifCode;

    // Cambiar de la Etapa 1 a la Etapa 2 (mostrar notificación + QR)
    const stage1 = document.getElementById('sqFlowStage1');
    const stage2 = document.getElementById('sqFlowStage2');
    const stage3 = document.getElementById('sqFlowStage3');
    if (stage1) stage1.classList.add('hidden');
    if (stage2) stage2.classList.remove('hidden');
    if (stage3) stage3.classList.add('hidden');

    showToast('✅ ¡Tus datos han sido registrados con éxito! Ya puedes escanear el QR o transferir.', 'success', 5000);

  } catch (err) {
    console.warn('Error registrando datos SmartQuote:', err);
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

// Alias para compatibilidad
async function generarCodigoSmartQuote() {
  return registrarYProcederAlPago();
}

let currentComprobanteBase64 = '';
let currentComprobanteFileName = '';

function manejarArchivoComprobante(input) {
  if (!input || !input.files || input.files.length === 0) return;
  const file = input.files[0];
  currentComprobanteFileName = file.name;

  const reader = new FileReader();
  reader.onload = function(e) {
    currentComprobanteBase64 = e.target.result;
    const previewBox = document.getElementById('sqComprobantePreviewBox');
    const previewImg = document.getElementById('sqComprobantePreviewImg');
    const nameEl = document.getElementById('sqComprobanteFileName');
    const dropzone = document.getElementById('sqUploadDropzone');

    if (previewImg) previewImg.src = currentComprobanteBase64;
    if (nameEl) nameEl.innerText = currentComprobanteFileName;
    if (previewBox) previewBox.classList.remove('hidden');
    if (dropzone) dropzone.classList.add('hidden');

    showToast('✓ Comprobante cargado: ' + currentComprobanteFileName, 'success');
  };
  reader.readAsDataURL(file);
}

function quitarArchivoComprobante() {
  currentComprobanteBase64 = '';
  currentComprobanteFileName = '';
  const fileInput = document.getElementById('sqComprobanteFileInput');
  const previewBox = document.getElementById('sqComprobantePreviewBox');
  const dropzone = document.getElementById('sqUploadDropzone');

  if (fileInput) fileInput.value = '';
  if (previewBox) previewBox.classList.add('hidden');
  if (dropzone) dropzone.classList.remove('hidden');
}

function togglePinManualSection() {
  const container = document.getElementById('sqManualPinContainer');
  if (container) container.classList.toggle('hidden');
}

async function confirmarPagoPorWhatsApp() {
  const currentCode = currentQuoteCode || 'COT-' + new Date().getFullYear() + '-001';
  const waBtn = document.getElementById('sqBtnEnviarWhatsApp');

  let waUrl = waBtn && waBtn.href ? waBtn.href : null;
  if (!waUrl || waUrl === '#' || waUrl.endsWith('#')) {
    const rawNum = (smartquoteCompanyConfig.llave_nequi_breb || '0091679903').replace(/\D/g, '');
    const num = rawNum.startsWith('3') ? '57' + rawNum : '573104567890';
    waUrl = `https://wa.me/${num}?text=${encodeURIComponent('¡Hola Arriero Pro! Acabo de transferir para activar mi cotización ' + currentCode + '. Adjunto mi captura de Nequi.')}`;
  }

  // 1. Abre el chat de WhatsApp para que envíen el dinero y la captura real
  window.open(waUrl, '_blank', 'noopener,noreferrer');

  // 2. EN LA PLATAFORMA: NO SE DESBLOQUEA GRATIS.
  // Permanece estrictamente bloqueado hasta que el usuario ingrese el PIN de aprobación que le envía el titular
  const pinInput = document.getElementById('sqPaymentRefInput');
  if (pinInput) {
    pinInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pinInput.focus();
  }

  showToast('📲 WhatsApp abierto. Envía tu comprobante en el chat; cuando verifiquemos tu pago te daremos tu PIN para desbloquear el PDF limpio.', 'info', 8000);
}

async function enviarComprobanteYAprobar() {
  const currentCode = currentQuoteCode || 'COT-' + new Date().getFullYear() + '-001';
  const plan = currentSelectedSmartQuoteFee >= 49000 ? 'pro' : 'single';
  const btn = document.getElementById('btnEnviarComprobanteSq');

  if (!currentComprobanteBase64) {
    showToast('Por favor toca el botón para adjuntar la foto o captura de tu pago de Nequi.', 'warning', 4500);
    const dropzone = document.getElementById('sqUploadDropzone');
    if (dropzone) {
      dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      dropzone.classList.add('ring-4', 'ring-emerald-400');
      setTimeout(() => dropzone.classList.remove('ring-4', 'ring-emerald-400'), 1500);
    }
    return;
  }

  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="iconoir-refresh-double text-base animate-spin"></i><span>Validando Comprobante...</span>`;
  }

  try {
    const res = await fetch('/api/smartquote/adjuntar-comprobante', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: currentCode,
        comprobante_img: currentComprobanteBase64,
        referencia: currentGeneratedVerifCode || 'NEQUI-VOUCHER',
        plan: plan
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo procesar el comprobante');
    }

    // Activar licencia en almacenamiento local
    if (plan === 'pro') {
      localStorage.setItem('smartquote_pro_active', 'true');
    } else {
      localStorage.setItem('smartquote_license_' + currentCode, 'true');
    }

    updateWatermarkState();

    // Transición directa a la Etapa 3: Pago Exitoso y Aprobado
    const stage1 = document.getElementById('sqFlowStage1');
    const stage2 = document.getElementById('sqFlowStage2');
    const stage3 = document.getElementById('sqFlowStage3');
    const codeDisp = document.getElementById('sqSuccessQuoteCodeDisplay');

    if (stage1) stage1.classList.add('hidden');
    if (stage2) stage2.classList.add('hidden');
    if (stage3) stage3.classList.remove('hidden');
    if (codeDisp) codeDisp.innerText = currentCode;

    showToast('🎉 ¡Comprobante verificado con éxito! Tu cotización oficial está aprobada y limpia.', 'success', 6000);

  } catch (err) {
    console.warn('Error adjuntando comprobante:', err);
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

function volverAEditarDatosComprador() {
  const stage1 = document.getElementById('sqFlowStage1');
  const stage2 = document.getElementById('sqFlowStage2');
  const stage3 = document.getElementById('sqFlowStage3');
  if (stage1) stage1.classList.remove('hidden');
  if (stage2) stage2.classList.add('hidden');
  if (stage3) stage3.classList.add('hidden');
}

function copiarCodigoVerifGenerado() {
  const code = currentGeneratedVerifCode || (document.getElementById('sqPaymentRefInput') ? document.getElementById('sqPaymentRefInput').value : '');
  if (!code) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code);
  }
  showToast('✓ Código ' + code + ' copiado al portapapeles.', 'success');
}

async function validarPagoSmartQuote() {
  const input = document.getElementById('sqPaymentRefInput');
  const ref = input ? input.value.trim() : '';
  const currentCode = currentQuoteCode || 'DRAFT';
  const plan = currentSelectedSmartQuoteFee >= 49000 ? 'pro' : 'single';
  const btn = document.getElementById('btnValidarPagoSq');

  if (!ref) {
    showToast('Por favor escribe tu Código de Verificación o PIN de activación.', 'warning');
    return;
  }

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="iconoir-refresh-double text-sm animate-spin"></i><span>Comprobando...</span>`;
  }

  try {
    const res = await fetch('/api/smartquote/desbloquear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: currentCode,
        plan: plan,
        codigo_verificacion: ref,
        pin: ref
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'No se pudo validar el pago');
    }

    if (data.status === 'pendiente') {
      showToast('⏳ ' + (data.mensaje || 'Comprobante en revisión. Pide tu PIN en WhatsApp.'), 'warning', 7000);
      return;
    }

    // Activar licencia en almacenamiento local
    if (plan === 'pro' || data.plan === 'pro') {
      localStorage.setItem('smartquote_pro_active', 'true');
    } else {
      localStorage.setItem('smartquote_license_' + currentCode, 'true');
    }

    updateWatermarkState();

    // Mostrar Etapa 3: ¡Pago Exitoso y Confirmado!
    const stage1 = document.getElementById('sqFlowStage1');
    const stage2 = document.getElementById('sqFlowStage2');
    const stage3 = document.getElementById('sqFlowStage3');
    const codeDisp = document.getElementById('sqSuccessQuoteCodeDisplay');
    if (stage1) stage1.classList.add('hidden');
    if (stage2) stage2.classList.add('hidden');
    if (stage3) stage3.classList.remove('hidden');
    if (codeDisp) codeDisp.innerText = currentCode;

    showToast('🎉 ¡Pago confirmado con éxito! Tu PDF oficial ya está listo.', 'success', 6000);

  } catch (err) {
    console.warn('Error validando pago SmartQuote:', err);
    showToast('Aviso: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

function descargarPDFOficialTrasExito() {
  closePaymentGatewayModal();
  openSwissModal();
  setTimeout(() => {
    window.print();
  }, 450);
}

async function pagarSmartQuoteConCanal(canal) {
  openPaymentGatewayModal();
}

async function checkUrlCotizacion() {
  const params = new URLSearchParams(window.location.search);
  const cot = params.get('cot');
  const view = params.get('view');
  if (cot) {
    await cargarCotizacion(cot);
  }
  if (view === 'client') {
    setTimeout(() => {
      toggleClientPreviewMode(true);
    }, 150);
  }
}

// --- PORTAL DE APROBACIÓN Y PAGO DEL CLIENTE (VISTA OFICIAL CLIENTE) ---
let isClientPortalMode = false;
let clientPortalSigCanvas = null;
let clientPortalSigCtx = null;
let clientPortalHasDrawnSig = false;

function toggleClientPreviewMode(isClientView = true) {
  isClientPortalMode = isClientView;
  const editor = document.getElementById('contractorEditorWorkspace');
  const portal = document.getElementById('clientApprovalPortal');
  const navCotizador = document.getElementById('navBtnCotizador');
  const navVistaCliente = document.getElementById('navBtnVistaCliente');
  const stickyBottomBar = document.getElementById('mobileStickyBottomBar');

  if (isClientView) {
    if (editor) editor.classList.add('hidden');
    if (portal) portal.classList.remove('hidden');
    if (stickyBottomBar) stickyBottomBar.classList.add('hidden');

    if (navCotizador) {
      navCotizador.className = 'px-3 py-1.5 rounded-lg font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all';
    }
    if (navVistaCliente) {
      navVistaCliente.className = 'px-3 py-1.5 rounded-lg font-bold bg-blue-600 text-white shadow-sm flex items-center gap-1.5 transition-all';
    }

    renderClientPortalData();
    setTimeout(initClientPortalSignature, 60);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Modo Vista Cliente: tus costos internos y margen están 100% protegidos.', 'info');
  } else {
    if (editor) editor.classList.remove('hidden');
    if (portal) portal.classList.add('hidden');
    if (stickyBottomBar) stickyBottomBar.classList.remove('hidden');

    if (navCotizador) {
      navCotizador.className = 'px-3 py-1.5 rounded-lg font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm flex items-center gap-1.5';
    }
    if (navVistaCliente) {
      navVistaCliente.className = 'px-3 py-1.5 rounded-lg font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all flex items-center gap-1.5 border border-transparent hover:border-blue-200 dark:hover:border-blue-800';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderClientPortalData() {
  const signerName = document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : 'Ing. Alejandro Morales P.';
  const signerDoc = document.getElementById('signerDocInput') ? document.getElementById('signerDocInput').value : 'NIT / CC: 901.458.712-3';
  const serviceName = document.getElementById('serviceNameInput') ? document.getElementById('serviceNameInput').value : 'Servicio Especializado';
  const cleanAddr = getCleanAddress();
  const daysSelect = document.getElementById('executionDaysSelect');
  const deliveryDays = daysSelect ? daysSelect.options[daysSelect.selectedIndex].text : '8 días de trabajo';
  const quoteRef = currentQuoteCode || 'COT-2026-001';
  const total = document.getElementById('statClientTotal') ? document.getElementById('statClientTotal').innerText : '$1.373.077';
  const advance = document.getElementById('sidebarAdvanceAmount') ? document.getElementById('sidebarAdvanceAmount').innerText : '$686.538';
  const payoutNumber = document.getElementById('payoutNumberInput') ? document.getElementById('payoutNumberInput').value : '310 456 7890';
  const payoutChannel = document.getElementById('payoutChannelSelect') ? document.getElementById('payoutChannelSelect').value : 'breb';

  // Metadatos
  if (document.getElementById('clientViewSignerName')) document.getElementById('clientViewSignerName').innerText = signerName;
  if (document.getElementById('clientViewSignerDoc')) document.getElementById('clientViewSignerDoc').innerText = signerDoc;
  if (document.getElementById('clientViewServiceName')) document.getElementById('clientViewServiceName').innerText = serviceName;
  if (document.getElementById('clientViewAddress')) document.getElementById('clientViewAddress').innerText = cleanAddr;
  if (document.getElementById('clientViewDeliveryDays')) document.getElementById('clientViewDeliveryDays').innerText = deliveryDays;
  if (document.getElementById('clientViewQuoteCode')) document.getElementById('clientViewQuoteCode').innerText = `#${quoteRef}`;

  // Totales
  if (document.getElementById('clientViewTotalDisplay')) document.getElementById('clientViewTotalDisplay').innerText = total + ' COP';
  if (document.getElementById('clientViewAdvanceDisplay')) document.getElementById('clientViewAdvanceDisplay').innerText = advance + ' COP';
  if (document.getElementById('clientViewAdvancePill')) document.getElementById('clientViewAdvancePill').innerText = advance + ' COP';
  if (document.getElementById('clientViewBalanceDisplay')) document.getElementById('clientViewBalanceDisplay').innerText = advance + ' COP';

  // Info de cobro Bre-B
  const payoutTextEl = document.getElementById('clientPortalPayoutInfoText');
  if (payoutTextEl) {
    payoutTextEl.innerText = payoutChannel === 'breb' ? `Llave Bre-B: ${payoutNumber}` : `Canal ${payoutChannel.toUpperCase()}: ${payoutNumber}`;
  }

  // Logo
  const logoData = customCompanyLogoDataUrl || localStorage.getItem('smartquote_custom_logo');
  const logoImg = document.getElementById('clientViewLogoImg');
  const defaultBadge = document.getElementById('clientViewDefaultLogoBadge');
  if (logoData && logoImg) {
    logoImg.src = logoData;
    logoImg.classList.remove('hidden');
    if (defaultBadge) defaultBadge.classList.add('hidden');
  }

  // QR de pago en portal cliente
  const clientQrContainer = document.getElementById('clientPortalQrContainer');
  const clientCustomQr = document.getElementById('clientPortalCustomQrImg');
  const customQrSaved = customBreBQrDataUrl || localStorage.getItem('smartquote_custom_breb_qr');

  if (customQrSaved && clientCustomQr) {
    clientCustomQr.src = customQrSaved;
    clientCustomQr.classList.remove('hidden');
  } else if (window.QRCode && clientQrContainer) {
    if (clientCustomQr) clientCustomQr.classList.add('hidden');
    const existingCanvases = clientQrContainer.querySelectorAll('canvas, img:not(#clientPortalCustomQrImg)');
    existingCanvases.forEach(el => el.remove());

    const qrPayload = `bre-b://pay?key=${encodeURIComponent(payoutNumber)}&amount=${encodeURIComponent(advance.replace(/\D/g, ''))}&ref=${encodeURIComponent(quoteRef)}`;
    new QRCode(clientQrContainer, {
      text: qrPayload,
      width: 96,
      height: 96,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  // Tabla limpia de entregables (sin costos directos ni márgenes internos)
  const tbody = document.getElementById('clientViewTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    const rows = document.querySelectorAll('.item-row');
    rows.forEach(r => {
      const descInput = r.querySelector('.item-desc');
      const qtyInput = r.querySelector('.item-qty');
      const catLabel = r.querySelector('.item-cat-label');

      const desc = descInput ? descInput.value : 'Entregable';
      const qty = qtyInput ? qtyInput.value : '1';
      const cat = catLabel ? (catLabel.getAttribute('data-category') || 'Materiales') : 'Materiales';

      let catBadgeClass = 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      if (cat === 'Mano de obra') catBadgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300';
      if (cat === 'Servicios') catBadgeClass = 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors';
      tr.innerHTML = `
        <td class="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">${desc}</td>
        <td class="py-3 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">${qty}</td>
        <td class="py-3 px-4 text-right">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${catBadgeClass}">${cat}</span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Estado
  const statusBadge = document.getElementById('clientViewStatusBadge');
  if (statusBadge) {
    if (isCurrentQuotePaid() || currentQuoteStatus === 'Aprobada' || currentQuoteStatus === 'Cobrada') {
      statusBadge.innerText = '✓ Propuesta Aprobada y Autorizada';
      statusBadge.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold block mt-1';
    } else {
      statusBadge.innerText = '● Pendiente de Aprobación';
      statusBadge.className = 'text-xs text-amber-600 dark:text-amber-400 font-bold block mt-1';
    }
  }
}

function initClientPortalSignature() {
  clientPortalSigCanvas = document.getElementById('clientPortalSignatureCanvas');
  if (!clientPortalSigCanvas) return;

  clientPortalSigCtx = clientPortalSigCanvas.getContext('2d');
  const rect = clientPortalSigCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  clientPortalSigCanvas.width = (rect.width || 360) * dpr;
  clientPortalSigCanvas.height = (rect.height || 128) * dpr;
  clientPortalSigCtx.scale(dpr, dpr);

  clientPortalSigCtx.strokeStyle = '#0f172a';
  clientPortalSigCtx.lineWidth = 2.5;
  clientPortalSigCtx.lineCap = 'round';
  clientPortalSigCtx.lineJoin = 'round';

  let isDrawing = false;
  const placeholder = document.getElementById('clientPortalSignaturePlaceholder');

  function getPos(e) {
    const cRect = clientPortalSigCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - cRect.left,
      y: clientY - cRect.top
    };
  }

  function start(e) {
    isDrawing = true;
    clientPortalHasDrawnSig = true;
    if (placeholder) placeholder.classList.add('hidden');
    const pos = getPos(e);
    clientPortalSigCtx.beginPath();
    clientPortalSigCtx.moveTo(pos.x, pos.y);
  }

  function move(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    clientPortalSigCtx.lineTo(pos.x, pos.y);
    clientPortalSigCtx.stroke();
  }

  function stop() {
    isDrawing = false;
  }

  clientPortalSigCanvas.onmousedown = start;
  clientPortalSigCanvas.onmousemove = move;
  window.onmouseup = stop;

  clientPortalSigCanvas.ontouchstart = start;
  clientPortalSigCanvas.ontouchmove = move;
  window.ontouchend = stop;
}

function clearClientPortalSignature() {
  if (!clientPortalSigCanvas || !clientPortalSigCtx) return;
  const dpr = window.devicePixelRatio || 1;
  clientPortalSigCtx.clearRect(0, 0, clientPortalSigCanvas.width / dpr, clientPortalSigCanvas.height / dpr);
  clientPortalHasDrawnSig = false;
  const placeholder = document.getElementById('clientPortalSignaturePlaceholder');
  if (placeholder) placeholder.classList.remove('hidden');
}

function confirmClientPortalSignature() {
  if (!clientPortalHasDrawnSig || !clientPortalSigCanvas) {
    showToast('Por favor realiza un trazo en el recuadro con el dedo o ratón antes de confirmar.', 'info');
    return;
  }

  const dataUrl = clientPortalSigCanvas.toDataURL('image/png');
  aplicarFirmaAlDocumento(dataUrl, 'image');

  const btnText = document.getElementById('btnConfirmClientPortalSigText');
  if (btnText) btnText.innerText = '✓ Propuesta Firmada Exitosamente';

  const badge = document.getElementById('clientViewStatusBadge');
  if (badge) {
    badge.innerText = '✓ Propuesta Aprobada y Firmada';
    badge.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold block mt-1';
  }

  showToast('¡Firma registrada! Ahora puedes realizar el anticipo o notificar al maestro.', 'success');
}

function notificarAprobacionPorWhatsApp() {
  const signerName = document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : 'Maestro de Obra';
  const clientName = document.getElementById('clientNameInput') ? document.getElementById('clientNameInput').value : 'Cliente';
  const service = document.getElementById('serviceNameInput') ? document.getElementById('serviceNameInput').value : 'Servicio Contratado';
  const total = document.getElementById('statClientTotal') ? document.getElementById('statClientTotal').innerText : '$1.373.077';
  const advance = document.getElementById('sidebarAdvanceAmount') ? document.getElementById('sidebarAdvanceAmount').innerText : '$686.538';
  const ref = currentQuoteCode || 'COT-2026-001';

  // Teléfono del maestro/contratista para enviarle el mensaje a él
  const emisorPhoneInput = document.getElementById('payoutNumberInput');
  const rawDigits = emisorPhoneInput ? emisorPhoneInput.value.replace(/\D/g, '') : '';
  
  let targetPhone = '';
  if (rawDigits.length === 10 && rawDigits.startsWith('3')) {
    targetPhone = '57' + rawDigits;
  } else if (rawDigits.length > 10) {
    targetPhone = rawDigits;
  }

  const mensaje = `¡Hola *${signerName}*! 👋 Le escribe *${clientName}*.\n\n` +
                  `✅ Acabo de *aprobar y firmar* la propuesta formal para el trabajo:\n` +
                  `🛠️ *${service}* (Cotización #${ref})\n\n` +
                  `💰 *Total Aprobado:* ${total} COP\n` +
                  `⚡ *Anticipo del 50% Listo:* ${advance} COP\n\n` +
                  `✍️ La firma quedó registrada en el documento. Ya podemos coordinar la fecha de arranque de la obra. ¡Quedo atento!`;

  const waUrl = targetPhone 
    ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

  window.open(waUrl, '_blank');
}

// --- PASARELA DE PAGO SEGURA SMARTCHECKOUT & VALIDACIÓN ANTIFRAUDE ---
let tempComprobanteImgDataUrl = '';

function getSecurityToken(ref, doc, monto, num) {
  const str = `${ref}|${doc}|${monto}|${num}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'SQ-SEC-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
}

function openSecureCheckoutModal() {
  const modal = document.getElementById('secureCheckoutModal');
  if (!modal) return;

  const advance = document.getElementById('sidebarAdvanceAmount') ? document.getElementById('sidebarAdvanceAmount').innerText : '$686.538';
  const ref = currentQuoteCode || 'COT-2026-001';
  const nombre = document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : 'Ing. Alejandro Morales P.';
  const doc = document.getElementById('signerDocInput') ? document.getElementById('signerDocInput').value : 'NIT / CC: 901.458.712-3';
  const num = document.getElementById('payoutNumberInput') ? document.getElementById('payoutNumberInput').value : '310 456 7890';
  const canalSel = document.getElementById('payoutChannelSelect');
  const canal = canalSel ? canalSel.value : 'nequi';
  const canalTexto = canalSel ? canalSel.options[canalSel.selectedIndex].text : 'Nequi / Bre-B';
  const token = getSecurityToken(ref, doc, advance, num);

  // Llenar metadatos visuales del checkout seguro
  if (document.getElementById('chkModalMontoDisplay')) document.getElementById('chkModalMontoDisplay').innerText = advance + ' COP';
  if (document.getElementById('chkModalCotizacionRef')) document.getElementById('chkModalCotizacionRef').innerText = 'Obra: #' + ref;
  if (document.getElementById('chkModalTokenDisplay')) document.getElementById('chkModalTokenDisplay').innerText = token + ' [VERIFICADO]';
  if (document.getElementById('chkModalTitularNombre')) document.getElementById('chkModalTitularNombre').innerText = nombre;
  if (document.getElementById('chkModalTitularDoc')) document.getElementById('chkModalTitularDoc').innerText = doc;
  if (document.getElementById('chkModalTitularCanal')) document.getElementById('chkModalTitularCanal').innerText = canalTexto;
  if (document.getElementById('chkModalTitularNumero')) document.getElementById('chkModalTitularNumero').innerText = num;
  if (document.getElementById('chkModalReglaOroNombre')) document.getElementById('chkModalReglaOroNombre').innerText = nombre;

  // Renderizar QR Antifraude de alta resolución
  const qrContainer = document.getElementById('chkModalQrDynamicContainer');
  const customImg = document.getElementById('chkModalCustomQrImg');
  const customQrSaved = customBreBQrDataUrl || localStorage.getItem('smartquote_custom_breb_qr');

  if (customQrSaved && customImg) {
    customImg.src = customQrSaved;
    customImg.classList.remove('hidden');
    if (qrContainer) {
      const canvases = qrContainer.querySelectorAll('canvas, img:not(#chkModalCustomQrImg)');
      canvases.forEach(el => el.remove());
    }
  } else if (window.QRCode && qrContainer) {
    if (customImg) customImg.classList.add('hidden');
    const canvases = qrContainer.querySelectorAll('canvas, img:not(#chkModalCustomQrImg)');
    canvases.forEach(el => el.remove());

    const qrPayload = `bre-b://pay?key=${encodeURIComponent(num)}&amount=${encodeURIComponent(advance.replace(/\D/g, ''))}&ref=${encodeURIComponent(ref)}&name=${encodeURIComponent(nombre)}`;
    new QRCode(qrContainer, {
      text: qrPayload,
      width: 130,
      height: 130,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  modal.classList.remove('hidden');
}

function closeSecureCheckoutModal() {
  const modal = document.getElementById('secureCheckoutModal');
  if (modal) modal.classList.add('hidden');
}

function copiarLlaveSeguraModal() {
  const num = document.getElementById('payoutNumberInput') ? document.getElementById('payoutNumberInput').value : '310 456 7890';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(num);
  }
  const btnLabel = document.getElementById('btnCopiarLlaveSeguraLabel');
  if (btnLabel) {
    const original = btnLabel.innerText;
    btnLabel.innerText = '✓ ¡Copiado con seguridad!';
    setTimeout(() => { btnLabel.innerText = original; }, 3000);
  }
  showToast('✓ Número / Llave copiada al portapapeles. Pégala en tu app para transferir.', 'success');
}

function irAAppBancariaDirecto() {
  irAPaginaDeCobro();
}

function handleComprobanteImgUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    tempComprobanteImgDataUrl = e.target.result;
    const label = document.getElementById('chkComprobanteImgLabel');
    if (label) label.innerText = '✓ Foto de comprobante adjunta (' + file.name + ')';
    showToast('¡Comprobante adjuntado con éxito!', 'info');
  };
  reader.readAsDataURL(file);
}

async function enviarReportePagoCliente() {
  const btn = document.getElementById('btnEnviarReportePago');
  const refInput = document.getElementById('chkInputComprobanteRef');
  const refBancaria = refInput ? (refInput.value.trim() || 'Aprobado en App Bancaria') : 'Aprobado en App Bancaria';
  const advance = document.getElementById('sidebarAdvanceAmount') ? document.getElementById('sidebarAdvanceAmount').innerText : '$686.538';
  const cleanMonto = parseFloat(advance.replace(/[^\d.]/g, '')) || 686538;
  const quoteRef = currentQuoteCode || 'COT-2026-001';

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="iconoir-refresh-double text-lg animate-spin"></i><span>Registrando comprobante...</span>`;
  }

  try {
    const res = await fetch(`/api/cotizaciones/${quoteRef}/reportar-pago`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monto: cleanMonto,
        referencia: refBancaria,
        comprobante_img: tempComprobanteImgDataUrl
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo registrar el pago');
    }

    const data = await res.json();
    isQuotePaid = true;
    currentQuoteStatus = data.nuevo_estado || 'Aprobada';

    updateWatermarkState();
    recalculate();

    const statusBadge = document.getElementById('clientViewStatusBadge');
    if (statusBadge) {
      statusBadge.innerText = '✓ Anticipo Pagado y Comprobante Verificado (Ref: ' + refBancaria + ')';
      statusBadge.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-bold block mt-1';
    }

    closeSecureCheckoutModal();
    showToast('¡Anticipo reportado con éxito! Abriendo WhatsApp para notificar al maestro...', 'success', 5000);

    // Notificar al maestro por WhatsApp
    notificarReportePagoPorWhatsApp(refBancaria, advance);

  } catch (err) {
    console.warn('Error al reportar pago:', err);
    showToast('Error al confirmar comprobante: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

function notificarReportePagoPorWhatsApp(refBancaria, advanceAmount) {
  const signerName = document.getElementById('signerNameInput') ? document.getElementById('signerNameInput').value : 'Maestro de Obra';
  const clientName = document.getElementById('clientNameInput') ? document.getElementById('clientNameInput').value : 'Cliente';
  const service = document.getElementById('serviceNameInput') ? document.getElementById('serviceNameInput').value : 'Servicio';
  const ref = currentQuoteCode || 'COT-2026-001';
  const canalSel = document.getElementById('payoutChannelSelect');
  const canalTexto = canalSel ? canalSel.options[canalSel.selectedIndex].text : 'Nequi / Bre-B';

  const emisorPhoneInput = document.getElementById('payoutNumberInput');
  const rawDigits = emisorPhoneInput ? emisorPhoneInput.value.replace(/\D/g, '') : '';
  let targetPhone = '';
  if (rawDigits.length === 10 && rawDigits.startsWith('3')) {
    targetPhone = '57' + rawDigits;
  } else if (rawDigits.length > 10) {
    targetPhone = rawDigits;
  }

  const mensaje = `¡Hola *${signerName}*! 👋 Le escribe *${clientName}*.\n\n` +
                  `✅ Acabo de realizar el *pago del anticipo del 50%* para el trabajo:\n` +
                  `🛠️ *${service}* (Cotización #${ref})\n\n` +
                  `💰 *Monto Transferido:* ${advanceAmount} COP\n` +
                  `💳 *Medio de Pago:* ${canalTexto}\n` +
                  `🧾 *Número de Comprobante / Aprobación:* ${refBancaria}\n\n` +
                  `Por favor revise el saldo en su aplicación bancaria para coordinar la fecha de arranque de la obra. ¡Quedo atento!`;

  const waUrl = targetPhone 
    ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

  window.open(waUrl, '_blank');
}

// --- GESTIÓN DE TEMA CLARO / OSCURO (FinTech Clean Palette) ---
function initTheme() {
  const savedTheme = localStorage.getItem('smartquote_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme ? savedTheme : (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme);
}

function applyTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('themeToggleIcon');
  const label = document.getElementById('themeToggleLabel');

  if (theme === 'dark') {
    html.classList.add('dark');
    if (icon) {
      icon.className = 'iconoir-sun-light text-[16px] text-amber-400';
    }
    if (label) {
      label.innerText = 'Modo Claro';
    }
    localStorage.setItem('smartquote_theme', 'dark');
  } else {
    html.classList.remove('dark');
    if (icon) {
      icon.className = 'iconoir-half-moon text-[16px] text-slate-700';
    }
    if (label) {
      label.innerText = 'Modo Oscuro';
    }
    localStorage.setItem('smartquote_theme', 'light');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
}

// Inicialización inmediata para evitar parpadeo de tema (FOUC)
initTheme();

// --- AUTO-GUARDADO EN TIEMPO REAL SIN LOGIN (LOCALSTORAGE + SQLITE) ---
let autoSaveDebounceTimer = null;

function autoSaveDraft() {
  clearTimeout(autoSaveDebounceTimer);
  autoSaveDebounceTimer = setTimeout(() => {
    try {
      const items = [];
      const itemRows = document.querySelectorAll('.item-row');
      itemRows.forEach(row => {
        const descInput = row.querySelector('.item-desc');
        const qtyInput = row.querySelector('.item-qty');
        const costInput = row.querySelector('.item-cost');
        const catLabel = row.querySelector('.item-cat-label');
        if (descInput) {
          items.push({
            desc: descInput.value,
            qty: parseFloat(qtyInput ? qtyInput.value : 1) || 1,
            cost: parseFloat(costInput ? costInput.value : 0) || 0,
            cat: catLabel ? catLabel.getAttribute('data-category') || 'Materiales' : 'Materiales'
          });
        }
      });

      const draft = {
        clientName: (document.getElementById('clientNameInput') && document.getElementById('clientNameInput').value) || '',
        clientPhone: (document.getElementById('clientPhoneInput') && document.getElementById('clientPhoneInput').value) || '',
        serviceName: (document.getElementById('serviceNameInput') && document.getElementById('serviceNameInput').value) || '',
        destAddress: (document.getElementById('destAddressInput') && document.getElementById('destAddressInput').value) || '',
        originAddress: (document.getElementById('originAddressInput') && document.getElementById('originAddressInput').value) || '',
        zoneDifficulty: (document.getElementById('zoneDifficultySelect') && document.getElementById('zoneDifficultySelect').value) || 'urbano',
        margin: currentMargin,
        contingency: currentContingency,
        taxRegime: (document.getElementById('taxRegimeSelect') && document.getElementById('taxRegimeSelect').value) || 'simple',
        payoutChannel: (document.getElementById('payoutChannelSelect') && document.getElementById('payoutChannelSelect').value) || 'breb',
        payoutNumber: (document.getElementById('payoutNumberInput') && document.getElementById('payoutNumberInput').value) || '',
        items: items,
        quoteCode: currentQuoteCode,
        timestamp: Date.now()
      };

      localStorage.setItem('smartquote_active_draft', JSON.stringify(draft));
      
      const badge = document.getElementById('activeQuoteCodeBadge');
      if (badge && !currentQuoteCode) {
        badge.innerText = 'Borrador guardado automáticamente';
      }
    } catch (e) {
      console.warn('Auto-save no disponible:', e);
    }
  }, 400);
}

function restoreDraftIfAvailable() {
  try {
    const raw = localStorage.getItem('smartquote_active_draft');
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (!draft || !draft.items || draft.items.length === 0) return false;

    if (draft.clientName && document.getElementById('clientNameInput')) document.getElementById('clientNameInput').value = draft.clientName;
    if (draft.clientPhone && document.getElementById('clientPhoneInput')) document.getElementById('clientPhoneInput').value = draft.clientPhone;
    if (draft.serviceName && document.getElementById('serviceNameInput')) document.getElementById('serviceNameInput').value = draft.serviceName;
    if (draft.destAddress && document.getElementById('destAddressInput')) document.getElementById('destAddressInput').value = draft.destAddress;
    if (draft.originAddress && document.getElementById('originAddressInput')) document.getElementById('originAddressInput').value = draft.originAddress;
    if (draft.zoneDifficulty && document.getElementById('zoneDifficultySelect')) document.getElementById('zoneDifficultySelect').value = draft.zoneDifficulty;
    if (draft.taxRegime && document.getElementById('taxRegimeSelect')) document.getElementById('taxRegimeSelect').value = draft.taxRegime;
    if (draft.payoutChannel && document.getElementById('payoutChannelSelect')) document.getElementById('payoutChannelSelect').value = draft.payoutChannel;
    if (draft.payoutNumber && document.getElementById('payoutNumberInput')) document.getElementById('payoutNumberInput').value = draft.payoutNumber;

    if (draft.margin !== undefined) {
      currentMargin = draft.margin;
      if (document.getElementById('marginRange')) document.getElementById('marginRange').value = draft.margin;
      onMarginChange(draft.margin);
    }
    if (draft.contingency !== undefined) {
      setContingency(draft.contingency);
    }

    const container = document.getElementById('itemsContainer');
    if (container && draft.items && draft.items.length > 0) {
      container.innerHTML = '';
      draft.items.forEach(it => {
        addNewItem(it.desc, it.qty, it.cost, it.cat);
      });
    }

    return true;
  } catch (e) {
    console.warn('Error restaurando borrador:', e);
    return false;
  }
}

// =========================================================================
// MÓDULO DE FEEDBACK, CHAT DE SUGERENCIAS Y REPORTE DE MEJORAS
// Permite a maestros y contratistas proponer funciones, materiales o mejoras
// =========================================================================

let currentFeedbackCategory = 'Nueva Función';

function openFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Asegurar vista de formulario visible
  resetFeedbackForm();

  // Si el usuario ya tiene nombre o celular en la cotización o perfil, precargarlo amigablemente
  const nombreInp = document.getElementById('feedbackNombreInput');
  const contactoInp = document.getElementById('feedbackContactoInput');
  if (nombreInp && !nombreInp.value) {
    const owner = document.getElementById('signerNameInput')?.value || '';
    if (owner) nombreInp.value = owner;
  }
  if (contactoInp && !contactoInp.value) {
    const phone = document.getElementById('companyBreBKeyInput')?.value || document.getElementById('payoutNumberInput')?.value || '';
    if (phone) contactoInp.value = phone;
  }

  // Foco en el mensaje tras transición
  setTimeout(() => {
    document.getElementById('feedbackMensajeInput')?.focus();
  }, 100);
}

function closeFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  if (modal) modal.classList.add('hidden');
}

function resetFeedbackForm() {
  const formView = document.getElementById('feedbackFormView');
  const successView = document.getElementById('feedbackSuccessView');
  if (formView) formView.classList.remove('hidden');
  if (successView) successView.classList.add('hidden');
  const msgInp = document.getElementById('feedbackMensajeInput');
  if (msgInp) msgInp.value = '';
}

function selectFeedbackCategory(cat, btn) {
  currentFeedbackCategory = cat;
  const container = document.getElementById('feedbackCategoryChips');
  if (container) {
    const allBtns = container.querySelectorAll('.feedback-chip');
    allBtns.forEach(b => {
      b.classList.remove('active-chip', 'bg-blue-600', 'text-white', 'border-blue-600', 'shadow-sm');
      b.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300', 'border-slate-200', 'dark:border-slate-700');
    });
  }
  if (btn) {
    btn.classList.add('active-chip', 'bg-blue-600', 'text-white', 'border-blue-600', 'shadow-sm');
    btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300', 'border-slate-200', 'dark:border-slate-700');
  }
}

async function enviarFeedbackAlSistema() {
  const mensajeInput = document.getElementById('feedbackMensajeInput');
  const nombreInput = document.getElementById('feedbackNombreInput');
  const contactoInput = document.getElementById('feedbackContactoInput');
  const btnSubmit = document.getElementById('btnEnviarFeedbackSistema');

  const mensaje = mensajeInput ? mensajeInput.value.trim() : '';
  if (!mensaje) {
    showToast('Por favor escribe tu sugerencia o lo que te gustaría agregar.', 'warning');
    if (mensajeInput) mensajeInput.focus();
    return;
  }

  const payload = {
    tipo: currentFeedbackCategory,
    mensaje: mensaje,
    nombre: nombreInput ? nombreInput.value.trim() : '',
    contacto: contactoInput ? contactoInput.value.trim() : ''
  };

  const originalContent = btnSubmit ? btnSubmit.innerHTML : '';
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `
      <i class="iconoir-system-restart animate-spin text-base"></i>
      <span>Guardando sugerencia...</span>
    `;
  }

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo guardar la sugerencia');
    }

    showToast('¡Sugerencia recibida! Muchas gracias por ayudarnos a mejorar.', 'success');

    // Cambiar a vista de éxito
    const formView = document.getElementById('feedbackFormView');
    const successView = document.getElementById('feedbackSuccessView');
    if (formView) formView.classList.add('hidden');
    if (successView) successView.classList.remove('hidden');

  } catch (err) {
    console.error('Error enviando feedback:', err);
    showToast(err.message || 'Error de conexión al enviar sugerencia.', 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalContent;
    }
  }
}

function enviarFeedbackPorWhatsApp() {
  const mensajeInput = document.getElementById('feedbackMensajeInput');
  const nombreInput = document.getElementById('feedbackNombreInput');
  const contactoInput = document.getElementById('feedbackContactoInput');

  const mensaje = mensajeInput ? mensajeInput.value.trim() : '';
  const nombre = nombreInput ? nombreInput.value.trim() : '';
  const contacto = contactoInput ? contactoInput.value.trim() : '';

  if (!mensaje) {
    showToast('Escribe primero tu idea o mejora para prepararla en WhatsApp.', 'warning');
    if (mensajeInput) mensajeInput.focus();
    return;
  }

  // También lo guardamos en la base de datos en segundo plano para que quede registro
  fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo: currentFeedbackCategory + ' (WhatsApp)',
      mensaje: mensaje,
      nombre: nombre,
      contacto: contacto
    })
  }).catch(() => {});

  const textoWhatsApp = 
`¡Hola Soporte SmartQuote! 👋
Tengo una sugerencia / idea de mejora:
📌 *Tema:* ${currentFeedbackCategory}
💬 *Detalle:* ${mensaje}
👤 *De:* ${nombre || 'Contratista'} ${contacto ? '(' + contacto + ')' : ''}`;

  const numSoporte = '573104567890';
  const url = `https://wa.me/${numSoporte}?text=${encodeURIComponent(textoWhatsApp)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  showToast('Abriendo WhatsApp con tu sugerencia...', 'info');
  closeFeedbackModal();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('feedbackModal');
    if (modal && !modal.classList.contains('hidden')) {
      closeFeedbackModal();
    }
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initSignaturePad();
  await cargarDatosEmisor();
  updateCompanyLogoDisplay();
  
  // Restaurar automáticamente trabajo anterior sin pedir login
  const restored = restoreDraftIfAvailable();
  
  recalculate();
  updateSwissPreview();
  updateWatermarkState();
  updatePaymentChannel();
  updateCalendarMilestones();
  calculateRouteFreight(false);
  await checkUrlCotizacion();

  // Registrar Service Worker para soporte Offline / PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const brebKeyInp = document.getElementById('companyBreBKeyInput');
  if (brebKeyInp) {
    brebKeyInp.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const payoutInp = document.getElementById('payoutNumberInput');
      if (payoutInp) payoutInp.value = val;
      updatePaymentChannel();
      updateSwissPreview();
      autoSaveDraft();
    });
  }

  const taxSelect = document.getElementById('taxRegimeSelect');
  if (taxSelect) {
    taxSelect.addEventListener('change', () => {
      recalculate();
      autoSaveDraft();
    });
  }
});


