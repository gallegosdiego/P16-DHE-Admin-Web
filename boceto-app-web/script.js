const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");
const WHATSAPP_URL = "https://wa.me/573112206587?text=Hola%2C%20vengo%20desde%20la%20p%C3%A1gina%20web%20de%20DANHEI%20EXPRESS.%20Quiero%20recibir%20informaci%C3%B3n%20sobre%20soluciones%20de%20apoyo%20log%C3%ADstico%20urbano%20y%20entregas%20locales.";
const FORM_STORAGE_KEY = "danhei-form-submissions-v1";
const COOKIE_STORAGE_KEY = "danhei-cookie-preferences-v1";
const LEGAL_VERSIONS = {
  policy_version: "DANHEI_POLITICA_DATOS_V2_1",
  terms_version: "DANHEI_TERMINOS_V1_0",
  privacy_notice_version: "DANHEI_AVISO_PRIVACIDAD_V1_0"
};

if (navToggle && mainNav) {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  mainNav.querySelectorAll("a").forEach((link) => {
    const linkPage = link.getAttribute("href")?.split("#")[0];

    link.classList.toggle("active", linkPage === currentPage);
    if (linkPage === currentPage) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  navToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

document.querySelectorAll('a[href*="wa.me/573112206587"]').forEach((link) => {
  link.href = WHATSAPP_URL;
});

function getStoredSubmissions() {
  try {
    return JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function getUtmParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || ""
  };
}

function serializeForm(form) {
  const payload = {};
  new FormData(form).forEach((value, key) => {
    payload[key] = String(value).trim();
  });
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    payload[input.name] = input.checked;
  });
  return payload;
}

function saveSubmission(form, payload) {
  const submissions = getStoredSubmissions();
  const record = {
    ...payload,
    full_name: payload.full_name || "",
    email: payload.email || "",
    phone: payload.phone || "",
    form_type: form.dataset.formType || "contacto",
    personal_data_policy_accepted: Boolean(payload.personal_data_policy_accepted),
    terms_accepted: Boolean(payload.terms_accepted),
    marketing_consent: Boolean(payload.marketing_consent),
    ...LEGAL_VERSIONS,
    submitted_at: new Date().toISOString(),
    ip_address: "captura pendiente de backend",
    user_agent: navigator.userAgent,
    source_page: window.location.href,
    ...getUtmParams()
  };
  submissions.push(record);
  localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(submissions.slice(-300)));
  return record;
}

document.querySelectorAll("[data-danhei-form]").forEach((form) => {
  const status = form.querySelector(".form-status");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      if (status) {
        status.textContent = "Revisa los campos obligatorios y acepta las autorizaciones requeridas.";
      }
      return;
    }

    const payload = serializeForm(form);
    saveSubmission(form, payload);
    form.reset();

    if (status) {
      status.textContent = "Solicitud registrada. También puedes escribirnos por WhatsApp para atención inmediata.";
    }
  });
});

function renderCookieBanner() {
  if (localStorage.getItem(COOKIE_STORAGE_KEY)) {
    return;
  }

  const banner = document.createElement("section");
  banner.className = "cookie-banner";
  banner.setAttribute("aria-label", "Preferencias de cookies");
  banner.innerHTML = `
    <div>
      <h2>Preferencias de cookies</h2>
      <p>Usamos cookies propias y de terceros para mejorar la experiencia, analizar el uso del sitio y, si lo autorizas, mostrar comunicaciones comerciales o medir campañas. Puedes aceptar todas, rechazar las no esenciales o configurar tus preferencias. Consulta nuestra <a href="/politica-cookies/">Política de Cookies</a> y <a href="/politica-tratamiento-datos/">Política de Tratamiento de Datos Personales</a>.</p>
      <div class="cookie-options" hidden>
        <label><input type="checkbox" checked disabled> Necesarias: siempre activas.</label>
        <label><input type="checkbox" data-cookie-analytics> Analíticas: opcionales.</label>
        <label><input type="checkbox" data-cookie-marketing> Marketing: opcionales.</label>
      </div>
    </div>
    <div class="cookie-actions">
      <button type="button" data-cookie-accept>Aceptar todas</button>
      <button type="button" data-cookie-reject>Rechazar no esenciales</button>
      <button type="button" data-cookie-config>Configurar</button>
    </div>
  `;
  document.body.appendChild(banner);

  const options = banner.querySelector(".cookie-options");
  const save = (analytics, marketing) => {
    localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify({
      necessary: true,
      analytics,
      marketing,
      saved_at: new Date().toISOString()
    }));
    banner.remove();
  };

  banner.querySelector("[data-cookie-accept]").addEventListener("click", () => save(true, true));
  banner.querySelector("[data-cookie-reject]").addEventListener("click", () => save(false, false));
  banner.querySelector("[data-cookie-config]").addEventListener("click", () => {
    if (options.hidden) {
      options.hidden = false;
      return;
    }
    save(
      banner.querySelector("[data-cookie-analytics]").checked,
      banner.querySelector("[data-cookie-marketing]").checked
    );
  });
}

renderCookieBanner();
