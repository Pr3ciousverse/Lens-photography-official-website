const $ = s => document.querySelector(s);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

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

async function loadSite(){
  const res = await fetch("/api/public"); const data = await res.json(); const s = data.settings;
  document.documentElement.style.setProperty("--gold", s.primary_color || "#facc15");
  document.documentElement.style.setProperty("--paper", s.background_color || "#fff");
  $("#brandName").textContent = s.business_name; $("#footerName").textContent = s.business_name;
  if (s.logo_image_url) {
    $("#brandMark").innerHTML = `<img src="${escapeHtml(s.logo_image_url)}" alt="${escapeHtml(s.business_name)} logo">`;
    $("#brandMark").classList.add("has-image");
  } else {
    $("#brandMark").textContent = s.logo_text || "PL";
    $("#brandMark").classList.remove("has-image");
  }
  document.title = `${s.business_name} | Photography`;
  $("#heroTitle").textContent = s.hero_title; $("#heroSubtitle").textContent = s.hero_subtitle;
  $(".hero").style.backgroundImage = `linear-gradient(90deg,rgba(0,0,0,.72),rgba(0,0,0,.18)),url("${s.hero_image}")`;
  $("#aboutTitle").textContent = s.about_title; $("#aboutText").textContent = s.about_text;
  if(s.about_image) $("#aboutImage").src = s.about_image;
  $("#servicesGrid").innerHTML = data.services.map(x => `<article class="service-card"><div class="service-icon">${escapeHtml(x.icon)}</div><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.description)}</p></article>`).join("");
  $("#galleryGrid").innerHTML = data.photos.map(x => `<img src="${escapeHtml(x.image_url)}" alt="${escapeHtml(x.title)}" loading="lazy">`).join("");
  $("#packagesGrid").innerHTML = data.packages.map((x,i) => `<article class="package-card ${i===1?"featured":""}"><h3>${escapeHtml(x.title)}</h3><div class="package-price">${escapeHtml(x.price)}</div><p>${escapeHtml(x.description)}</p><ul>${String(x.features).split("\n").filter(Boolean).map(f=>`<li>${escapeHtml(f)}</li>`).join("")}</ul><a class="button button-gold" href="#contact" data-package="${escapeHtml(x.title)}">Book This Package</a></article>`).join("");
  $("#contactPhone").textContent = "☎ " + s.phone; $("#contactEmail").textContent = "✉ " + s.email; $("#contactAddress").textContent = "⌖ " + s.address;

  const whatsappLink = s.whatsapp_url || (s.whatsapp ? `https://wa.me/${String(s.whatsapp).replace(/\D/g, "")}` : "");
  const socialItems = [
    {
      name: "Instagram",
      url: s.instagram,
      className: "instagram",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>'
    },
    {
      name: "Facebook",
      url: s.facebook,
      className: "facebook",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-8h2.8l.4-3.1h-3.2v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.3V13h2.8v8z"/></svg>'
    },
    {
      name: "WhatsApp",
      url: whatsappLink,
      className: "whatsapp",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a9.8 9.8 0 0 0-8.4 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1 1 12 20Zm4.4-5.9c-.2-.1-1.5-.7-1.8-.8-.2-.1-.4-.1-.5.2l-.8 1c-.1.2-.3.2-.5.1a6.8 6.8 0 0 1-3.3-2.9c-.2-.3.2-.4.6-1 .1-.2 0-.4 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.3s1 2.6 1.1 2.8c.2.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.2-.3-.3-.5-.4Z"/></svg>'
    }
  ];

  $("#socialLinks").innerHTML = socialItems
    .filter(item => item.url)
    .map(item => `<a class="social-icon ${item.className}" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${item.name}" title="${item.name}">${item.icon}</a>`)
    .join("");

}
$("#menuToggle").addEventListener("click",()=>$("#nav").classList.toggle("open"));
$("#nav").addEventListener("click",e=>{if(e.target.tagName==="A")$("#nav").classList.remove("open")});
$("#themeToggle").addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme, true);
});
document.addEventListener("click",e=>{const a=e.target.closest("[data-package]");if(a){const field=$('input[name="service"]');if(field)field.value=a.dataset.package}});
$("#enquiryForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const data=Object.fromEntries(new FormData(form));
  const msg=$("#formMessage");
  msg.textContent="Sending your request...";
  try {
    const r=await fetch("/api/enquiries",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(data)
    });
    const out=await r.json();
    if(!r.ok) throw new Error(out.error || "Unable to send your request.");
    msg.innerHTML=`Thank you. Your request has been received.<br><strong>Reference: ${out.reference}</strong><br><a href="${out.tracking_url}">Track your request and view replies</a>${out.email_sent ? "<br>A tracking link has also been sent to your email." : "<br>Please save the tracking link above."}`;
    form.reset();
  } catch(err) {
    msg.textContent=err.message;
  }
});
$("#year").textContent=new Date().getFullYear();
loadSite().catch(()=>{});
