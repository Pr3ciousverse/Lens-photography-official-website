require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

if (!process.env.SESSION_SECRET) {
  console.warn("WARNING: SESSION_SECRET is not set. Set a strong secret in .env before deployment.");
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const db = new Database(path.join(DATA_DIR, "photography.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '📷',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  price TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Portfolio',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);


// Customer request tracking migration. Existing enquiry records are preserved.
const enquiryColumns = db.prepare("PRAGMA table_info(enquiries)").all().map(c => c.name);
if (!enquiryColumns.includes("tracking_token")) {
  db.exec("ALTER TABLE enquiries ADD COLUMN tracking_token TEXT");
}
if (!enquiryColumns.includes("tracking_reference")) {
  db.exec("ALTER TABLE enquiries ADD COLUMN tracking_reference TEXT");
}
if (!enquiryColumns.includes("updated_at")) {
  db.exec("ALTER TABLE enquiries ADD COLUMN updated_at TEXT");
}
if (!enquiryColumns.includes("responded_at")) {
  db.exec("ALTER TABLE enquiries ADD COLUMN responded_at TEXT");
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_tracking_token
  ON enquiries(tracking_token);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_tracking_reference
  ON enquiries(tracking_reference);
  CREATE TABLE IF NOT EXISTS enquiry_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enquiry_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
  );
`);
const existingEnquiries = db.prepare(
  "SELECT id, tracking_token, tracking_reference FROM enquiries"
).all();
const updateTracking = db.prepare(
  "UPDATE enquiries SET tracking_token=?, tracking_reference=?, updated_at=COALESCE(updated_at, created_at) WHERE id=?"
);
for (const item of existingEnquiries) {
  if (!item.tracking_token || !item.tracking_reference) {
    const token = item.tracking_token || crypto.randomBytes(32).toString("hex");
    const reference = item.tracking_reference || `PL-${new Date().getFullYear()}-${String(item.id).padStart(6, "0")}`;
    updateTracking.run(token, reference, item.id);
  }
}
db.pragma("foreign_keys = ON");

const mailTransport = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
function trackingUrl(token, req) {
  const base = publicBaseUrl || `${req.protocol}://${req.get("host")}`;
  return `${base}/track.html?token=${encodeURIComponent(token)}`;
}
async function sendCustomerEmail(to, subject, text) {
  if (!mailTransport || !process.env.SMTP_FROM) {
    return { sent: false, reason: "Email is not configured." };
  }
  try {
    await mailTransport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text
    });
    return { sent: true };
  } catch (error) {
    console.error("Customer email could not be sent:", error.message);
    return { sent: false, reason: "Email could not be sent." };
  }
}

const defaults = {
  business_name: "Precious Lens",
  tagline: "Capturing life's best moments",
  hero_title: "Professional Photography for Every Occasion",
  hero_subtitle: "Timeless photos. Lasting memories. Let's turn your special moments into beautiful memories.",
  about_title: "About Precious Lens",
  about_text: "We are a professional photography studio dedicated to capturing life's most precious moments with creativity, passion and excellence.",
  about_image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85",
  phone: "+234 803 064 4794",
  email: "info@preciouslens.com",
  whatsapp: "2348030644794",
  address: "Lagos, Nigeria",
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",
  whatsapp_url: "https://wa.me/2348030644794",
  primary_color: "#C6A04A",
  background_color: "#ffffff",
  dark_color: "#101114",
  logo_text: "PL",
  logo_image_url: "",
  hero_image: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=90"
};
const insertSetting = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
for (const [key, value] of Object.entries(defaults)) insertSetting.run(key, value);

