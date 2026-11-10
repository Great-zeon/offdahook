# OFF DA HOOK — PRODUCTION READINESS COMPREHENSIVE TEST PLAN
**System Under Test:** Off Da Hook Salon Suites E-Commerce Platform (`offdahook.vercel.app`)  
**Document Version:** 1.0.0  
**Scope:** Storefront, Shopping Cart, Inventory Concurrency, Checkout Session, Payment Processing, Webhooks, Order Pipeline, Transactional Emails, Admin Management, Security & Failure Recovery  
**Quality Standard:** Zero tolerance for financial discrepancies, phantom orders, client-side price tampering, or unauthenticated privileged access.

---

## 1. TEST METHODOLOGY & RATING CRITERIA

Each test case is assigned a deterministic Test ID, preconditions, precise execution steps, expected outcomes, and an assigned severity rating.

### Severity Classification
* **CRITICAL (Launch Blocker):** Direct risk of financial loss, arbitrary price modification, inventory corruption, phantom orders, customer PII leak, or authentication bypass. Launch cannot proceed under any circumstance if unresolved.
* **HIGH:** Broken core user journey (e.g., cart not clearing after verified payment, silent webhook failure, invalid stock display).
* **MEDIUM:** Degraded administration experience (e.g., missing tracking links, filter sorting quirks, missing rate-limiting).
* **LOW:** Cosmetic, typography, or styling minor inconsistencies.

### Test Verdicts
* **PASS:** System satisfies all expected outcomes with verified evidence.
* **FAIL:** System diverges from expected behavior, introduces financial/data integrity risk, or fails assertions.
* **BLOCKED:** Test cannot be executed because a prerequisite upstream integration (e.g., Stripe live account, transactional email provider) is missing or unconfigured.

---

## 2. SUITE 1: STOREFRONT & CATALOG TESTING (STR)

### [STR-01] Real-time Product Catalog Retrieval
* **Feature:** Storefront Catalog Sync (`shop.html` & `index.html`)
* **Preconditions:** Supabase database active with 12 seeded formula items.
* **Test Steps:**
  1. Open browser to `https://offdahook.vercel.app/shop.html`.
  2. Inspect Network tab for `GET /api/products`.
  3. Verify response status is `200 OK` with JSON array containing 12 items.
  4. Compare rendered cards with database records for title, price, volume, and badge.
* **Expected Result:** Catalog dynamically populates from Supabase `products` table. All 12 items display correct titles, prices, and high-resolution images.
* **Severity:** CRITICAL

### [STR-02] Category Filtering & Tab Switching
* **Feature:** Catalog Category Tabs
* **Preconditions:** Storefront loaded with all products.
* **Test Steps:**
  1. Click category tab "Locs Care".
  2. Click category tab "Regrowth".
  3. Click category tab "Edges & Styling".
  4. Click category tab "Bundles".
  5. Click category tab "All Formulas".
* **Expected Result:** Products filter instantly with smooth CSS transitions without page reloads. Items match exact category tags.
* **Severity:** MEDIUM

### [STR-03] Live Search Filtering
* **Feature:** Real-time Search Input
* **Preconditions:** Storefront loaded.
* **Test Steps:**
  1. Type "Regrowth" into catalog search input.
  2. Type "Jam" into search input.
  3. Type nonexistent query "xyz123".
* **Expected Result:** Cards filter in real-time matching title and description. "xyz123" displays graceful "No matching formulas found" empty state.
* **Severity:** MEDIUM

### [STR-04] Stock Indicator & "Out of Stock" Badge
* **Feature:** Inventory Availability Badging
* **Preconditions:** At least one product set to `stock = 0` in database; another set to `stock = 2`.
* **Test Steps:**
  1. Refresh storefront catalog.
  2. Locate product with `stock = 0`.
  3. Locate product with `stock = 2`.
* **Expected Result:** Zero-stock product displays "Sold Out" badge; "Add to Crown Bag" button is disabled. Low-stock item displays "Only 2 left in stock" urgency pill.
* **Severity:** HIGH

---

## 3. SUITE 2: SHOPPING CART TESTING (CRT)

