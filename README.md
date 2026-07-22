# Zumba Shopify Theme

This is a compact Shopify Online Store 2.0 theme for a Zumba class business.

## Run locally

1. Install Shopify CLI if needed:
   `npm install -g @shopify/cli @shopify/theme`

2. Log in and preview the theme:
   `shopify theme dev --store your-store-name.myshopify.com`

3. Open the preview URL printed by Shopify CLI.

## Shopify setup

Create products such as:

- Trial Class
- 10-Class Pass
- Monthly Membership

Then update the pricing buttons in the Shopify theme editor so each plan links to its matching product.

## Backend

This project also includes a local backend for class management:

```powershell
cd C:\Users\Pooja\Downloads\shopify\backend
npm start
```

Open `http://127.0.0.1:5050` to manage teachers, students, class schedule, attendance, and remaining class balances.

## Live Deployment

For live use, deploy both parts:

1. Shopify theme goes to Shopify:

```powershell
shopify theme push --store 1vgisa-0n.myshopify.com
```

2. Backend goes to Render using `render.yaml`.

The current Render config uses the free plan for demo deployment. Free deploys can lose local JSON data after restart/redeploy. For real production, upgrade to a paid service with a persistent disk or move the backend to a real database.

After backend deploy, connect Shopify webhook:

```text
https://your-render-service.onrender.com/webhooks/shopify/orders-create
```

Local commands are only needed for testing. In live mode, Shopify and Render keep the project running.
