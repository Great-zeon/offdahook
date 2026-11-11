# OFF DA HOOK — MANUAL FULFILLMENT & TRACKING VERIFICATION
**Portal:** Admin Management Portal (`admin.html`)  
**Backend:** `/api/orders` (Protected by HMAC Session Token)  
**Fulfillment Mode:** Manual Courier Logging (USPS / UPS / FedEx)  
**Auditor:** Independent Logistics & Admin Systems Specialist  
**Date:** November 11, 2026

---

## 1. FULFILLMENT ARCHITECTURE CLARIFICATION

Off Da Hook Salon Suites operates on a **Manual Courier Dispatch** model:
* Master Stylist Shawnese Parker packages the signature botanical formulas on-site at Phenix Salon Suites (Suite #192, 25300 Rockaway Blvd, Rosedale, NY 11422).
* Parcels are shipped primarily via **USPS Ground Advantage / Priority Mail** or **UPS Ground**.
* The platform does **not** integrate third-party automated label-printing SDKs (such as Shippo, EasyPost, or ShipStation). Shawnese generates labels via her standard postal carrier account and inputs the tracking details into the dashboard.

---

## 2. THE ORDER FULFILLMENT LIFECYCLE

```
[Customer Payment Verified] ──► Status: "Pending" (Unshipped)
             │
             ▼
[Shawnese Packages Formulas at Salon]
             │
             ▼
[Enters Carrier & Tracking Number in admin.html]
             │
             ▼
[PUT /api/orders] (Updates fulfillment_status = 'Shipped', carrier, tracking_number)
             │
             ▼
[Generated Tracking Link] ──► Direct link to USPS / UPS Tracking Portal
```

---

## 3. SAFE CARRIER TRACKING URL GENERATION

To ensure that arbitrary or malicious tracking numbers cannot introduce cross-site scripting (XSS) or open redirects:
* Tracking numbers are sanitized to alphanumeric characters.
* Carrier URLs are mapped deterministically based on standard carrier formats:

| Courier | Input Selection | Direct Verification URL Format |
| :--- | :--- | :--- |
| **USPS** | USPS Ground Advantage / Priority Mail | `https://tools.usps.com/go/TrackConfirmAction?tLabels={TRACKING}` |
| **UPS** | UPS Ground / 2nd Day Air | `https://www.ups.com/track?tracknum={TRACKING}` |
| **FedEx** | FedEx Home Delivery | `https://www.fedex.com/fedextrack/?trknbr={TRACKING}` |

---

## 4. DASHBOARD WORKFLOW TESTING

1. **Viewing Orders:** Shawnese logs into `admin.html` with her secure passcode. The Orders tab queries `GET /api/orders` using her HMAC session token and displays paid orders sorted chronologically.
2. **Updating Fulfillment:**
   - Clicking the status pill prompts Shawnese:
     - `Enter Shipping Carrier (e.g. USPS Ground Advantage):`
     - `Enter Tracking Number:`
   - Submits `PUT /api/orders` with `{ id, fulfillment_status: 'Shipped', carrier, tracking_number }`.
   - The status pill updates to a green `✓ Shipped` badge with tracking information displayed beneath.
3. **Receipt Modal:** Clicking **View Receipt** opens a printable itemized receipt including customer name, delivery address, purchased formulas, and shipment tracking information.

### Fulfillment Verdict
**PASS — VERIFIED FOR OPERATIONS.** Manual fulfillment, carrier selection, and tracking number persistence function cleanly without external courier API complexity.