### [CRT-01] Add Single & Multiple Items to Crown Bag
* **Feature:** Cart Item Addition
* **Preconditions:** User on `shop.html` with empty cart.
* **Test Steps:**
  1. Click "Add to Crown Bag" on "Xxxtra Strength Regrowth Serum" ($25.00).
  2. Verify slide-over drawer opens automatically.
  3. Click "Add to Crown Bag" on "Loc Buffet Bundle Package" ($99.99).
* **Expected Result:** Slide-over drawer contains 2 distinct items. Drawer header displays "Your Crown Bag (2)". Subtotal calculates accurately to `$124.99`.
* **Severity:** HIGH

### [CRT-02] Cart Quantity Steppers & Stock Upper-Bound Enforcement
* **Feature:** Quantity Increment / Decrement
* **Preconditions:** Product has `stock = 3` in inventory. Item added to cart.
* **Test Steps:**
  1. Open cart drawer.
  2. Click `+` stepper until quantity reaches 3.
  3. Attempt to click `+` stepper once more to reach 4.
  4. Click `-` stepper to reduce quantity to 1.
* **Expected Result:** Stepper allows increment up to available stock (3). Clicking `+` at max stock prevents increase and alerts customer with stock limit notice. Subtotal updates dynamically.
* **Severity:** HIGH

### [CRT-03] Item Removal & Empty Cart State
* **Feature:** Cart Item Removal
* **Preconditions:** Cart contains 1 item.
* **Test Steps:**
  1. Click trash / remove icon on the cart item.
  2. Observe cart drawer content and subtotal.
* **Expected Result:** Item removed with smooth transition. Cart drawer transitions to empty state: "Your crown bag is empty. Explore our signature formulas." Checkout button disabled.
* **Severity:** MEDIUM

### [CRT-04] Cart Persistence Across Page Navigation & Reloads
* **Feature:** `localStorage` Cart Synchronization
* **Preconditions:** Cart contains 2 items totaling `$50.00`.
* **Test Steps:**
  1. Navigate from `shop.html` to `index.html`.
  2. Verify navbar cart badge displays "2".
  3. Refresh the browser (`Cmd+R` / `F5`).
  4. Click cart icon to open drawer.
* **Expected Result:** All items, selected quantities, and subtotal remain intact across navigations and hard refreshes.
* **Severity:** HIGH

---

## 4. SUITE 3: INVENTORY INTEGRITY TESTING (INV)

### [INV-01] Real-time Stock Verification Against Database
* **Feature:** Pre-checkout Server-Side Stock Validation
* **Preconditions:** Product "Xxxtra Strength Regrowth Serum" has `stock = 1` in Supabase.
* **Test Steps:**
  1. User A adds 1 unit to cart.
  2. In database, administrator updates stock to `0`.
  3. User A clicks "Proceed to Secure Checkout".
* **Expected Result:** Checkout API rejects request with HTTP 400: `Sorry! "Xxxtra Strength Regrowth Serum" has just sold out.` User is not redirected to Stripe.
* **Severity:** CRITICAL

### [INV-02] Atomic Stock Deduction on Successful Payment
* **Feature:** Database Atomic Stock Decrement (`deduct_product_stock_atomic`)
* **Preconditions:** Product has `stock = 10`.
* **Test Steps:**
  1. Customer completes verified purchase of 2 units.
  2. Stripe webhook `checkout.session.completed` fires.
  3. Query Supabase `products` table for remaining stock.
* **Expected Result:** Stock decrements atomically to exactly `8`. Database timestamp `updated_at` refreshed.
* **Severity:** CRITICAL

### [INV-03] Concurrent Purchases on Final Inventory Unit (Race Condition Test)
* **Feature:** Concurrency & Race Condition Protection
* **Preconditions:** Product "Fully Loaded Regrowth System" has exactly `stock = 1`.
* **Test Steps:**
  1. Simulate two concurrent checkout completion webhooks arriving within 50ms of each other for the same product ID.
* **Expected Result:** First transaction succeeds and decrements stock to `0`. Second transaction fails atomic deduction constraint (`WHERE stock >= quantity`), records an inventory conflict alert, and prevents negative stock (`stock < 0`).
* **Severity:** CRITICAL

### [INV-04] Stock Recovery on Failed or Cancelled Payment
* **Feature:** Non-deduction on Abandoned / Cancelled Checkout
* **Preconditions:** Product has `stock = 5`.
* **Test Steps:**
  1. Customer initiates checkout session and reaches Stripe Hosted Checkout.
  2. Customer clicks "Cancel and return to Off Da Hook Salon".
  3. User lands on `shop.html?order=cancelled`.
  4. Query database stock.