if (db.prepare("SELECT COUNT(*) AS n FROM services").get().n === 0) {
  const add = db.prepare("INSERT INTO services(title,description,icon,sort_order) VALUES(?,?,?,?)");
  [
    ["Wedding Photography", "Capture your love story with timeless images.", "📷", 1],
    ["Event Photography", "From corporate events to special celebrations.", "🎉", 2],
    ["Portrait Photography", "Professional portraits for every occasion.", "👤", 3],
    ["Product Photography", "Showcase your brand with stunning images.", "📦", 4]
  ].forEach(x => add.run(...x));
}
if (db.prepare("SELECT COUNT(*) AS n FROM packages").get().n === 0) {
  const add = db.prepare("INSERT INTO packages(title,price,description,features,sort_order) VALUES(?,?,?,?,?)");
  [
    ["Basic Package", "₦50,000", "A simple session for your special moments.", "1 Location\n50 Edited Photos\nOnline Delivery", 1],
    ["Premium Package", "₦80,000", "More coverage and more memories.", "2 Locations\n100 Edited Photos\nAlbum Included", 2],
    ["Deluxe Package", "₦120,000", "Our complete photography experience.", "3 Locations\n150 Edited Photos\nFramed Print", 3]
  ].forEach(x => add.run(...x));
}
if (db.prepare("SELECT COUNT(*) AS n FROM photos").get().n === 0) {
  const add = db.prepare("INSERT INTO photos(title,image_url,category,sort_order) VALUES(?,?,?,?)");
  [
    ["Wedding moments", "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=85", "Wedding", 1],
    ["Portrait session", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=85", "Portrait", 2],
    ["Graduation", "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=900&q=85", "Events", 3],
    ["Studio portrait", "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85", "Portrait", 4],
    ["Camera details", "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85", "Behind the scenes", 5]
  ].forEach(x => add.run(...x));
}

const adminEmail = (process.env.ADMIN_EMAIL || "").trim();
const adminPassword = process.env.ADMIN_PASSWORD || "";
if (adminEmail && adminPassword && !db.prepare("SELECT id FROM admins WHERE email = ?").get(adminEmail)) {
  db.prepare("INSERT INTO admins(email,password_hash) VALUES(?,?)").run(adminEmail, bcrypt.hashSync(adminPassword, 12));
}

const SQLiteStore = SQLiteStoreFactory(session);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

const requireAdmin = (req, res, next) => {
  if (!req.session.adminId) return res.status(401).json({ error: "Please sign in again." });
  next();
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return cb(new Error("Only JPG, PNG and WebP images are allowed."));
    cb(null, true);
  }
});

function getSettings() {
  return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x => [x.key, x.value]));
}
function publicData() {
  return {
    settings: getSettings(),
    services: db.prepare("SELECT * FROM services ORDER BY sort_order,id").all(),
    packages: db.prepare("SELECT * FROM packages ORDER BY sort_order,id").all(),
    photos: db.prepare("SELECT * FROM photos ORDER BY sort_order DESC,id DESC").all()
  };
}

app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/api/public", (_req, res) => res.json(publicData()));

app.get("/api/admin/session", (req, res) => {
  res.json({ authenticated: Boolean(req.session.adminId), email: req.session.adminEmail || "" });
});
app.post("/api/admin/login", (req, res) => {
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  const admin = db.prepare("SELECT * FROM admins WHERE email = ?").get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Incorrect email address or password." });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start a secure session." });
    req.session.adminId = admin.id;
    req.session.adminEmail = admin.email;
    res.json({ ok: true });
  });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const allowed = new Set(Object.keys(defaults));
  const update = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const tx = db.transaction(entries => {
    for (const [key, value] of entries) if (allowed.has(key)) update.run(key, String(value).slice(0, 5000));
  });
  tx(Object.entries(req.body || {}));
  res.json({ ok: true });
});

