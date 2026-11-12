# Off Da Hook Salon Suites — Business Owner Onboarding Checklist
**Prepared For:** Shawnese Parker (Business Owner) & Lead Developer  
**Code Baseline:** `ae6b58f418e4f2db66cf797bc8603e9b5358070c`  
**Production Storefront Target:** `https://offdahook.vercel.app/` (Canonical domain refs: `offdahookhairsalon.com`)  

---

## Section A: Business Information
| Item | What Is Needed | Why It Is Needed | Who Provides It | Priority | Mandatory? | Done By |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **A-01** | Legal business name & registration entity type (Sole Proprietor / LLC / Corp) | Required by Stripe for merchant underwriting and tax compliance | Owner (Shawnese) | High | **Mandatory** | Owner |
| **A-02** | Country of legal business registration (confirm US vs. non-US registration) | Determines Stripe eligibility & payout rails (do **not** assume US solely from salon suite address) | Owner (Shawnese) | High | **Mandatory** | Owner |
| **A-03** | Registered business street address, phone, website URL, and Tax ID (EIN / SSN / TIN) | Identity verification & 1099-K/tax reporting | Owner (Shawnese) | High | **Mandatory** | Owner |
| **A-04** | Final canonical storefront domain choice (`offdahookhairsalon.com` vs. `offdahook.vercel.app`) | Configures Stripe redirect allowlist (`STOREFRONT_URL`) and branded sender domain | Owner (Shawnese) | High | **Mandatory** | Owner + Developer |

---

## Section B: Stripe Account & Payouts
| Item | What Is Needed | Why It Is Needed | Who Provides It | Priority | Mandatory? | Done By |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **B-01** | Business-owned Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com/) | Merchant must legally own account, funds, and chargebacks—never developer | Owner (Shawnese) | High | **Mandatory** | Owner |
| **B-02** | Legal representative identity verification (Government ID, DOB, residential details, beneficial owners if applicable) | Required by Stripe KYC rules before activating live charges | Owner (Shawnese) | High | **Mandatory** | Owner |
| **B-03** | Business checking account & routing details for payouts | Where customer card proceeds are deposited | Owner (Shawnese) | High | **Mandatory** | Owner |
| **B-04** | Card payment activation + Test-mode API keys (`sk_test_...`) & Live-mode keys (`sk_live_...`) | Backend requires `STRIPE_SECRET_KEY` (no publishable `pk_` key is used by code) | Owner grants Developer dashboard invite / enters directly in Vercel | High | **Mandatory** | Owner + Developer |
| **B-05** | Test & Live Webhook endpoints registered (`/api/webhook`) | Generates `STRIPE_WEBHOOK_SECRET` (`whsec_...`) so paid orders record & deduct stock | Developer (with Stripe access) | High | **Mandatory** | Developer |

---

## Section C: Business Email & Contact Information
| Item | What Is Needed | Why It Is Needed | Who Provides It | Priority | Mandatory? | Done By |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **C-01** | Confirm single official salon mailbox (`offdahookhairsalon@gmail.com` or custom domain) | Guessed fallback `offdahooksalon@gmail.com` has been removed; backend strictly requires explicit configuration | Owner (Shawnese) | High | **Mandatory** | Owner |
| **C-02** | Target email address for new-order & backorder alerts (`MERCHANT_ALERT_EMAIL`) | Where automated order notifications arrive (`contact.html` & `careers.html` can also override via `CONTACT_ALERT_EMAIL` / `CAREER_ALERT_EMAIL`) | Owner (Shawnese) | High | **Mandatory** | Owner |
| **C-03** | Customer support & contact-inquiry email address | Displayed to customers & used for contact/suite inquiries (`CONTACT_ALERT_EMAIL`) | Owner (Shawnese) | High | **Mandatory** | Owner |
| **C-04** | Preferred transactional sender address (`RESEND_FROM_EMAIL`, default `orders@offdahookhairsalon.com`) | Customers see this as the sender on receipts; domain must match Resend verified domain | Owner (Shawnese) | Medium | **Mandatory** | Owner + Developer |
| **C-05** | Separate Resend account & API credentials (`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`) | Sends automated order receipts, contact/career inquiries & tracks real delivery/bounces | Owner or Developer | High | **Mandatory** | Owner + Developer |
| **C-06** | Career application CV handling preference | `#contact-page-form`, `#suite-contact-form`, and `#career-application-form` dispatch via `/api/contact` using Resend; applicants share portfolio/resume URLs (direct file uploads not enabled) | Owner (Shawnese) | Low | **Optional** (if URL links suffice) | Owner confirms |

---

## Section D: Domain & DNS Access
| Item | What Is Needed | Why It Is Needed | Who Provides It | Priority | Mandatory? | Done By |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **D-01** | Ownership confirmation for `offdahookhairsalon.com` (or chosen custom domain) | Required to verify custom sender domain in Resend (`orders@...`) | Owner (Shawnese) | High | **Mandatory** (for custom-domain email) | Owner |
| **D-02** | Delegated DNS access (GoDaddy/registrar delegate invite—**never** email password) | Needed to add Resend SPF, DKIM, and optional DMARC TXT/CNAME records safely without breaking existing mail | Owner (Shawnese) | High | **Mandatory** | Owner delegates / Developer adds |

---

## Section E: Approval & Verification
| Item | What Is Needed | Why It Is Needed | Who Provides It | Priority | Mandatory? | Done By |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **E-01** | Isolated Staging Supabase project (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) | Runs DDL verification safely before touching production | Developer | High | **Mandatory** | Developer |
| **E-02** | Authorization to run Stripe Test-Mode checkout (`4242...`) & Resend staging emails | Closes the 5 staging release gates cleanly | Owner + Developer | High | **Mandatory** | Owner + Developer |
| **E-03** | Final go-live sign-off after staging passes | Switches Vercel Production to live Stripe/Resend keys & applies schema backup + migration | Owner (Shawnese) | High | **Mandatory** | Owner |
