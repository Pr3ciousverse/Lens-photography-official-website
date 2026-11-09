# Precious Lens Photography Website

A one-page public photography portfolio with a separate password-protected admin dashboard.

## Requirements
- Node.js 22
- npm

## Run locally
1. Extract the ZIP and open the `precious-lens-photography` folder in VS Code.
2. Open the VS Code terminal in that folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Change `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env`.
6. Run `npm start`.
7. Open `http://localhost:3000`.
8. Open the admin page at `http://localhost:3000/admin`.

## Important
- The admin email and password are configured in `.env`; they are not hard-coded into the public website.
- Uploaded images and the SQLite database are stored under `data/`.
- On Render or another host, configure a persistent disk and set `DATA_DIR` to its mount path. Without persistent storage, SQLite data and uploaded images may be lost on redeployment.
- Use HTTPS in production. Set `NODE_ENV=production` and a strong `SESSION_SECRET`.
- This starter uses local disk image storage. For production hosting, use persistent disk storage or connect an object-storage provider such as Cloudinary or S3.
- Replace the sample text, prices, and Unsplash sample images with the photographer's approved content.
