const $=s=>document.querySelector(s);
let siteData=null;
async function api(url,options={}){const r=await fetch(url,{...options,headers:{...(options.body instanceof FormData?{}:{"Content-Type":"application/json"}),...(options.headers||{})}});const d= r.status===204?{}:await r.json();if(!r.ok)throw new Error(d.error||"Request failed");return d}
function message(t){$("#globalMessage").textContent=t;setTimeout(()=>$("#globalMessage").textContent="",4000)}
function formValues(form){return Object.fromEntries(new FormData(form))}
function fillForm(form,obj){for(const el of form.elements)if(el.name&&obj[el.name]!==undefined)el.value=obj[el.name]}
async function refresh(){
 siteData=await api("/api/public");const s=siteData.settings;
 fillForm($("#contentForm"),s);fillForm($("#settingsForm"),s);
 if(s.logo_image_url){
   $("#logoPreview").src=s.logo_image_url;
   $("#logoPreview").hidden=false;
 }
 $("#photoCount").textContent=siteData.photos.length;$("#serviceCount").textContent=siteData.services.length;$("#packageCount").textContent=siteData.packages.length;
 renderServices();renderPackages();renderPhotos();await loadEnquiries();
}
function showDashboard(email){$("#loginView").classList.add("hidden");$("#dashboardView").classList.remove("hidden");$("#adminEmail").textContent=email;refresh().catch(e=>message(e.message))}
async function checkSession(){const s=await api("/api/admin/session");if(s.authenticated)showDashboard(s.email)}
$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#loginMessage").textContent="";try{await api("/api/admin/login",{method:"POST",body:JSON.stringify(formValues(e.currentTarget))});const s=await api("/api/admin/session");showDashboard(s.email)}catch(err){$("#loginMessage").textContent=err.message}});
$("#logoutBtn").addEventListener("click",async()=>{await api("/api/admin/logout",{method:"POST"});location.reload()});
$("#saveContent").addEventListener("click",async()=>{try{await api("/api/admin/settings",{method:"PUT",body:JSON.stringify(formValues($("#contentForm")))});message("Website content saved.")}catch(e){message(e.message)}});
$("#saveSettings").addEventListener("click",async()=>{try{await api("/api/admin/settings",{method:"PUT",body:JSON.stringify(formValues($("#settingsForm")))});message("Appearance and social links saved.")}catch(e){message(e.message)}});
function renderServices(){const el=$("#servicesList");el.innerHTML=siteData.services.map(x=>`<div class="record" data-id="${x.id}" data-kind="services"><input data-field="title" value="${esc(x.title)}"><input data-field="icon" value="${esc(x.icon)}"><input data-field="description" value="${esc(x.description)}"><button data-action="save">Save</button><button class="delete" data-action="delete">Delete</button></div>`).join("")||"No services yet."}
function renderPackages(){const el=$("#packagesList");el.innerHTML=siteData.packages.map(x=>`<div class="record" data-id="${x.id}" data-kind="packages"><input data-field="title" value="${esc(x.title)}"><input data-field="price" value="${esc(x.price)}"><input data-field="description" value="${esc(x.description)}"><input data-field="features" value="${esc(x.features)}"><button data-action="save">Save</button><button class="delete" data-action="delete">Delete</button></div>`).join("")||"No packages yet."}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function manageRecord(e){const btn=e.target.closest("button[data-action]");if(!btn)return;const row=btn.closest(".record"),kind=row.dataset.kind,id=row.dataset.id;try{if(btn.dataset.action==="delete"){if(!confirm("Delete this item?"))return;await api(`/api/admin/${kind}/${id}`,{method:"DELETE"})}else{const data={};row.querySelectorAll("[data-field]").forEach(i=>data[i.dataset.field]=i.value);await api(`/api/admin/${kind}/${id}`,{method:"PUT",body:JSON.stringify(data)})}await refresh();message("Updated successfully.")}catch(err){message(err.message)}}
$("#servicesList").addEventListener("click",manageRecord);$("#packagesList").addEventListener("click",manageRecord);
$("#addService").addEventListener("click",async()=>{const title=prompt("Service name?");if(!title)return;const description=prompt("Short description?")||"";const icon=prompt("Emoji/icon (e.g. 📷)?","📷")||"📷";try{await api("/api/admin/services",{method:"POST",body:JSON.stringify({title,description,icon})});await refresh()}catch(e){message(e.message)}});
$("#addPackage").addEventListener("click",async()=>{const title=prompt("Package name?");if(!title)return;const price=prompt("Price (e.g. ₦50,000)?")||"";const description=prompt("Short description?")||"";const features=prompt("Features separated by |")||"";try{await api("/api/admin/packages",{method:"POST",body:JSON.stringify({title,price,description,features:features.split("|").join("\n")})});await refresh()}catch(e){message(e.message)}});
$("#uploadForm").addEventListener("submit",async e=>{e.preventDefault();try{const data=new FormData(e.currentTarget);await api("/api/admin/photos",{method:"POST",body:data});e.currentTarget.reset();await refresh();message("Photos uploaded.")}catch(err){message(err.message)}});
function renderPhotos(){$("#galleryList").innerHTML=siteData.photos.map(p=>`<div class="photo-item"><img src="${esc(p.image_url)}" alt="${esc(p.title)}"><button data-photo="${p.id}" aria-label="Delete photo">×</button></div>`).join("")}
$("#galleryList").addEventListener("click",async e=>{const b=e.target.closest("[data-photo]");if(!b)return;if(!confirm("Delete this photo?"))return;try{await api(`/api/admin/photos/${b.dataset.photo}`,{method:"DELETE"});await refresh()}catch(err){message(err.message)}});
async function loadEnquiries(){
  try {
    const list=await api("/api/admin/enquiries");
    $("#enquiryCount").textContent=list.length;
    const newCount=list.filter(x=>x.status==="New").length;
    $("#notificationText").textContent=newCount
      ? `${newCount} new customer request${newCount===1?"":"s"} waiting for your attention.`
      : "You're all caught up. No new customer requests.";
    $("#requestNotification").classList.toggle("has-requests",newCount>0);

    $("#enquiriesList").innerHTML=list.map(x=>`
      <article class="enquiry">
        <strong>${esc(x.name)} — ${esc(x.service)}</strong>
        <small>${esc(x.email)} · ${esc(x.phone)} · ${esc(x.event_date)} · ${esc(x.created_at)}</small>
        <p>${esc(x.message)}</p>
        <p><strong>Reference:</strong> ${esc(x.tracking_reference)}</p>
        <p><a href="${esc(x.tracking_url)}" target="_blank" rel="noopener">Open customer tracking page</a></p>
        <div class="tracking-actions">
          <button type="button" class="secondary-btn" data-copy-tracking="${x.id}">Copy tracking link</button>
          <button type="button" class="secondary-btn" data-send-tracking="${x.id}">Email tracking link</button>
        </div>
        <label>Status
          <select data-enquiry="${x.id}">
            ${["New","Contacted","Completed","Archived"].map(v=>`<option value="${v}" ${v===x.status?"selected":""}>${v}</option>`).join("")}
          </select>
        </label>
        <div class="request-replies">
          <strong>Conversation history</strong>
          ${(x.responses||[]).map(r=>`<p class="request-reply">${esc(r.message)}<small>${esc(r.created_at)}</small></p>`).join("") || "<p>No replies sent yet.</p>"}
          <textarea rows="3" maxlength="3000" data-reply="${x.id}" placeholder="Write a response to this customer..."></textarea>
          <button type="button" class="primary-btn" data-submit-reply="${x.id}">Send response</button>
        </div>
        <button class="danger-btn" data-delete-enquiry="${x.id}">Delete</button>
      </article>
    `).join("") || "No enquiries yet.";
  } catch(e) {
    $("#enquiriesList").textContent=e.message;
  }
}
$("#refreshEnquiries").addEventListener("click",loadEnquiries);
$("#enquiriesList").addEventListener("change",async e=>{
  const s=e.target.closest("[data-enquiry]");
  if(!s)return;
  try {
    const result=await api(`/api/admin/enquiries/${s.dataset.enquiry}`,{
      method:"PATCH",body:JSON.stringify({status:s.value})
    });
    message(result.email_sent ? "Status updated and customer emailed." : "Status updated. Email notification was not sent (SMTP may not be configured).");
  } catch(err) {
    message(err.message);
  }
});
$("#enquiriesList").addEventListener("click",async e=>{
  const copy=e.target.closest("[data-copy-tracking]");
  if(copy){
    try {
      const items=await api("/api/admin/enquiries");
      const item=items.find(x=>String(x.id)===copy.dataset.copyTracking);
      if(!item)throw new Error("Request not found.");
      await navigator.clipboard.writeText(item.tracking_url);
      message("Tracking link copied.");
    } catch(err) {
      message("Could not copy the link. Open the customer tracking page and copy its address.");
    }
    return;
  }

  const send=e.target.closest("[data-send-tracking]");
  if(send){
    try {
      const result=await api(`/api/admin/enquiries/${send.dataset.sendTracking}/send-tracking`,{method:"POST",body:JSON.stringify({})});
      message(result.email_sent ? "Tracking link emailed to customer." : "Tracking link is available above, but email is not configured or could not be sent.");
    } catch(err) { message(err.message); }
    return;
  }

  const reply=e.target.closest("[data-submit-reply]");
  if(reply){
    const id=reply.dataset.submitReply;
    const field=$(`[data-reply="${id}"]`);
    const messageText=field.value.trim();
    if(!messageText){message("Write a response first.");return;}
    try {
      const result=await api(`/api/admin/enquiries/${id}/replies`,{
        method:"POST",body:JSON.stringify({message:messageText})
      });
      await loadEnquiries();
      message(result.email_sent ? "Response saved and emailed to customer." : "Response saved. Email notification was not sent.");
    } catch(err) { message(err.message); }
    return;
  }

  const del=e.target.closest("[data-delete-enquiry]");
  if(del && confirm("Delete this enquiry and its response history? This cannot be undone.")){
    try {
      await api(`/api/admin/enquiries/${del.dataset.deleteEnquiry}`,{method:"DELETE"});
      await loadEnquiries();
    } catch(err) { message(err.message); }
  }
});
$("#logoForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const msg=$("#logoMessage");
 msg.textContent="Uploading logo...";
 try{
   const result=await api("/api/admin/logo",{method:"POST",body:new FormData(e.currentTarget)});
   $("#logoPreview").src=result.logo_image_url;
   $("#logoPreview").hidden=false;
   msg.textContent="Logo uploaded successfully. It is now displayed on the public website.";
 }catch(err){msg.textContent=err.message}
});

$("#deleteLogo").addEventListener("click", async () => {
  if (!confirm("Are you sure you want to delete the current logo?")) return;

  const button = $("#deleteLogo");
  const msg = $("#logoMessage");

  button.disabled = true;
  msg.textContent = "Deleting logo...";

  try {
    await api("/api/admin/logo", { method: "DELETE" });
    await refresh();
    msg.textContent = "Logo deleted successfully. Business initials will now appear.";
  } catch (err) {
    msg.textContent = err.message;
    button.disabled = false;
  }
});

checkSession().catch(()=>{});
setInterval(()=>{
 if(!$("#dashboardView").classList.contains("hidden")) loadEnquiries();
},20000);
