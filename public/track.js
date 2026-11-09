(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])
  );

  function setTheme(theme, save = false) {
    const selected = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = selected;
    const toggle = $("#themeToggle");
    if (toggle) {
      toggle.textContent = selected === "dark" ? "☀ Light" : "☾ Dark";
      toggle.setAttribute("aria-label", selected === "dark" ? "Switch to light mode" : "Switch to dark mode");
      toggle.setAttribute("aria-pressed", String(selected === "dark"));
    }
    if (save) localStorage.setItem("preciousLensTheme", selected);
  }

  setTheme(localStorage.getItem("preciousLensTheme") || "light");

  $("#themeToggle").addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  });

  $("#menuToggle").addEventListener("click", () => $("#nav").classList.toggle("open"));
  $("#nav").addEventListener("click", event => {
    if (event.target.closest("a")) $("#nav").classList.remove("open");
  });

  async function loadBrand() {
    try {
      const response = await fetch("/api/public");
      if (!response.ok) return;
      const data = await response.json();
      const settings = data.settings || {};
      const businessName = settings.business_name || "Precious Lens";
      $("#brandName").textContent = businessName;
      $("#footerName").textContent = businessName;
      document.title = `Track Your Request | ${businessName}`;
      if (settings.primary_color) {
        document.documentElement.style.setProperty("--gold", settings.primary_color);
      }
      if (settings.background_color) {
        document.documentElement.style.setProperty("--paper", settings.background_color);
      }
      const mark = $("#brandMark");
      if (settings.logo_image_url) {
        mark.innerHTML = `<img src="${esc(settings.logo_image_url)}" alt="${esc(businessName)} logo">`;
        mark.classList.add("has-image");
      } else {
        mark.textContent = settings.logo_text || "PL";
        mark.classList.remove("has-image");
      }
    } catch (error) {
      console.warn("Could not load public branding settings.");
    }
  }

  const form = $("#trackLookupForm");
  const message = $("#trackFormMessage");
  const results = $("#trackResults");
  const submit = $("#trackSubmit");

  function renderRequest(enquiry, responses) {
    const status = String(enquiry.status || "New");
    const responseMarkup = responses.length
      ? responses.map(reply => `
          <article class="track-reply">
            <p>${esc(reply.message)}</p>
            <time>${esc(reply.created_at)}</time>
          </article>`).join("")
      : '<p class="track-empty">Our team has not posted a response yet. Please check back for updates.</p>';

    results.innerHTML = `
      <div class="track-summary">
        <div>
          <p class="track-reference">REQUEST REFERENCE</p>
          <strong>${esc(enquiry.tracking_reference)}</strong>
        </div>
        <span class="track-status" data-status="${esc(status)}">${esc(status)}</span>
      </div>
      <article class="track-panel">
        <h3>Request Details</h3>
        <div class="track-details">
          <div class="track-detail"><small>Customer</small><strong>${esc(enquiry.name)}</strong></div>
          <div class="track-detail"><small>Photography service</small><strong>${esc(enquiry.service || "Not specified")}</strong></div>
          <div class="track-detail"><small>Event date</small><strong>${esc(enquiry.event_date || "Not specified")}</strong></div>
          <div class="track-detail"><small>Submitted</small><strong>${esc(enquiry.created_at)}</strong></div>
        </div>
      </article>
      <article class="track-panel">
        <h3>Your Original Request</h3>
        <p class="track-original">${esc(enquiry.message)}</p>
      </article>
      <article class="track-panel">
        <h3>Messages from Precious Lens</h3>
        ${responseMarkup}
      </article>
      <p class="track-updated">Last updated: ${esc(enquiry.updated_at || enquiry.created_at)}</p>
      <button type="button" class="track-again" id="trackAnother">← Track another request</button>
    `;
    results.classList.add("visible");
    $("#trackAnother").addEventListener("click", () => {
      results.classList.remove("visible");
      results.innerHTML = "";
      form.reset();
      message.textContent = "";
      $("#trackReference").focus();
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function retrieveRequest(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to find this request.");
    renderRequest(data.enquiry, data.responses || []);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    message.textContent = "";
    message.classList.remove("success");
    results.classList.remove("visible");
    submit.disabled = true;
    submit.textContent = "Searching...";

    const payload = Object.fromEntries(new FormData(form));
    payload.reference = String(payload.reference || "").trim().toUpperCase();
    payload.email = String(payload.email || "").trim();

    try {
      await retrieveRequest("/api/track/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      message.textContent = "Your request was found successfully.";
      message.classList.add("success");
    } catch (error) {
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.textContent = "Track My Request →";
    }
  });

  async function loadPrivateTrackingLink() {
    const token = new URLSearchParams(location.search).get("token") || "";
    if (!token) return;
    form.hidden = true;
    const valid = /^[a-f0-9]{64}$/.test(token);
    if (!valid) {
      message.textContent = "This tracking link is invalid. Please check the link you received.";
      return;
    }
    message.textContent = "Loading your private tracking link...";
    try {
      await retrieveRequest(`/api/track/${encodeURIComponent(token)}`);
      message.textContent = "Your private tracking link is active.";
      message.classList.add("success");
    } catch (error) {
      message.textContent = error.message;
      form.hidden = false;
    }
  }

  $("#trackYear").textContent = new Date().getFullYear();
  loadBrand();
  loadPrivateTrackingLink();
})();
