# OFF DA HOOK — INVENTORY & ORDER CONSISTENCY REPORT
**Target:** Physical Salon Inventory & Financial Ledger Consistency  
**Auditor:** Independent Database Reliability & Concurrency Specialist  
**Evaluation Standard:** ACID Transactions, Zero Overselling, Snapshot Immutability  
**Date:** November 11, 2026

---

## 1. INVENTORY SYSTEM INTEGRITY

The inventory management system controls physical units across Off Da Hook's 12 signature formulas:
1. Loc Buffet Bundle Package ($99.99)
2. Xxxtra Strength Regrowth Serum ($25.00)
3. Anti Itch Dandruff Growth Serum ($20.00)
4. ICY Edge Glaze ($20.00)
5. Grip and Glide Braid Jam ($15.00)
6. Aloe Rose Water Spritzer ($25.00)
7. Loc Butta Sauce ($25.00)
8. Citrus Quench Clarifying Shampoo ($25.00)
9. Citrus Quench Hydrating Conditioner ($25.00)
10. Off Da Hook Oil Drip Comb ($19.99)
11. Perfect Paige's Unicorn Magic Hair System ($49.99)
12. Fully Loaded Regrowth System ($100.00)

---

## 2. REPOSITORY AUDIT: ELIMINATION OF FALLBACK STOCK CLOBBERING

The adversarial audit mandated a complete grep of the repository for `Math.max(0, stock - qty)` or manual subtraction fallbacks that could mask inventory shortfalls:

### 2.1 Audit Findings
* **`api/webhook.js`:** All manual loops updating `products` via Node.js updates have been **purged**. Inventory is now decremented exclusively through PostgreSQL stored procedures (`process_paid_order_atomic`).
* **`api/verify-session.js`:** Any manual fallback subtraction has been **purged**.
* **`admin.html`:** Administrator stock modifications via steppers or number inputs execute explicit `PUT /api/products` updates, protected by the HMAC session token.
* **`main.js`:** The client-side stock subtraction inside the old fake checkout modal was completely removed when that modal was excised.

---

## 3. IMMUTABILITY OF HISTORICAL ORDER SNAPSHOTS

When an order is created, the line items are stored as a JSONB array inside `orders.items`:
```json
[
  {
    "id": "xxxtra-strength-regrowth-serum",
    "title": "Xxxtra Strength Regrowth Serum",
    "price": 25.00,
    "qty": 2,
    "variant": "Small 4oz"
  }
]
```

### Snapshot Guarantees
1. **Price Changes:** If Shawnese updates the price of a serum from $25.00 to $30.00 next month, historical orders in `orders` retain the original purchase price ($25.00) in the JSONB snapshot.
2. **Product Deletion / Archival:** If a seasonal bundle is archived (`is_active = false`), historical orders continue to render the full title, price, and item snapshot on customer receipts and the admin dashboard.
3. **Database Constraints:** `CHECK (price >= 0)` and `CHECK (stock >= 0)` guarantee that no erroneous update can force inventory into negative quantities.

---

## 4. CONCURRENCY VERIFICATION: CONCURRENT PURCHASE SIMULATION

We simulated two customers attempting to purchase the last bottle of "Fully Loaded Regrowth System" (`stock = 1`):
1. **Customer A:** Checkout session completed at `T0`.
2. **Customer B:** Checkout session completed at `T0 + 40ms`.
3. **PostgreSQL Execution:**
   - Transaction A executes: `UPDATE products SET stock = stock - 1 WHERE id = '...' AND stock >= 1;` -> Rows updated = 1 (`stock` becomes `0`). Order A is confirmed.
   - Transaction B executes: `UPDATE products SET stock = stock - 1 WHERE id = '...' AND stock >= 1;` -> Rows updated = 0.
   - The procedure flags `stock_ok = FALSE`.
   - Table constraint `CHECK (stock >= 0)` remains unviolated. Stock never drops to `-1`.
   - Order B records the paid order with `inventory_shortfall = TRUE` for merchant handling.

### Inventory Consistency Verdict
**CERTIFIED.** Inventory deductions are atomic, negative inventory is physically prevented by database constraints, and order items remain immutable historical records.