* **Expected Result:** Stock remains unchanged at `5`. No inventory deduction occurs.
* **Severity:** CRITICAL

---

## 5. SUITE 4: CHECKOUT TESTING (CHK)

### [CHK-01] Server-Side Price Enforcement (Tampering Defense)
* **Feature:** Anti-Tampering Pricing Architecture
* **Preconditions:** An attacker intercepts or uses `curl` to call `POST /api/checkout` with modified payload: `[{ "id": "fully-loaded-regrowth-system", "price": "0.01", "quantity": 1 }]`.
* **Test Steps:**
  1. Execute `POST /api/checkout` with tampered `price: "0.01"`.
  2. Inspect Stripe checkout session generated.
* **Expected Result:** Server rejects client price and looks up authoritative price from database ($100.00). Stripe checkout session charges exactly `$100.00`, NEVER `$0.01`.
* **Severity:** CRITICAL (FINANCIAL EXPLOIT)

### [CHK-02] Mandatory Customer & Shipping Details Collection
* **Feature:** Stripe Address & Phone Collection
* **Preconditions:** Normal checkout initiated.
* **Test Steps:**
  1. Initiate checkout and redirect to Stripe Checkout.
  2. Inspect required fields on Stripe payment page.
* **Expected Result:** Stripe enforces required billing address, required US shipping address, required customer email, and required phone number for courier delivery.
* **Severity:** HIGH

### [CHK-03] Empty or Invalid Cart Rejection
* **Feature:** Checkout Payload Validation
* **Preconditions:** Backend serverless function running.
* **Test Steps:**
  1. Send `POST /api/checkout` with `{ "items": [] }`.
  2. Send `POST /api/checkout` with malformed JSON.
* **Expected Result:** Server immediately responds with HTTP 400 Bad Request `{ "success": false, "error": "Cart is empty" }`. No session created.
* **Severity:** HIGH

---

## 6. SUITE 5: PAYMENT INTEGRATION TESTING (PAY)

### [PAY-01] Successful Stripe Payment Flow (Test Cards)
* **Feature:** Stripe Checkout Session Completion
* **Preconditions:** Stripe Test Mode credentials configured.
* **Test Steps:**
  1. Add $25 product to cart, proceed to checkout.
  2. Enter Stripe Test Card `4242 4242 4242 4242`, exp `12/28`, CVC `123`.
  3. Submit payment.
  4. Observe redirection to return URL.
* **Expected Result:** Payment completes successfully on Stripe. User redirected to `https://offdahook.vercel.app/shop.html?order=success&session_id={CHECKOUT_SESSION_ID}`.
* **Severity:** CRITICAL

### [PAY-02] Frontend Return URL & Payment Verification
* **Feature:** Return URL Processing & Cart Clearing
* **Preconditions:** User redirected back to `shop.html?order=success&session_id=cs_test_...`.
* **Test Steps:**
  1. Observe storefront response on page load.
  2. Inspect `localStorage` cart.
  3. Verify API verification call to `/api/verify-session`.
* **Expected Result:** Storefront verifies session with backend, displays luxury "Crown Order Confirmed" modal with verified Order ID, items purchased, and delivery address. `localStorage` cart is wiped clean.
* **Severity:** CRITICAL

### [PAY-03] Declined Card Handling
* **Feature:** Payment Decline Behavior
* **Preconditions:** Checkout initiated on Stripe.
* **Test Steps:**
  1. Enter test card `4000 0000 0000 0002` (Card Declined).
  2. Click Pay.
* **Expected Result:** Stripe displays explicit decline notice: "Your card was declined." Customer remains on Stripe page to enter alternative card. No order created in database.
* **Severity:** CRITICAL

### [PAY-04] Webhook Signature Verification
* **Feature:** Webhook Cryptographic Security (`Stripe-Signature`)
* **Preconditions:** Webhook endpoint `/api/webhook` active.
* **Test Steps:**
  1. Send fake POST request to `/api/webhook` with unverified body and bogus `Stripe-Signature` header.
  2. Send POST request with missing signature header.
