# Off Da Hook Salon Suites ✦ Official Website

An editorial, high-conversion luxury hair salon web experience created for **Off Da Hook Salon Suites** (Master Stylist **Shawnese Parker**), located inside **Phenix Salon Suites** at **25300 Rockaway Blvd, Rosedale / Woodmere, NY**.

Inspired by **[UG Create](https://ugcreate.framer.website/)** and **[Lisa Nicole NY](https://lisanicoleny.com/)**, blending a pristine pearl-white aesthetic with radiant electric pink and royal lavender accents matching the salon's signature flat-iron logo.

---

## 💎 Key Features & Visual Design

1. **Floating Pill Glass Navigation**:
   - Floating centered pill header with glassmorphism backdrop blur.
   - Quick contact link `(347) 238-1602` and radiant glowing `Book Appointment` CTA button.
   - Mobile-responsive slide-down drawer.

2. **Hero Staggered Video Marquee (Inspired by UG Create)**:
   - High-impact editorial typography: *Plus Jakarta Sans* paired with *Instrument Serif* italic accents in pink/purple gradient.
   - Social proof badges: Instagram `13K+`, Phenix Salon Suites live pulsing location dot.
   - **Continuous Autoplaying Silent Reels Marquee**: Dual staggered vertical columns of 9:16 hair transformation reels playing smoothly without sound.
   - Direct audio toggle buttons on each reel card.

3. **Stats & Trust Strip**:
   - Glowing dark card showcasing:
     - **13,000+** Instagram Community Members
     - **101+** 5-Star Verified Google Reviews
     - **12+ Years** Healthy Hair Artistry Mastery
     - **4.7 ★** Top Rated in Rosedale & Queens

4. **Featured Contents / Instagram Reels Showcase**:
   - Direct tribute to Framer UG Create's "Featured Contents" layout.
   - Interactive category filter pills (`All Styles`, `Silk Press & Bounce`, `Knotless & Protective`, `Color & Balayage`, `Suite Experience`).
   - Phone-styled vertical video cards with authentic engagement counters:
     - Likes counter (`5,243`)
     - Comments counter (`102`)
     - Shares counter (`364`)
     - Views counter (`10.6K`)
   - Tap any card to open the **Instagram-style Video Lightbox Modal** with unmuted sound and direct booking link!

5. **The Suite Experience (Bento Grid)**:
   - 100% Private Luxury Suite at Phenix Salon Suites in Rosedale.
   - Health-First Hair Care (custom steam hydration, bond builders, heat defense).
   - Feather-Light Bounce & mirror shine.
   - Warm hospitality celebrating LGBTQ+ inclusivity and peaceful one-on-one relaxation.

6. **Interactive Before & After Transformation Slider**:
   - Smooth mouse and touch drag slider comparing natural hair texture to silk press shine.

7. **Signature Services & Investment Menu**:
   - Detailed pricing cards for Silk Press ($95+), Knotless Braids ($180+), Balayage ($150+), Locs ($110+), Sew-Ins ($220+), and Men's Grooming ($55+).
   - Instant "Book This Service" buttons pre-filling the booking modal.

8. **101+ Verified Google Reviews**:
   - Authentic client testimonials with 5-star ratings and verified review tags.

9. **Interactive FAQ Accordion**:
   - Smooth accordion answers addressing suite location, appointment prep, and deposit policies.

10. **Interactive Booking Modal & Floating Action Corner**:
    - Complete appointment request form with date picker and service selector.
    - Direct contact links: Call `(347) 238-1602`, Instagram `@offdahookhairsalon`, Google Maps directions.

---

## 🎬 How Shawnese Can Swap In Her Own Instagram Reels & Photos

All video reels and images use standard, easy-to-replace assets in the `assets/` directory:

### 1. Swapping Video Reels
To replace any of the 6 reels with her own client video files:
1. Save her vertical (9:16) MP4 video into `assets/videos/`.
2. Name them `reel1.mp4`, `reel2.mp4`, `reel3.mp4`, `reel4.mp4`, etc.
3. Or open `index.html` and update the `src` attribute on any `<video src="assets/videos/your_reel.mp4">` tag!

### 2. Updating Titles & Engagement Numbers
In `index.html`, each reel card has clear attributes:
```html
<div class="reel-card-main" data-category="silkpress" data-title="Silk Press with Steam Hydration" data-sound="Off Da Hook • Original Audio" data-service="Silk Press &amp; Hydration Steam">
  <video src="assets/videos/reel_silkpress.mp4" poster="assets/daimage/reel_silkpress_poster.jpg" muted loop playsinline></video>
  ...
  <div class="reel-stat-bubble">
    <div class="stat-bubble-icon">♥</div>
    <span>5,243</span>
  </div>
</div>
```

---

## 🚀 How to Run Locally

You can launch the site with any simple local server:
```bash
cd /Users/macbookpro/Downloads/offdahook1
python3 -m http.server 8088
```
Then visit: `http://localhost:8088/` in your browser.
