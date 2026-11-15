# SJohn & Co. Retail — Full-stack dropshipping store

A mobile-responsive React + Tailwind storefront with Supabase PostgreSQL, Storage, and Auth. Theme: matte black, charcoal, and yellow.

## Included features

- Public product catalog with product photos, PHP pricing, live stock values, and sold-out purchase blocking.
- Cart and checkout with required name, mobile number, cascading Region → Province → City/Municipality → Barangay selectors, and street/house number.
- GCash manual payment instructions to **09456331271**, required JPG/PNG proof upload, optional GCash reference number.
- Checkout calls a PostgreSQL RPC that reads prices from the database, locks product rows, validates stock, decrements inventory, and creates the order atomically. The browser cannot submit its own price/total.
- Private, unlisted admin route at `/sjohn-manage`; no public navbar/footer admin link. Supabase email/password authentication protects the dashboard.
- Admin product creation with direct JPG/JPEG upload, stock increment/decrement, product deletion, order/customer view, private proof preview using short-lived signed URLs, and status updates.
- Cancelling an order restores its reserved stock once.

## 1. Requirements

- Node.js 20+ and npm.
- A Supabase project.
- Supabase project URL and anon/publishable key. **Never put a service-role key in this frontend.**

## 2. Supabase database, RLS, and Storage setup

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this project, copy the complete file, paste it into the SQL Editor, and run it.
3. The script creates `products`, `orders`, and `admin_users`, the checkout RPC, timestamp/stock triggers, RLS policies, and the two Storage buckets/policies:
   - `product-images` — public read; only authorized admins can upload/update/delete. JPEG only, 5 MB maximum.
   - `payment-proofs` — private; customers can upload a proof during checkout, only authorized admins can read/delete. JPEG/PNG, 5 MB maximum.
4. **Important for an older database:** this project has previously encountered `products.image_url` missing from the schema cache and `orders.customer_address`, `payment_reference`, and `proof_path` NOT NULL errors. The supplied schema adds missing columns, but if your existing `orders` table has legacy rows, inspect/backfill any newly added customer/address/items/total/proof columns before adding NOT NULL constraints. The current schema intentionally uses the exact column names consumed by this application. If your old table has incompatible columns or an old `orders_status_check`, back up the data and migrate it to the statuses in this README rather than blindly dropping constraints. The script ends with `NOTIFY pgrst, 'reload schema';`.
5. Verify both buckets appear under **Storage** with the exact names above. Do not make `payment-proofs` public.

### Tables and important columns

`products`: `id`, `name`, `description`, `price`, `stock`, `image_url`, `is_active`, `created_at`, `updated_at`.

`orders`: `id`, `customer_full_name`, `customer_mobile`, `customer_address`, `region`, `province`, `city_municipality`, `barangay`, `street_address`, `items` (JSONB snapshot with product id/name/quantity/unit price/line total), `total_amount`, `payment_reference`, `proof_path`, `status`, `created_at`, `updated_at`.

`admin_users`: `user_id` references `auth.users(id)`. Membership in this table is the authorization check used by all admin RLS/storage policies.

### Create your administrator account

1. In Supabase → **Authentication → Users**, choose **Add user** and create your private admin email/password. Disable public signups in Authentication settings if you do not need customer accounts (customers do not sign in).
2. Copy the new user's UUID from the Users table.
3. Run this in SQL Editor, replacing the UUID:

```sql
insert into public.admin_users (user_id)
values ('PASTE-AUTH-USER-UUID-HERE')
on conflict (user_id) do nothing;
```

Only users whose UUID is explicitly inserted into `admin_users` can access the admin dashboard or private receipts. Do not expose this membership operation to the public client.

## 3. Environment configuration

1. Copy `.env.example` to `.env` in the project root.
2. Fill in your Supabase values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Find these in Supabase → **Project Settings → API**. Use the anon/publishable key only. The Supabase RLS policies and RPC are the security boundary; never put the service-role/secret key in `.env` or frontend code.

## 4. Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). To make a production build:

```bash
npm run build
npm run preview
```

Deploy the generated `dist/` folder to Vercel, Netlify, Cloudflare Pages, or another static host. Configure the same two `VITE_` environment variables in the hosting provider. Add SPA fallback/rewrite to `index.html` so direct navigation to `/sjohn-manage` works.

## 5. Admin access

- Open `https://YOUR-DOMAIN/sjohn-manage` directly.
- Sign in using the Supabase Auth user that you added to `public.admin_users`.
- The dashboard route is `/sjohn-manage/dashboard` and redirects to the login route if no valid session exists.
- No admin or login link is rendered anywhere in the public store. A route name is unlisted, not a substitute for authentication; access is enforced by Supabase Auth and RLS.

## 6. Order/payment flow

1. Customer adds in-stock items and completes delivery details.
2. Customer sends the displayed total to GCash **09456331271**.
3. Customer uploads a JPG/PNG payment screenshot and optionally enters the GCash reference number.
4. Proof is uploaded to the private `payment-proofs` bucket. The browser calls `place_customer_order`; the database independently calculates the amount, verifies current stock, reserves stock, and records the order as `Pending Payment Verification`.
5. Admin previews proof via a time-limited signed URL and changes status to one of: `Pending Payment Verification`, `Payment Verified / Processing`, `Shipped`, `Delivered`, `Cancelled`.
6. Moving an order to `Cancelled` restores the reserved quantities. A later status change does not restore stock a second time.

## 7. Philippine address dropdown data

The cascading address selectors retrieve the current PSGC dataset from `https://psgc.gitlab.io/api/` at runtime. Customers need an internet connection for the region/province/city/barangay lists. If the provider is unavailable, the page displays an error; the app does not silently substitute a non-cascading free-text address.

## 8. Operational/security notes

- The anon key is designed to be public. RLS is mandatory; do not disable it.
- Payment proofs are private. Admin image previews use signed URLs that expire after five minutes.
- The public upload policy on `payment-proofs` is necessary for guest checkout. Bucket MIME/size limits are applied, but a public upload endpoint can still be abused; monitor Storage usage and consider adding CAPTCHA/rate limiting or a server-side Edge Function for high-volume production.
- Stock is reserved at order creation. If payment is not verified, admin can cancel the order to return stock.
- Product delete removes the database row. To avoid deleting an image still referenced by an old order or another product, storage image cleanup is intentionally left manual.
- This project implements manual GCash verification; it does not automatically verify GCash transactions or process refunds.

## Project structure

```text
sjohn-retail/
├── index.html
├── package.json
├── .env.example
├── README.md
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── styles.css
│   ├── components/
│   │   ├── AddressFields.jsx
│   │   ├── Admin.jsx
│   │   └── Store.jsx
│   └── lib/
│       ├── format.js
│       └── supabase.js
└── supabase/
    └── schema.sql
```