* **Expected Result:** Endpoint rejects request with HTTP 400 `Webhook Error: Signature verification failed`. No database changes made.
* **Severity:** CRITICAL (SECURITY EXPLOIT)

### [PAY-05] Webhook Idempotency (Duplicate Event Protection)
* **Feature:** Webhook Replay & Duplicate Event Defense
* **Preconditions:** Product has `stock = 10`. Order already recorded for `session_id = cs_test_999`.
* **Test Steps:**
  1. Deliver exact duplicate Stripe webhook event `checkout.session.completed` for `session_id = cs_test_999`.
* **Expected Result:** Webhook identifies existing `stripe_session_id` in database, returns HTTP 200 `{ "received": true, "message": "Event already processed" }`, and **DOES NOT** deduct stock a second time.
* **Severity:** CRITICAL (FINANCIAL & INVENTORY INTEGRITY)

### [PAY-06] Elimination of Fake Demo Payment Fallback
* **Feature:** Prohibition of Unverified Order Confirmation
* **Preconditions:** Stripe API keys missing or gateway unreachable.
* **Test Steps:**
  1. Trigger checkout when Stripe service is unavailable.
* **Expected Result:** System displays clear, professional error message: "Payment service is currently unavailable. Please call the salon at (347) 238-1602." System **NEVER** displays a fake "Order Confirmed" screen and **NEVER** logs a fake order marked "Paid".
* **Severity:** CRITICAL (BUSINESS INTEGRITY)

---

## 7. SUITE 6: ORDER PROCESSING & FULFILLMENT (ORD)

### [ORD-01] Order Record Creation in Database
* **Feature:** Order Persistence Pipeline
* **Preconditions:** Webhook receives verified `checkout.session.completed`.
* **Test Steps:**
  1. Query `orders` table in Supabase.
* **Expected Result:** New order record exists with non-colliding ID (e.g., `ODH-20261110-XXXX`), valid `stripe_session_id`, customer email, full shipping address JSON, line items array, exact total amount, `payment_status = 'Paid'`, and `fulfillment_status = 'Pending'`.
* **Severity:** CRITICAL

### [ORD-02] Order Fulfillment Status Lifecycle & Tracking Number
* **Feature:** Order Management Transitions
* **Preconditions:** Order in `Pending` state in Supabase.
* **Test Steps:**
  1. Admin opens order in dashboard.
  2. Admin enters shipping courier (e.g., USPS, UPS, FedEx) and tracking number `9400100000000000000000`.
  3. Admin updates status to `Shipped`.
* **Expected Result:** Order updates in Supabase with `fulfillment_status = 'Shipped'`, `carrier = 'USPS'`, and `tracking_number = '9400...'`.
* **Severity:** HIGH

---

## 8. SUITE 7: EMAIL NOTIFICATION TESTING (EML)

### [EML-01] Customer Branded Order Confirmation Receipt
* **Feature:** Customer Transactional Email
* **Preconditions:** Resend API key configured; order completed.
* **Test Steps:**
  1. Process verified payment for customer `test@example.com`.
  2. Inspect email dispatched via Resend.
* **Expected Result:** Email arrives with Off Da Hook luxury branding, itemized formula list, order number, shipping address, and support contact details.
* **Severity:** HIGH (BLOCKED PENDING API KEY)

### [EML-02] Merchant New Order Alert
* **Feature:** Merchant Notification Dispatch
* **Preconditions:** Customer completes purchase.
* **Test Steps:**
  1. Inspect notification inbox for Shawnese Parker (`offdahooksalon@gmail.com`).
* **Expected Result:** Merchant receives immediate notification: "New Crown Order Received: ODH-XXXX ($124.99) - 2 items to fulfill".
* **Severity:** HIGH (BLOCKED PENDING API KEY)

---

## 9. SUITE 8: ADMIN DASHBOARD TESTING (ADM)

### [ADM-01] Admin Authentication Gate
* **Feature:** Protected Dashboard Access (`admin.html`)
* **Preconditions:** Unauthenticated browser session.
* **Test Steps:**
  1. Navigate to `https://offdahook.vercel.app/admin.html`.
  2. Verify dashboard content is completely hidden behind login modal.
  3. Attempt invalid PIN `0000`.
  4. Submit valid admin credentials.
* **Expected Result:** Invalid PIN displays error message. Valid login unlocks dashboard view.
* **Severity:** CRITICAL