app.post("/api/admin/photos", requireAdmin, upload.array("photos", 20), (req, res) => {
  const add = db.prepare("INSERT INTO photos(title,image_url,category) VALUES(?,?,?)");
  for (const file of req.files || []) add.run(path.parse(file.originalname).name, `/uploads/${file.filename}`, req.body.category || "Portfolio");
  res.json({ ok: true, count: (req.files || []).length });
});
app.post("/api/admin/logo", requireAdmin, upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a logo image first." });

  const old = db.prepare("SELECT value FROM settings WHERE key='logo_image_url'").get();
  const logoUrl = `/uploads/${req.file.filename}`;

  db.prepare("INSERT INTO settings(key,value) VALUES('logo_image_url',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(logoUrl);

  if (old && old.value && old.value.startsWith("/uploads/")) {
    const oldFile = path.join(UPLOAD_DIR, path.basename(old.value));
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  res.json({ ok: true, logo_image_url: logoUrl });
});

app.delete("/api/admin/logo", requireAdmin, (req, res) => {
  const current = db.prepare("SELECT value FROM settings WHERE key='logo_image_url'").get();

  db.prepare("INSERT INTO settings(key,value) VALUES('logo_image_url','') ON CONFLICT(key) DO UPDATE SET value=''").run();

  if (current && current.value && current.value.startsWith("/uploads/")) {
    const file = path.join(UPLOAD_DIR, path.basename(current.value));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  res.json({ ok: true, logo_image_url: "" });
});

app.delete("/api/admin/photos/:id", requireAdmin, (req, res) => {
  const photo = db.prepare("SELECT image_url FROM photos WHERE id=?").get(req.params.id);
  if (!photo) return res.status(404).json({ error: "Photo not found." });
  if (photo.image_url.startsWith("/uploads/")) {
    const file = path.join(UPLOAD_DIR, path.basename(photo.image_url));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare("DELETE FROM photos WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

for (const table of ["services", "packages"]) {
  const fields = table === "services" ? ["title", "description", "icon"] : ["title", "price", "description", "features"];
  app.post(`/api/admin/${table}`, requireAdmin, (req, res) => {
    const values = fields.map(k => String(req.body[k] || "").trim());
    if (!values[0]) return res.status(400).json({ error: "A title is required." });
    const cols = fields.join(",");
    const marks = fields.map(() => "?").join(",");
    const result = db.prepare(`INSERT INTO ${table}(${cols}) VALUES(${marks})`).run(...values);
    res.json({ ok: true, id: result.lastInsertRowid });
  });
  app.put(`/api/admin/${table}/:id`, requireAdmin, (req, res) => {
    const values = fields.map(k => String(req.body[k] || "").trim());
    if (!values[0]) return res.status(400).json({ error: "A title is required." });
    db.prepare(`UPDATE ${table} SET ${fields.map(k => `${k}=?`).join(",")} WHERE id=?`).run(...values, req.params.id);
    res.json({ ok: true });
  });
  app.delete(`/api/admin/${table}/:id`, requireAdmin, (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });
}

app.post("/api/enquiries", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 120);
  const email = String(req.body.email || "").trim().slice(0, 180);
  const message = String(req.body.message || "").trim().slice(0, 3000);
  if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter your name, a valid email and a message." });
  }

  const info = db.prepare(
    "INSERT INTO enquiries(name,email,phone,service,event_date,message) VALUES(?,?,?,?,?,?)"
  ).run(
    name, email,
    String(req.body.phone || "").slice(0, 40),
    String(req.body.service || "").slice(0, 120),
    String(req.body.event_date || "").slice(0, 30),
    message
  );

  const id = Number(info.lastInsertRowid);
  const token = crypto.randomBytes(32).toString("hex");
  const reference = `PL-${new Date().getFullYear()}-${String(id).padStart(6, "0")}`;
  db.prepare(
    "UPDATE enquiries SET tracking_token=?, tracking_reference=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(token, reference, id);

  const url = trackingUrl(token, req);
  const emailResult = await sendCustomerEmail(
    email,
    `Your Precious Lens request — ${reference}`,
    `Hello ${name},\n\nThank you for contacting Precious Lens. Your request has been received.\n\nReference: ${reference}\nTrack your request and view our replies here:\n${url}\n\nPlease keep this private link safe.\n\nPrecious Lens`
  );

  res.json({ ok: true, id, reference, tracking_url: url, email_sent: emailResult.sent });
});


app.post("/api/track/lookup", (req, res) => {
  const reference = String(req.body.reference || "").trim().toUpperCase();
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!/^PL-\d{4}-\d{6}$/.test(reference) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(404).json({
      error: "We couldn't find a request with those details. Check your reference and email."
    });
  }

  const enquiry = db.prepare(`
    SELECT id, name, email, service, event_date, message, status,
           tracking_reference, created_at, updated_at, responded_at
    FROM enquiries
    WHERE tracking_reference = ? AND lower(email) = ?
  `).get(reference, email);

  if (!enquiry) {
    return res.status(404).json({
      error: "We couldn't find a request with those details. Check your reference and email."
    });
  }

  const responses = db.prepare(`
    SELECT message, created_at FROM enquiry_responses
    WHERE enquiry_id = ? ORDER BY id ASC
  `).all(enquiry.id);

  delete enquiry.email;

  res.json({ enquiry, responses });
});

app.get("/api/track/:token", (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).json({ error: "Tracking request not found." });

  const enquiry = db.prepare(`
    SELECT id, name, service, event_date, message, status,
           tracking_reference, created_at, updated_at, responded_at
    FROM enquiries WHERE tracking_token=?
  `).get(token);

  if (!enquiry) return res.status(404).json({ error: "Tracking request not found." });

  const responses = db.prepare(`
    SELECT message, created_at FROM enquiry_responses
    WHERE enquiry_id=? ORDER BY id ASC
  `).all(enquiry.id);

  res.json({ enquiry, responses });
});

app.get("/api/admin/enquiries", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM enquiries ORDER BY id DESC LIMIT 200").all();
  const getResponses = db.prepare(
    "SELECT id, message, created_at FROM enquiry_responses WHERE enquiry_id=? ORDER BY id ASC"
  );
  res.json(rows.map(row => ({
    ...row,
    tracking_url: trackingUrl(row.tracking_token, req),
    responses: getResponses.all(row.id)
  })));
});

app.patch("/api/admin/enquiries/:id", requireAdmin, async (req, res) => {
  const allowed = ["New", "Contacted", "Completed", "Archived"];
  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: "Choose a valid request status." });
  }
  const enquiry = db.prepare("SELECT * FROM enquiries WHERE id=?").get(req.params.id);
  if (!enquiry) return res.status(404).json({ error: "Request not found." });

  db.prepare(
    "UPDATE enquiries SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(req.body.status, req.params.id);

  let emailResult = { sent: false };
  if (enquiry.status !== req.body.status) {
    emailResult = await sendCustomerEmail(
      enquiry.email,
      `Precious Lens request update — ${enquiry.tracking_reference}`,
      `Hello ${enquiry.name},\n\nYour Precious Lens request status has been updated to: ${req.body.status}.\n\nView your request and any replies here:\n${trackingUrl(enquiry.tracking_token, req)}\n\nPrecious Lens`
    );
  }
  res.json({ ok: true, email_sent: emailResult.sent });
});

