# Off Da Hook Salon Suites — Admin Portal & Fulfillment QA
**Date**: November 11, 2026  
**Auditor**: Lead Operations & Systems Architect  
**Scope**: Admin Dashboard (`admin.html`), Orders API (`api/orders.js`), Fulfillment & Tracking  
**Status**: AUDITED & CERTIFIED  

---

## 1. Administrative Portal Capabilities (`admin.html`)

1. **Authentication Flow**:
   - Accessing `admin.html` presents a modal passcode prompt.
   - Master passcode is verified via `POST /api/auth`.
   - On success, the client receives an HMAC-SHA256 session token stored in `sessionStorage` and sent as `Authorization: Bearer <TOKEN>`.
   - Logout clears `sessionStorage` and returns the user to the login screen.
2. **Order Management & Audit**:
   - Fetches live orders from Supabase via `GET /api/orders`.
   - Displays Order ID, date, customer name, email, phone, items ordered, total paid, payment status, and fulfillment status.
   - Highlights orders requiring merchant attention (e.g. `Backordered_Action_Required`).
3. **Fulfillment Workflow**:
   - Status transitions supported: `Pending` -> `Processing` -> `Shipped` -> `Delivered`.
   - Carrier assignment: Dropdown for `USPS`, `UPS`, `FedEx`, `DHL`.
   - Tracking number entry: Saves tracking number and generates clickable tracking links:
     - USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=<NUMBER>`
     - UPS: `https://www.ups.com/track?tracknum=<NUMBER>`
4. **Receipt Resend Action**:
   - Dedicated "Resend Receipt" button sends `PUT /api/orders` with `action: 'resend_receipt'`.
   - Dispatches branded HTML receipt via Resend and updates `email_status`, `email_sent_at`, and `email_attempts`.
   - Does NOT touch inventory or order totals.