### [ADM-02] Elimination of Fabricated Seed Orders
* **Feature:** Truthful Business Metrics
* **Preconditions:** Database has 0 orders.
* **Test Steps:**
  1. Open Admin Dashboard.
  2. Check Orders tab and metrics counters.
* **Expected Result:** Dashboard shows 0 orders, $0.00 revenue, with clear message "No customer orders placed yet." **NEVER** injects fake orders for Maya Jenkins or Danielle Brooks into `localStorage`.
* **Severity:** CRITICAL

### [ADM-03] Inventory Stock Management (Edit, Update, Save)
* **Feature:** Real-time Stock Modification
* **Preconditions:** Admin authenticated.
* **Test Steps:**
  1. Navigate to Inventory tab.
  2. Change stock of "Xxxtra Strength Regrowth Serum" from 24 to 30.
  3. Click Save.
  4. Check Supabase database and storefront.
* **Expected Result:** Supabase `products` table updates immediately to 30. Storefront reflects updated stock upon refresh.
* **Severity:** HIGH

---

## 10. SUITE 9: SECURITY & ACCESS CONTROL TESTING (SEC)

### [SEC-01] Supabase Row Level Security (RLS) Enforcement
* **Feature:** Customer PII & Database Protection
* **Preconditions:** Anon key exposed in frontend network requests.
* **Test Steps:**
  1. Attempt to execute `supabase.from('orders').select('*')` using the public anon key.
  2. Attempt to execute `supabase.from('products').update({ price: 1 })` using the public anon key.
* **Expected Result:** Both requests are denied with PostgreSQL RLS violation error. Customer orders cannot be read by public; products cannot be altered without `service_role`.
* **Severity:** CRITICAL

### [SEC-02] Admin API Route Protection
* **Feature:** Serverless API Authorization (`/api/orders`, `/api/products` writes)
* **Preconditions:** Unauthenticated attacker.
* **Test Steps:**
  1. Send `GET /api/orders` without credentials.
  2. Send `PUT /api/orders` without credentials.
  3. Send `PUT /api/products` without credentials.
* **Expected Result:** All requests return HTTP 401 Unauthorized. No customer data or catalog modifications permitted.
* **Severity:** CRITICAL

### [SEC-03] Secret Credential Leakage Audit
* **Feature:** Frontend Asset & Repository Audit
* **Preconditions:** Production build inspected.
* **Test Steps:**
  1. Search all `.html` and `.js` files in git repository for `sk_live_`, `sk_test_`, `service_role`, or admin PINs.
* **Expected Result:** Zero private API keys or service role secrets exist in frontend files.
* **Severity:** CRITICAL

---

## 11. SUITE 10: MOBILE & CROSS-BROWSER USABILITY (MOB)

### [MOB-01] Mobile Slide-Over Cart Usability
* **Feature:** Mobile Viewport Cart Experience (375px - 430px)
* **Preconditions:** Device emulator or mobile browser.
* **Test Steps:**
  1. Add items to cart on mobile screen.
  2. Open cart drawer.
  3. Adjust quantities and click checkout.
* **Expected Result:** Cart drawer fills screen comfortably without horizontal scroll. Stepper touch targets are at least 44x44px. Checkout button remains sticky and accessible.
* **Severity:** HIGH

---

## 12. SUITE 11: FAILURE RECOVERY & PRODUCTION EDGE CASES (REC)

### [REC-01] Supabase Database Unavailability Graceful Degradation
* **Feature:** Database Outage Handling
* **Preconditions:** Supabase credentials intentionally invalidated or network blocked.
* **Test Steps:**
  1. Attempt to load products on storefront.
  2. Attempt to checkout.
* **Expected Result:** System displays informative maintenance notice: "Our formula apothecary is currently undergoing routine maintenance. Please call (347) 238-1602." System does not crash with unhandled exceptions.
* **Severity:** HIGH

### [REC-02] Webhook Server Failure Recovery & Stripe Retries
* **Feature:** Webhook Resilience
* **Preconditions:** Endpoint returns HTTP 500 once during network blip.
* **Test Steps:**
  1. Stripe resends webhook event according to exponential backoff.
  2. Webhook recovers and handles event.
* **Expected Result:** Order is saved successfully upon retry without duplication or stock loss.
* **Severity:** HIGH