app.post("/api/admin/enquiries/:id/replies", requireAdmin, async (req, res) => {
  const message = String(req.body.message || "").trim().slice(0, 3000);
  if (!message) return res.status(400).json({ error: "Enter a reply before sending." });

  const enquiry = db.prepare("SELECT * FROM enquiries WHERE id=?").get(req.params.id);
  if (!enquiry) return res.status(404).json({ error: "Request not found." });

  db.prepare("INSERT INTO enquiry_responses(enquiry_id,message) VALUES(?,?)")
    .run(enquiry.id, message);
  db.prepare(
    "UPDATE enquiries SET updated_at=CURRENT_TIMESTAMP, responded_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(enquiry.id);

  const emailResult = await sendCustomerEmail(
    enquiry.email,
    `Precious Lens has replied — ${enquiry.tracking_reference}`,
    `Hello ${enquiry.name},\n\nPrecious Lens has responded to your request:\n\n${message}\n\nView your full request history here:\n${trackingUrl(enquiry.tracking_token, req)}\n\nPrecious Lens`
  );
  res.json({ ok: true, email_sent: emailResult.sent });
});

app.post("/api/admin/enquiries/:id/send-tracking", requireAdmin, async (req, res) => {
  const enquiry = db.prepare("SELECT * FROM enquiries WHERE id=?").get(req.params.id);
  if (!enquiry) return res.status(404).json({ error: "Request not found." });

  const emailResult = await sendCustomerEmail(
    enquiry.email,
    `Track your Precious Lens request — ${enquiry.tracking_reference}`,
    `Hello ${enquiry.name},\n\nUse the private link below to monitor your request and read replies from Precious Lens.\n\nReference: ${enquiry.tracking_reference}\n${trackingUrl(enquiry.tracking_token, req)}\n\nPrecious Lens`
  );
  res.json({ ok: true, email_sent: emailResult.sent });
});

app.delete("/api/admin/enquiries/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM enquiry_responses WHERE enquiry_id=?").run(req.params.id);
  db.prepare("DELETE FROM enquiries WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Something went wrong." });
});
app.listen(PORT, () => console.log(`Precious Lens website running at http://localhost:${PORT}`));
