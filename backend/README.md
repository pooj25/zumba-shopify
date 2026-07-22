# Zumba Backend

Local backend for the Zumba Shopify project.

## What it tracks

- Teachers
- Students
- Class schedule
- Attendance
- Remaining class balance for passes

## Run

```powershell
cd C:\Users\Pooja\Downloads\shopify\backend
npm start
```

Open:

```text
http://127.0.0.1:5050
```

The data is saved in `backend/data/db.json`.

For local port 5051:

```powershell
$env:PORT=5051
npm start
```

## API

- `GET /api/summary`
- `GET /api/teachers`
- `GET /api/students`
- `GET /api/classes`
- `GET /api/attendance`
- `POST /api/teachers`
- `POST /api/students`
- `POST /api/classes`
- `POST /api/checkin`
- `GET /api/orders`
- `POST /api/simulate-shopify-order`
- `POST /webhooks/shopify/orders-create`

## Shopify integration

For live Shopify orders, create an `orders/create` webhook that points to:

```text
https://your-public-backend-url/webhooks/shopify/orders-create
```

Shopify cannot send webhooks directly to `localhost`, so local development needs a public HTTPS tunnel such as Cloudflare Tunnel or ngrok.

Set `SHOPIFY_WEBHOOK_SECRET` before running the backend to verify Shopify webhook signatures:

```powershell
$env:SHOPIFY_WEBHOOK_SECRET="your_webhook_secret"
node server.js
```

## Deploy on Render

1. Push this project to GitHub.
2. Open Render and create a new Blueprint from this repo.
3. Render will read `render.yaml` from the project root.
4. Add `SHOPIFY_WEBHOOK_SECRET` in Render environment variables.
5. After deploy, open the Render URL to use the admin panel.

This uses a paid Render web service with a persistent disk, because the backend stores student and attendance data in a JSON file.

Your Shopify webhook URL will be:

```text
https://your-render-service.onrender.com/webhooks/shopify/orders-create
```
