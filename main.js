/**
 * OFF DA HOOK SALON SUITES - HIGH PERFORMANCE INTERACTION ENGINE
 * Luxury Hair Artistry by Master Stylist Shawnese Parker
 */

// Register Service Worker for Instant Static File Caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // 0. Brand Preloader - Ultra-fast, zero-jank dismissal
  const preloader = document.getElementById('sitePreloader');
  if (preloader) {
    const dismissPreloader = () => {
      preloader.classList.add('preloader-hidden');
      setTimeout(() => {
        preloader.style.display = 'none';
      }, 250);
    };

    if (document.readyState === 'complete') {
      dismissPreloader();
    } else {
      window.addEventListener('load', dismissPreloader, { once: true });
      setTimeout(dismissPreloader, 600); // Fast safety fallback
    }
  }

  // 1. Floating Pill Navigation Scroll Effect
  const navWrapper = document.querySelector('.nav-wrapper');
  const scrollTopBtn = document.querySelector('.scroll-top-btn');

  window.addEventListener('scroll', () => {
    const scrollPos = window.scrollY;
    if (scrollPos > 60) {
      navWrapper?.classList.add('nav-scrolled');
    } else {
      navWrapper?.classList.remove('nav-scrolled');
    }

    if (scrollTopBtn) {
      if (scrollPos > 400) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    }
  }, { passive: true });

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 2. Mobile Nav Drawer Toggle
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mobileNavDrawer = document.querySelector('.mobile-nav-drawer');
  const mobileAccordionBtn = document.querySelector('.mobile-accordion-btn');
  const mobileAccordionWrapper = document.querySelector('.mobile-accordion-wrapper');

  if (mobileMenuBtn && mobileNavDrawer) {
    mobileMenuBtn.addEventListener('click', () => {
      const isOpen = mobileNavDrawer.classList.toggle('active');
      mobileMenuBtn.innerHTML = isOpen 
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
    });

    if (mobileAccordionBtn && mobileAccordionWrapper) {
      mobileAccordionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mobileAccordionWrapper.classList.toggle('open');
      });
    }

    document.querySelectorAll('.mobile-nav-link:not(.mobile-accordion-btn), .mobile-sub-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileNavDrawer.classList.remove('active');
        mobileMenuBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
      });
    });
  }

  // 2b. Desktop Navigation Dropdown Hover Bridge & Grace Buffer
  const desktopDropdowns = document.querySelectorAll('.nav-dropdown');
  desktopDropdowns.forEach(dd => {
    let leaveTimer = null;
    const toggle = dd.querySelector('.nav-dropdown-toggle');
    const menu = dd.querySelector('.nav-dropdown-menu');

    const openDropdown = () => {
      clearTimeout(leaveTimer);
      dd.classList.add('open');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    };

    const closeDropdown = () => {
      leaveTimer = setTimeout(() => {
        dd.classList.remove('open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }, 220); // 220ms grace buffer allows comfortable cursor movement
    };

    dd.addEventListener('mouseenter', openDropdown);
    dd.addEventListener('mouseleave', closeDropdown);

    if (toggle) {
      toggle.addEventListener('focus', openDropdown);
    }

    if (menu) {
      menu.addEventListener('mouseenter', openDropdown);
      menu.addEventListener('mouseleave', closeDropdown);
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      desktopDropdowns.forEach(dd => {
        dd.classList.remove('open');
        const toggle = dd.querySelector('.nav-dropdown-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    }
  });

  // 3. Ultra-Smooth High-Performance Video Engine (Zero-Lag Concurrency Cap)
  // Prevents multiple concurrent hardware decoders from saturating the GPU/CPU.
  const allReelVideos = Array.from(document.querySelectorAll('video:not(.lightbox-video-player)'));
  
  allReelVideos.forEach(video => {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('playsinline', 'true');
  });

  // Track currently playing videos with a safe concurrency cap
  const MAX_CONCURRENT_VIDEOS = 6;
  const currentlyPlaying = new Set();

  function safePlayVideo(video) {
    if (!video || currentlyPlaying.has(video)) return;
    
    // If at cap, pause the oldest playing video
    if (currentlyPlaying.size >= MAX_CONCURRENT_VIDEOS) {
      const oldest = currentlyPlaying.values().next().value;
      if (oldest && oldest !== video) {
        safePauseVideo(oldest);
      }
    }

    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        currentlyPlaying.add(video);
      }).catch(() => {
        // Autoplay policy or interrupt, handle silently
      });
    }
  }

  function safePauseVideo(video) {
    if (!video) return;
    try {
      video.pause();
    } catch (_) {}
    currentlyPlaying.delete(video);
  }

  function pauseAllPageVideos() {
    allReelVideos.forEach(v => safePauseVideo(v));
  }

  // 1. Hero Marquee: Pause entirely when scrolled out of view, play when visible
  const heroMarquee = document.querySelector('.hero-visual-marquee');
  if (heroMarquee) {
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const marqueeVideos = heroMarquee.querySelectorAll('video');
        if (!entry.isIntersecting) {
          marqueeVideos.forEach(v => safePauseVideo(v));
        } else {
          marqueeVideos.forEach(v => safePlayVideo(v));
        }
      });
    }, { threshold: 0.1 });
    heroObserver.observe(heroMarquee);
  }

  // 2. Featured Reels & Mosaic: Play on viewport focus or hover
  const contentVideoCards = document.querySelectorAll('.reel-card-main, .mosaic-tile');
  
  // Observer that only activates when card is significantly visible (threshold: 0.4)
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const card = entry.target;
      const video = card.querySelector('video');
      if (!video) return;

      if (!entry.isIntersecting) {
        safePauseVideo(video);
      } else {
        // Only autoplay if it is in the main focal viewport
        const rect = card.getBoundingClientRect();
        const vHeight = window.innerHeight;
        const isCentered = rect.top < vHeight * 0.75 && rect.bottom > vHeight * 0.25;
        if (isCentered) {
          safePlayVideo(video);
        }
      }
    });
  }, { threshold: [0, 0.4, 0.75] });

  contentVideoCards.forEach(card => cardObserver.observe(card));

  // 3. Desktop Hover-to-Play and Touch for instant responsiveness
  const allInteractiveCards = document.querySelectorAll('.reel-preview-card, .reel-card-main, .mosaic-tile');
  allInteractiveCards.forEach(card => {
    const video = card.querySelector('video');
    if (!video) return;

    card.addEventListener('mouseenter', () => {
      safePlayVideo(video);
    });

    card.addEventListener('touchstart', () => {
      safePlayVideo(video);
    }, { passive: true });
  });

  // 4. Scroll debounce: check active centered video smoothly on scroll
  let scrollTimeout = null;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      scrollTimeout = null;
      let closestCard = null;
      let minDistance = Infinity;
      const vCenter = window.innerHeight / 2;

      contentVideoCards.forEach(card => {
        const rect = card.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          const cardCenter = rect.top + rect.height / 2;
          const dist = Math.abs(vCenter - cardCenter);
          if (dist < minDistance) {
            minDistance = dist;
            closestCard = card;
          }
        }
      });

      if (closestCard) {
        const closestVideo = closestCard.querySelector('video');
        if (closestVideo) {
          safePlayVideo(closestVideo);
        }
      }
    }, 150);
  }, { passive: true });

  // 4. Reel Sound Toggle Buttons
  document.querySelectorAll('.reel-sound-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't trigger modal
      const card = btn.closest('.reel-preview-card, .reel-card-main, .mosaic-tile');
      const video = card ? card.querySelector('video') : null;
      if (video) {
        video.muted = !video.muted;
        if (!video.muted) {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
          btn.style.background = 'var(--pink-primary)';
        } else {
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
          btn.style.background = '';
        }
      }
    });
  });

  // 5. Video Lightbox Modal (Reel Viewer)
  const lightboxModal = document.querySelector('.video-lightbox-modal');
  const lightboxVideo = document.querySelector('.lightbox-video-player');
  const lightboxCloseBtn = document.querySelector('.lightbox-close-btn');
  const lightboxTitle = document.querySelector('.lightbox-reel-title');
  const lightboxSound = document.querySelector('.lightbox-reel-sound');
  const lightboxBookBtn = document.querySelector('.lightbox-book-btn');

  function openLightbox(videoSrc, title, sound, serviceName) {
    if (!lightboxModal || !lightboxVideo) return;
    pauseAllPageVideos(); // Dedicate 100% decoder bandwidth to lightbox player
    lightboxVideo.src = videoSrc;
    lightboxVideo.muted = false; // Unmuted in full viewer
    lightboxVideo.play().catch(() => {
      lightboxVideo.muted = true;
      lightboxVideo.play();
    });

    if (lightboxTitle) lightboxTitle.textContent = title || 'Off Da Hook Signature Look';
    if (lightboxSound) lightboxSound.innerHTML = `♫ ${sound || 'Off Da Hook Hair Salon • Original Audio'}`;
    if (lightboxBookBtn && serviceName) {
      lightboxBookBtn.setAttribute('data-service', serviceName);
    }

    lightboxModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!lightboxModal || !lightboxVideo) return;
    lightboxVideo.pause();
    lightboxVideo.src = '';
    lightboxModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener('click', closeLightbox);
  }

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  // Click any reel card to open lightbox
  document.querySelectorAll('.reel-card-main, .reel-preview-card, .mosaic-tile').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.reel-sound-btn') || e.target.closest('.stat-bubble-icon')) {
        return;
      }
      const video = card.querySelector('video');
      const title = card.getAttribute('data-title') || card.querySelector('.reel-client-title')?.textContent || card.querySelector('.mosaic-text-title')?.textContent;
      const sound = card.getAttribute('data-sound');
      const service = card.getAttribute('data-service');
      if (video) {
        const videoSrc = video.currentSrc || video.src || video.querySelector('source')?.src;
        if (videoSrc) {
          openLightbox(videoSrc, title, sound, service);
        }
      }
    });
  });

  // 6. Category Filter for Featured Reels
  const filterButtons = document.querySelectorAll('.filter-tab-btn');
  const reelCards = document.querySelectorAll('.reels-grid-layout .reel-card-main');

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filterVal = btn.getAttribute('data-filter');

      reelCards.forEach(card => {
        const category = card.getAttribute('data-category');
        if (filterVal === 'all' || category === filterVal) {
          card.style.display = 'block';
          card.style.opacity = '0';
          setTimeout(() => {
            card.style.transition = 'opacity 0.35s ease';
            card.style.opacity = '1';
          }, 30);
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // 7. Interactive Before & After Transformation Sliders (Dual Independent Support)
  const compareWrappers = document.querySelectorAll('.before-after-wrapper');
  compareWrappers.forEach(compareWrapper => {
    const compareOverlay = compareWrapper.querySelector('.compare-overlay');
    const compareHandle = compareWrapper.querySelector('.slider-handle');
    const sliderLine = compareWrapper.querySelector('.slider-divider-line');

    if (!compareOverlay || !compareHandle) return;

    let isDragging = false;

    function setSliderPosition(percentage) {
      if (percentage < 2) percentage = 2;
      if (percentage > 98) percentage = 98;

      compareWrapper.style.setProperty('--slider-pos', `${percentage}%`);
      compareOverlay.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
      compareOverlay.style.webkitClipPath = `inset(0 ${100 - percentage}% 0 0)`;
      compareHandle.style.left = `${percentage}%`;
      compareHandle.setAttribute('aria-valuenow', Math.round(percentage));
      if (sliderLine) {
        sliderLine.style.left = `${percentage}%`;
      }
    }

    function updateSliderFromEvent(e) {
      const rect = compareWrapper.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const offsetX = clientX - rect.left;
      let percentage = (offsetX / rect.width) * 100;
      setSliderPosition(percentage);
    }

    const startDrag = (e) => {
      isDragging = true;
      compareHandle.classList.add('is-active');
      updateSliderFromEvent(e);
    };

    const stopDrag = () => {
      if (isDragging) {
        isDragging = false;
        compareHandle.classList.remove('is-active');
      }
    };

    const onMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable && e.type === 'touchmove') {
        e.preventDefault();
      }
      updateSliderFromEvent(e);
    };

    compareWrapper.addEventListener('mousedown', startDrag);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('mousemove', onMove);

    compareWrapper.addEventListener('touchstart', startDrag, { passive: true });
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);
    window.addEventListener('touchmove', onMove, { passive: false });

    // Keyboard accessibility
    compareHandle.addEventListener('keydown', (e) => {
      let currentVal = parseFloat(compareHandle.getAttribute('aria-valuenow')) || 50;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSliderPosition(currentVal - 4);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSliderPosition(currentVal + 4);
      }
    });

    // Initialize at 50%
    setSliderPosition(50);
  });

  // 7a. Mobile Carousel Controller for Before & After Cases
  const transDuoGrid = document.getElementById('transDuoGrid');
  const transDashTabs = document.querySelectorAll('.trans-dash-tab');
  const transDotDashes = document.querySelectorAll('.trans-dot-dash');
  const transPrevBtn = document.getElementById('transPrevBtn');
  const transNextBtn = document.getElementById('transNextBtn');
  const compareCards = document.querySelectorAll('.transformations-duo-grid .compare-luxury-card');

  let currentTransIndex = 0;
  const totalTransCards = compareCards.length || 2;

  function goToTransformationCase(index) {
    if (window.innerWidth >= 860) {
      if (transDuoGrid) transDuoGrid.style.transform = '';
      compareCards.forEach(card => card.classList.remove('active-card'));
      return;
    }

    currentTransIndex = (index + totalTransCards) % totalTransCards;

    // Smooth transform slide
    if (transDuoGrid) {
      transDuoGrid.style.transform = `translateX(-${currentTransIndex * 50}%)`;
    }

    // Toggle active state on cards
    compareCards.forEach((card, idx) => {
      if (idx === currentTransIndex) {
        card.classList.add('active-card');
      } else {
        card.classList.remove('active-card');
      }
    });

    // Toggle top dash tabs
    transDashTabs.forEach((tab, idx) => {
      const isActive = idx === currentTransIndex;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    // Toggle bottom indicator dots
    transDotDashes.forEach((dot, idx) => {
      const isActive = idx === currentTransIndex;
      dot.classList.toggle('active', isActive);
      dot.setAttribute('aria-selected', isActive);
    });
  }

  // Top Dash Tab click handlers
  transDashTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = parseInt(tab.getAttribute('data-index'), 10) || 0;
      goToTransformationCase(idx);
    });
  });

  // Bottom Dot click handlers
  transDotDashes.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.getAttribute('data-index'), 10) || 0;
      goToTransformationCase(idx);
    });
  });

  // Mobile arrows
  if (transPrevBtn) {
    transPrevBtn.addEventListener('click', () => {
      goToTransformationCase(currentTransIndex - 1);
    });
  }

  if (transNextBtn) {
    transNextBtn.addEventListener('click', () => {
      goToTransformationCase(currentTransIndex + 1);
    });
  }

  // Swipe gesture support on card details area (does not interfere with before/after split slider)
  compareCards.forEach(card => {
    const details = card.querySelector('.compare-card-details');
    if (!details) return;

    let touchStartX = 0;
    let touchStartY = 0;

    details.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    details.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const diffX = touchEndX - touchStartX;
      const diffY = touchEndY - touchStartY;

      if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0) {
          goToTransformationCase(currentTransIndex + 1);
        } else {
          goToTransformationCase(currentTransIndex - 1);
        }
      }
    }, { passive: true });
  });

  // Sync on window resize
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 860) {
      if (transDuoGrid) transDuoGrid.style.transform = '';
      compareCards.forEach(card => card.classList.remove('active-card'));
    } else {
      goToTransformationCase(currentTransIndex);
    }
  });

  // Initial call on mobile
  if (window.innerWidth < 860) {
    goToTransformationCase(0);
  }

  // Lightbox Zoom for any case modal trigger
  document.querySelectorAll('.open-case-modal').forEach(wrapper => {
    wrapper.addEventListener('click', () => {
      const img = wrapper.getAttribute('data-img');
      const title = wrapper.getAttribute('data-title');
      if (img && typeof openLightbox === 'function') {
        openLightbox(img, title, 'Authentic Client Result • Off Da Hook', 'Case Transformation');
      }
    });
  });

  // 7a-2. Mobile Services Slider Controller
  const servicesGrid = document.getElementById('servicesGrid');
  const servicesPrevBtn = document.getElementById('servicesPrevBtn');
  const servicesNextBtn = document.getElementById('servicesNextBtn');
  const servicesDots = document.querySelectorAll('.services-dot-btn');
  const servicesCounterNum = document.querySelector('#servicesCounter .active-num');

  if (servicesGrid) {
    let currentServiceIndex = 0;
    const serviceCards = servicesGrid.querySelectorAll('.service-card');
    const totalServices = serviceCards.length;

    function updateServiceSliderUI(idx) {
      currentServiceIndex = idx;
      servicesDots.forEach((dot, i) => {
        const isActive = i === idx;
        dot.classList.toggle('active', isActive);
        dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      if (servicesCounterNum) {
        servicesCounterNum.textContent = idx + 1;
      }
    }

    function scrollToServiceIndex(idx) {
      if (idx < 0) idx = 0;
      if (idx >= totalServices) idx = totalServices - 1;
      const targetCard = serviceCards[idx];
      if (targetCard) {
        const offset = targetCard.offsetLeft - (servicesGrid.clientWidth - targetCard.clientWidth) / 2;
        servicesGrid.scrollTo({
          left: Math.max(0, offset),
          behavior: 'smooth'
        });
        updateServiceSliderUI(idx);
      }
    }

    if (servicesPrevBtn) {
      servicesPrevBtn.addEventListener('click', () => {
        scrollToServiceIndex(currentServiceIndex - 1);
      });
    }

    if (servicesNextBtn) {
      servicesNextBtn.addEventListener('click', () => {
        scrollToServiceIndex(currentServiceIndex + 1);
      });
    }

    servicesDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.getAttribute('data-index'), 10) || 0;
        scrollToServiceIndex(idx);
      });
    });

    let isServicesScrollDebounce = null;
    servicesGrid.addEventListener('scroll', () => {
      if (window.innerWidth >= 768) return;
      if (isServicesScrollDebounce) clearTimeout(isServicesScrollDebounce);
      isServicesScrollDebounce = setTimeout(() => {
        const scrollCenter = servicesGrid.scrollLeft + servicesGrid.clientWidth / 2;
        let closestIndex = 0;
        let minDistance = Infinity;

        serviceCards.forEach((card, idx) => {
          const cardCenter = card.offsetLeft + card.clientWidth / 2;
          const dist = Math.abs(scrollCenter - cardCenter);
          if (dist < minDistance) {
            minDistance = dist;
            closestIndex = idx;
          }
        });

        updateServiceSliderUI(closestIndex);
      }, 50);
    }, { passive: true });
  }

  // 7b. OwlCarousel for Client Reviews (1 Card on Phone View, 2 on Tablet, 3 on Desktop)
  if (window.jQuery && typeof jQuery.fn.owlCarousel === 'function') {
    $('.reviews-owl-carousel').owlCarousel({
      loop: true,
      margin: 24,
      nav: true,
      dots: true,
      autoplay: true,
      autoplayTimeout: 5500,
      autoplayHoverPause: true,
      smartSpeed: 700,
      navText: [
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>',
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>'
      ],
      responsive: {
        0: {
          items: 1, // EXACTLY 1 card on phone view!
          margin: 16,
          dots: false // Sleek on mobile view: no long messy line of dots!
        },
        768: {
          items: 2, // 2 cards on tablet
          margin: 20
        },
        1100: {
          items: 3, // 3 cards on desktop
          margin: 24
        }
      }
    });
  }

  // 7c. Redesigned Contact Section: Quick Service Pills & Form Handler
  const contactServicePills = document.querySelectorAll('.service-pill-btn, .service-box-btn');
  const selectedServiceInput = document.getElementById('selected-service-input');
  contactServicePills.forEach(btn => {
    btn.addEventListener('click', () => {
      contactServicePills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const svc = btn.getAttribute('data-service');
      if (selectedServiceInput && svc) {
        selectedServiceInput.value = svc;
      }
    });
  });

  const clientTypeBtns = document.querySelectorAll('.segmented-toggle-btn');
  clientTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      clientTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 7c. Form Handlers with Real Backend Dispatch (/api/contact), Honeypot, & Honest Error Handling
  const escapeFormHtml = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function showFormErrorAlert(form, message) {
    let existingAlert = form.querySelector('.form-error-alert');
    if (existingAlert) existingAlert.remove();

    const err = document.createElement('div');
    err.className = 'form-error-alert';
    err.setAttribute('role', 'alert');
    err.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>${escapeFormHtml(message)}</span>`;
    form.insertBefore(err, form.firstChild);
    err.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function submitSalonForm(form, payload, successTitle, successBodyHtml, includeStyleSeat = true) {
    let existingAlert = form.querySelector('.form-error-alert');
    if (existingAlert) existingAlert.remove();

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn && submitBtn.disabled) return; // Prevent duplicate rapid submission

    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Sending Safely...</span>';
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success !== true) {
        const msg = (data && data.error)
          ? data.error
          : 'Unable to send your inquiry right now. Please try again or call (347) 238-1602.';
        showFormErrorAlert(form, msg);
        return;
      }

      form.innerHTML = `
        <div class="form-success-alert">
          <div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(216, 27, 96, 0.1); color: var(--pink-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h3 style="font-size: 22px; font-weight: 800; margin-bottom: 8px; color: var(--text-primary);">${escapeFormHtml(successTitle)}</h3>
          <p style="color: var(--text-secondary); font-size: 15px; margin-bottom: 20px; line-height: 1.6;">
            ${successBodyHtml}
          </p>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <a href="tel:3472381602" class="btn-action-solid">
              Call / Text: (347) 238-1602
            </a>
            ${includeStyleSeat ? `<a href="https://www.styleseat.com/m/v/stylist101" target="_blank" rel="noopener" class="btn-action-outline">StyleSeat Real-Time Booking ↗</a>` : ''}
          </div>
        </div>
      `;
    } catch (networkErr) {
      showFormErrorAlert(form, 'Network error while sending your message. Your details are still saved below—please retry or call (347) 238-1602.');
    } finally {
      if (submitBtn && form.contains(submitBtn)) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  const suiteContactForm = document.getElementById('suite-contact-form');
  if (suiteContactForm) {
    suiteContactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('contact-name');
      const emailInput = document.getElementById('contact-email');
      const phoneInput = document.getElementById('contact-phone');
      const serviceInput = document.getElementById('contact-service') || selectedServiceInput;
      const notesInput = document.getElementById('contact-notes');
      const honeypotInput = suiteContactForm.querySelector('input[name="website"]');

      const name = nameInput?.value?.trim() || '';
      const email = emailInput?.value?.trim() || '';
      const phone = phoneInput?.value?.trim() || '';
      const service = serviceInput?.value?.trim() || '';
      const notes = notesInput?.value?.trim() || '';

      if (!name || !phone || !email || !service) {
        showFormErrorAlert(suiteContactForm, 'Please enter your full name, email address, phone number, and desired service.');
        if (!name && nameInput) nameInput.focus();
        else if (!email && emailInput) emailInput.focus();
        else if (!phone && phoneInput) phoneInput.focus();
        return;
      }

      await submitSalonForm(
        suiteContactForm,
        {
          formType: 'suite_inquiry',
          name,
          email,
          phone,
          service,
          notes,
          website: honeypotInput ? honeypotInput.value : ''
        },
        'Suite Inquiry Submitted',
        `Thank you, <strong>${escapeFormHtml(name)}</strong>! Your inquiry for <strong>${escapeFormHtml(service)}</strong> has been dispatched to Shawnese Parker. She will reach out at <strong>${escapeFormHtml(phone)}</strong> or <strong>${escapeFormHtml(email)}</strong>.`,
        true
      );
    });
  }

  // Career Application Form Handler
  const careerForm = document.getElementById('career-application-form');
  if (careerForm) {
    careerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('applicant-name')?.value.trim() || '';
      const phone = document.getElementById('applicant-phone')?.value.trim() || '';
      const email = document.getElementById('applicant-email')?.value.trim() || '';
      const role = document.getElementById('applicant-role')?.value.trim() || '';
      const experience = document.getElementById('applicant-experience')?.value.trim() || '';
      const license = document.getElementById('applicant-license')?.value.trim() || '';
      const portfolio = document.getElementById('applicant-instagram')?.value.trim() || '';
      const availability = document.getElementById('applicant-availability')?.value.trim() || '';
      const notes = document.getElementById('applicant-notes')?.value.trim() || '';
      const honeypotInput = careerForm.querySelector('input[name="website"]');

      if (!name || !phone || !email || !role || !experience || !license || !availability) {
        showFormErrorAlert(careerForm, 'Please fill in all required career application fields marked with an asterisk (*).');
        return;
      }

      await submitSalonForm(
        careerForm,
        {
          formType: 'career_application',
          name,
          phone,
          email,
          role,
          experience,
          license,
          portfolio,
          availability,
          notes,
          website: honeypotInput ? honeypotInput.value : ''
        },
        'Application Submitted',
        `Thank you, <strong>${escapeFormHtml(name)}</strong>! Your application for <strong>${escapeFormHtml(role)}</strong> has been dispatched to Shawnese Parker. We will reach out to you at <strong>${escapeFormHtml(phone)}</strong> or <strong>${escapeFormHtml(email)}</strong>.`,
        false
      );
    });
  }

  // Dedicated Contact Page Form Handler
  const contactPageForm = document.getElementById('contact-page-form');
  if (contactPageForm) {
    contactPageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('contact-client-name')?.value.trim() || '';
      const phone = document.getElementById('contact-client-phone')?.value.trim() || '';
      const service = document.getElementById('contact-booking-service-select')?.value.trim() || '';
      const preferredDate = document.getElementById('contact-booking-date')?.value.trim() || '';
      const notes = document.getElementById('contact-client-notes')?.value.trim() || '';
      const honeypotInput = contactPageForm.querySelector('input[name="website"]');

      if (!name || !phone || !service) {
        showFormErrorAlert(contactPageForm, 'Please fill out your name, phone number, and desired service.');
        return;
      }

      await submitSalonForm(
        contactPageForm,
        {
          formType: 'contact_request',
          name,
          phone,
          service,
          preferredDate,
          notes,
          website: honeypotInput ? honeypotInput.value : ''
        },
        'Suite Request Submitted',
        `Thank you, <strong>${escapeFormHtml(name)}</strong>! Your appointment request for <strong>${escapeFormHtml(service)}</strong>${preferredDate ? ` on <strong>${escapeFormHtml(preferredDate)}</strong>` : ''} has been submitted. Shawnese will confirm with you at <strong>${escapeFormHtml(phone)}</strong>.`,
        true
      );
    });
  }

  // 7d. Multi-Step Hair Quiz Modal Controller
  const hairQuizModal = document.getElementById('hairQuizModal');
  const openQuizTriggers = document.querySelectorAll('#openHairQuizTrigger, #openHairQuizBtn, .btn-trigger-quiz');
  const closeQuizBtn = document.getElementById('closeQuizModalBtn');
  const quizPanes = document.querySelectorAll('.quiz-step-pane');
  const quizProgressBar = document.getElementById('quizProgressBar');
  const quizStepIndicatorText = document.getElementById('quizStepIndicatorText');
  let currentQuizStep = 1;
  const quizAnswers = {
    texture: '',
    priority: '',
    challenge: '',
    routine: ''
  };

  function openQuizModal() {
    if (!hairQuizModal) return;
    hairQuizModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    goToQuizStep(1);
  }

  function closeQuizModal() {
    if (!hairQuizModal) return;
    hairQuizModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function goToQuizStep(step) {
    currentQuizStep = step;
    quizPanes.forEach(pane => {
      pane.classList.toggle('active', parseInt(pane.getAttribute('data-step')) === step);
    });
    if (step <= 4) {
      if (quizProgressBar) quizProgressBar.style.width = `${step * 25}%`;
      if (quizStepIndicatorText) quizStepIndicatorText.textContent = `Step ${step} of 4`;
    } else {
      if (quizProgressBar) quizProgressBar.style.width = '100%';
      if (quizStepIndicatorText) quizStepIndicatorText.textContent = 'Diagnosis Complete';
    }
  }

  openQuizTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openQuizModal();
    });
  });

  closeQuizBtn?.addEventListener('click', closeQuizModal);
  hairQuizModal?.addEventListener('click', (e) => {
    if (e.target === hairQuizModal) closeQuizModal();
  });

  // Step 1 Options
  document.querySelectorAll('.quiz-step-pane[data-step="1"] .quiz-option-item').forEach(item => {
    item.addEventListener('click', () => {
      item.parentElement.querySelectorAll('.quiz-option-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      quizAnswers.texture = item.getAttribute('data-val');
      const nextBtn = document.getElementById('quizNextBtn1');
      if (nextBtn) nextBtn.disabled = false;
    });
  });

  // Step 2 Options
  document.querySelectorAll('.quiz-step-pane[data-step="2"] .quiz-option-item').forEach(item => {
    item.addEventListener('click', () => {
      item.parentElement.querySelectorAll('.quiz-option-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      quizAnswers.priority = item.getAttribute('data-val');
      const nextBtn = document.getElementById('quizNextBtn2');
      if (nextBtn) nextBtn.disabled = false;
    });
  });

  // Step 3 Options
  document.querySelectorAll('.quiz-step-pane[data-step="3"] .quiz-option-item').forEach(item => {
    item.addEventListener('click', () => {
      item.parentElement.querySelectorAll('.quiz-option-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      quizAnswers.challenge = item.getAttribute('data-val');
      const nextBtn = document.getElementById('quizNextBtn3');
      if (nextBtn) nextBtn.disabled = false;
    });
  });

  // Step 4 Options
  document.querySelectorAll('.quiz-step-pane[data-step="4"] .quiz-option-item').forEach(item => {
    item.addEventListener('click', () => {
      item.parentElement.querySelectorAll('.quiz-option-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      quizAnswers.routine = item.getAttribute('data-val');
      const finishBtn = document.getElementById('quizFinishBtn');
      if (finishBtn) finishBtn.disabled = false;
    });
  });

  // Quiz Navigation
  document.getElementById('quizNextBtn1')?.addEventListener('click', () => goToQuizStep(2));
  document.getElementById('quizNextBtn2')?.addEventListener('click', () => goToQuizStep(3));
  document.getElementById('quizNextBtn3')?.addEventListener('click', () => goToQuizStep(4));
  document.querySelectorAll('.btn-quiz-back').forEach(btn => {
    btn.addEventListener('click', () => {
      const goto = parseInt(btn.getAttribute('data-goto'));
      if (goto) goToQuizStep(goto);
    });
  });

  // Calculate Diagnosis on Finish
  document.getElementById('quizFinishBtn')?.addEventListener('click', () => {
    let recTitle = 'Silk Press & Ozone Steam Hydration';
    let recDesc = `For your ${quizAnswers.texture || 'natural'} crown facing ${quizAnswers.challenge || 'dryness'}, Shawnese recommends a clarifying scalp detox, medical-grade ozone steam hydration therapy, and ceramic heat sealing for featherweight mirror shine with zero heat damage.`;
    let serviceValue = 'Silk Press & Hydration Steam';

    if (quizAnswers.priority?.includes('Regrowth') || quizAnswers.challenge?.includes('Thinning')) {
      recTitle = 'Follicle & Edge Regrowth Protocol';
      recDesc = `Given your focus on revitalizing fragile edges, Shawnese will formulate a specialized botanical growth serum treatment with ozone steam follicle dilation, low-tension scalp stimulation, and moisture barrier sealing.`;
      serviceValue = 'Follicle & Edge Regrowth';
    } else if (quizAnswers.priority?.includes('Braids')) {
      recTitle = 'Tension-Free Bohemian Knotless Braids';
      recDesc = `To protect your ${quizAnswers.texture || 'natural'} hair while ensuring low-maintenance longevity, Shawnese's painless knotless technique secures your parts without any scalp tension or pulling on edges.`;
      serviceValue = 'Knotless Box Braids';
    } else if (quizAnswers.priority?.includes('Color')) {
      recTitle = 'Custom Blonding & Bond Reconstruction';
      recDesc = `Custom dimensional color tailored to your undertones, protected by bond-building hydration to keep your curl pattern bouncy and healthy.`;
      serviceValue = 'Custom Blonding & Balayage';
    }

    const titleElem = document.getElementById('quizRecommendedServiceTitle');
    const descElem = document.getElementById('quizRecommendedServiceDesc');
    if (titleElem) titleElem.textContent = recTitle;
    if (descElem) descElem.textContent = recDesc;
    goToQuizStep(5);

    // Apply to Form Button
    const applyBtn = document.getElementById('btnApplyQuizToForm');
    if (applyBtn) {
      applyBtn.onclick = () => {
        if (selectedServiceInput) selectedServiceInput.value = serviceValue;
        contactServicePills.forEach(pill => {
          if (pill.getAttribute('data-service') === serviceValue) {
            pill.classList.add('active');
          } else {
            pill.classList.remove('active');
          }
        });
        const notesField = document.getElementById('contact-notes');
        if (notesField) {
          notesField.value = `[Hair Quiz Result: Recommended ${recTitle} for ${quizAnswers.texture} with ${quizAnswers.challenge}]`;
        }
        closeQuizModal();
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
      };
    }
  });

  // 8. FAQ Accordion Interaction
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question?.addEventListener('click', () => {
      const wasActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!wasActive) {
        item.classList.add('active');
      }
    });
  });

  // 9. StyleSeat Services Registry & Modal Architecture
  const SERVICES_DATA = {
    "4755888": {
      id: "4755888",
      name: "Sew-in with leaveout maintenance/Weave Wash and Tighten",
      fullName: "Sew-in with leaveout maintenance/Weave Wash and Tighten",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$140+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4755888",
      description: "Shampoo and adjustments to keep your sew-in on point. Recommended every three weeks after your install.",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "4706163": {
      id: "4706163",
      name: "Natural hair triim",
      fullName: "Natural hair triim",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$40",
      duration: "30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4706163",
      description: "Precision split-end dusting, health perimeter trim, and shaping to maintain healthy growth, reduce split ends, and preserve strand elasticity.",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "4705628": {
      id: "4705628",
      name: "Natural hair Twistout or Wash and Go style",
      fullName: "Natural hair Twistout or Wash and Go style",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$175+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4705628",
      description: "Clarifying cleanse, rich hydration conditioning bath, and expertly defined two-strand twistout or curl-defining wash and go styling.",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "4638252": {
      id: "4638252",
      name: "Mini Serenity Suites Head spa ( Add ON )",
      fullName: "Mini Serenity Suites Head spa ( Add ON )",
      category: "Head Spa & Treatments",
      categoryBadge: "\u2726 Scalp Revival",
      price: "$75",
      duration: "30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4638252",
      description: "Relaxing Afro /Japanese Headspa therapy experience with custom Shampoo,  hair treatment,  Steam hydration and full body massage,  \nAdd this with any full price service",
      includes: ["Comprehensive Scalp & Follicle Micro-Analysis", "Golden Halo Water Bed Steam Hydration Bath", "Therapeutic Acupressure Scalp Manipulation Massage", "Complimentary Wine or Champagne & Eye Mask"]
    },
    "2395914": {
      id: "2395914",
      name: "Micro Locs",
      fullName: "Micro Locs",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$1,500+",
      duration: "8 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2395914",
      description: "Micro Starter Locs on natural hair must come in for consultation before appointment!!\nMinimum length 2 inches",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "4384187": {
      id: "4384187",
      name: "Wig customization with install",
      fullName: "Wig customization with install",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$250+",
      duration: "3 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4384187",
      description: "Bleach knots, customize hairline, add combs or band and installation of unit with style",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "4277173": {
      id: "4277173",
      name: "Wig custmization",
      fullName: "Wig custmization",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$125+",
      duration: "1 hr",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4277173",
      description: "Bleach knots, wash, condition, style and plucking of unit",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "4270060": {
      id: "4270060",
      name: "Color bundles",
      fullName: "Color bundles",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$125+",
      duration: "45 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4270060",
      description: "Custom coloring of up to 3 bundles additional bundles $40.00 each",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "4207545": {
      id: "4207545",
      name: "Jumbo Box Braids",
      fullName: "Jumbo Box Braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$150+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/4207545",
      description: "Jumbo box braids up to waist length",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2785163": {
      id: "2785163",
      name: "Microloc Extensions",
      fullName: "Microloc Extensions",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$2,000+",
      duration: "8 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2785163",
      description: "Micro Starter locs with hair added for length and volume. 12 inch - 24 inches, Must fill out Microloc Qualifying Questionnaire!!\nThis is a base price,  Must come in for consultation prior to appointment to establish size length , density and color preference. Final price will includes a clarifying wash, steam treatment , hair and install",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "11335763": {
      id: "11335763",
      name: "Behind Hairline Lace Closure Sew In",
      fullName: "Behind Hairline Lace Closure Sew In",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$400+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11335763",
      description: "Specialized lace closure sew  in  with hairline perimeter left out for a more natural look, Best outcome with 2 \u00d7 6 Lace closure  but can be done either any size",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "11170653": {
      id: "11170653",
      name: "Clip in Extensions",
      fullName: "Clip in Extensions",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$25+",
      duration: "1 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11170653",
      description: "Seamless and discreet, a single track involves one track line for a lightweight, no-show weave fit.\nThis price is per row",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "11549263": {
      id: "11549263",
      name: "Deluxe Length Sew in special  with bundles included 24 - 32 inches",
      fullName: "Deluxe Length Sew in special  with bundles included 24 - 32 inches",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$750+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11549263",
      description: "This service includes Shampoo, Treatment,  3 - 4 bundles of your texture choice Scalp Treatment , Protective Netting, Install of Weave , Cut and style which includes straightening or curling",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "11638429": {
      id: "11638429",
      name: "FLIPOVER sew in",
      fullName: "FLIPOVER sew in",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$300+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11638429",
      description: "Sew in using FLIPOVER method",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "11234922": {
      id: "11234922",
      name: "Fulani Braids with, Partial Sew In",
      fullName: "Fulani Braids with, Partial Sew In",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$350+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11234922",
      description: "Fulani cornrow braid design  with sew in weave in back",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "11378229": {
      id: "11378229",
      name: "K tip Fusion Extensions",
      fullName: "K tip Fusion Extensions",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$2,000+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11378229",
      description: "Add some length to your look, we'll color match, fit, and set your extensions.\nA good candidate for Ktips hair extensions is someone looking to enhance their hair\u2019s volume, length, or style with a natural-looking solution. Ideal candidates are individuals with healthy hair, who are seeking a high-quality, low-maintenance extension option that blends seamlessly with their natural hair. Those who want a versatile and customizable extensions.\nThis service includes a luxury head shampoo with Micromist steam treatment,  trim if necessary,  extensions of your choice fit to the density of your naturally growing hair up to 24 inches. Additional lengths up to 30 inches are Available for an additional cost \nThis extension method is extremely versatile which allows for very high ponytails,  updos , half up half down styling and will last 3 - 6 months with proper maintenance and care.",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "10569886": {
      id: "10569886",
      name: "Loc Color with Retwist",
      fullName: "Loc Color with Retwist",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$325+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/10569886",
      description: "Wash, Color, Steam Hydration treatment and Retwist",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "11591613": {
      id: "11591613",
      name: "Loc Maintenance",
      fullName: "Loc Maintenance",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$250+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11591613",
      description: "Loc extensions / repairs",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "11280793": {
      id: "11280793",
      name: "Micro / Sister Loc Wash , Steam and style",
      fullName: "Micro / Sister Loc Wash , Steam and style",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$175+",
      duration: "2 hr 15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11280793",
      description: "Keep your locs going strong with a maintenance session. We'll wash, Custom Steam and style",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "10702575": {
      id: "10702575",
      name: "Micro Loc detox with steam hydration",
      fullName: "Micro Loc detox with steam hydration",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$150+",
      duration: "1 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/10702575",
      description: "Keep your locs going strong with a maintenance session. We'll wash, detox , hydrate and incorporate new growth ( this service does not include retwist or style)",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "11209147": {
      id: "11209147",
      name: "Natural 2 strand twists",
      fullName: "Natural 2 strand twists",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$200+",
      duration: "3 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11209147",
      description: "Includes wash,  steam hydration treatment or Deep Condition,  trim and individual 2 strand twists",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "11631680": {
      id: "11631680",
      name: "Serenity Suite Head Spa service",
      fullName: "Serenity Suite Head Spa service",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$175+",
      duration: "1 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11631680",
      description: "Protect and strengthen your hair with. Our Headspa experience includes a Scalp Analysis,  glass of champagne or sparkling water, Slippers, Complimentary Robe , Heated eye Mask ,Blanket,  Back and leg Massage for optimal relaxation , deep cleansing Scalp massage with scalp exfoliation to remove buildup and impurities,  Relaxing Scalp massage to relieve tension and stimulate blood flow which promotes healthy hair growth, Steam therapy to open pores and allow for better product absorption,  hair Masque to hydrate and repair damaged follicles, Waterfall rinse for relaxation and stress relief,  this treatment will improve the overall quality of your hair by improving itchiness,  oily hair,  headaches and the overall integrity of your hair .All of this while feeling like you've been transported into the serene tranquility of the tropical rainforest, this service includes a custom charcuterie board, champagne,wine, sparkling water, ginger ale and a wind down in our Massage chair after your service is done we will blow your hair you have the option of 2 cornrows",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "11385557": {
      id: "11385557",
      name: "Takedown experience",
      fullName: "Takedown experience",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$200+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11385557",
      description: "Takedown Weave , braids or crochet styles with shampoo , treatment and headspa service, this service includes refreshments, Please note there is an upcharge for smaller sized  braids and twists,  boho braids and faux locs , please call ahead for pricing",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "11628464": {
      id: "11628464",
      name: "Updo",
      fullName: "Updo",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$225+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11628464",
      description: "Style your hair for an important event. Bring photos if there is a specific look you are going for.This style includes shampoo and condition",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "11394745": {
      id: "11394745",
      name: "V Light Hair Extensions",
      fullName: "V Light Hair Extensions",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$2,000+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11394745",
      description: "Introducing VLight Hair Extensions the most undetectable and lightweight hair extensions on the market.: Elevate your style with our premium extensions, designed to add volume and length effortlessly. Please note, that this technique sheds quickly and a complimentary retouch is included for this service within 2 weeks of install, which we'll tailor a package to your needs, ensuring you receive a personalized experience and a total price that reflects your desire. Technique lasts 1-8 weeks and all hair is included with this service \n\n\nShow Less",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "11444854": {
      id: "11444854",
      name: "Wig Maintenance",
      fullName: "Wig Maintenance",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$125+",
      duration: "1 hr 15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/11444854",
      description: "Full wash, deep conditioning soak, closure/lace prep, plucking touch-up, and sleek thermal styling to restore bounce and shine to your custom unit.",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2396079": {
      id: "2396079",
      name: "Stitch Braids",
      fullName: "Stitch Braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$225+",
      duration: "3 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2396079",
      description: "Extra small -  $350.00 14 - 18 braids\nSmall - $325.00. 12 - 14 braids\nSmedium - $300.00  10 - 12 braids \nMedium - $250.00  - 8 - 10 braids\nLarge - $ 225.00 -  up to 6 braids",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2396054": {
      id: "2396054",
      name: "Loc extensions",
      fullName: "Loc extensions",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$1,000+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2396054",
      description: "Loc Extensions , wash, hydration,  install of 50 - 100 locs , style and maintenance products",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "2361735": {
      id: "2361735",
      name: "Medium Knotless box braids",
      fullName: "Medium Knotless box braids",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$350+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361735",
      description: "Medium back length braids\n+ $25.00 waist length\n+$50.00 booty length\n+ $75.00 below the booty length\n+ $100.00 knee length\nAdd boho hair included \n1 bundle curly hair - $125.00\n2 bundles curly hair - $250.00\nBora Bora / 3 bundles curly hair - $350.00\nBring your own hair will be half price",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2395907": {
      id: "2395907",
      name: "Squeeze in fee",
      fullName: "Squeeze in fee",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$75+",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2395907",
      description: "Same day or full day fee for not having a scheduled appointment",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "2361632": {
      id: "2361632",
      name: "crochet braids",
      fullName: "crochet braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$200+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361632",
      description: "Stylish and protective. We'll attach synthetic hair extensions through your natural hair for a full-bodied look.",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "1018155": {
      id: "1018155",
      name: "Full Color",
      fullName: "Full Color",
      category: "Color & Relaxers",
      categoryBadge: "\u2726 Color & Texture",
      price: "$200+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/1018155",
      description: "Single color application",
      includes: ["Custom Tone Formulation & Skin Undertone Matching", "Bond-Building Restorative Protection Shield", "Post-Color pH Rebalancing & Deep Moisture Mask", "High-Gloss Mirror Finish & Silk Blowout"]
    },
    "2361701": {
      id: "2361701",
      name: "Cornrows / Lemonade braids",
      fullName: "Cornrows / Lemonade braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$250+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361701",
      description: "Cornrows styles must specify size and length for accurate pricing",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2361723": {
      id: "2361723",
      name: "Lace Frontal tighten / maintenance",
      fullName: "Lace Frontal tighten / maintenance",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$200+",
      duration: "3 hr 15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361723",
      description: "Re tighten sew in and lace frontal with styling",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2361703": {
      id: "2361703",
      name: "individual tracks",
      fullName: "individual tracks",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$45+",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361703",
      description: "Price is per track",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2361704": {
      id: "2361704",
      name: "Quick weave",
      fullName: "Quick weave",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$225+",
      duration: "2 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361704",
      description: "Shampoo, Condition and Quick Weave installation with style",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2361631": {
      id: "2361631",
      name: "Lace closure wash and tighten",
      fullName: "Lace closure wash and tighten",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$150+",
      duration: "2 hr 45 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361631",
      description: "Full wash and retighten of tracks and closure piece",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2361717": {
      id: "2361717",
      name: "loc retwist",
      fullName: "loc retwist",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$175+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361717",
      description: "Wash , condition and retwist of Locs",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "2361689": {
      id: "2361689",
      name: "I Tip /Microbead install",
      fullName: "I Tip /Microbead install",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$1,000+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361689",
      description: "This service includes a luxury shampoo service with steam treatment and trim if necessary with custom\nMatched hair  extensions for full head of weave that can be worn down or pulled up in high ponytail or bun. Hair is included with this service\n14 - 24 inches ( Longer lengths up to 30 inches can be purchased for an additional cost",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2410318": {
      id: "2410318",
      name: "Microloc Retie",
      fullName: "Microloc Retie",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$350+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2410318",
      description: "Individual interlocking of locs, includes shampoo, treatment with service, price is adjusted according to damage and or repairs needed",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "2403373": {
      id: "2403373",
      name: "perimeter relaxer",
      fullName: "perimeter relaxer",
      category: "Color & Relaxers",
      categoryBadge: "\u2726 Color & Texture",
      price: "$60",
      duration: "45 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2403373",
      description: "Relaxer applied to leaveout and edges",
      includes: ["Custom Tone Formulation & Skin Undertone Matching", "Bond-Building Restorative Protection Shield", "Post-Color pH Rebalancing & Deep Moisture Mask", "High-Gloss Mirror Finish & Silk Blowout"]
    },
    "2404871": {
      id: "2404871",
      name: "Mens braids",
      fullName: "Mens braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$125+",
      duration: "1 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2404871",
      description: "Wash, condition and cornrow style for men",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2404875": {
      id: "2404875",
      name: "Versatile  2 or 3 part sew in",
      fullName: "Versatile  2 or 3 part sew in",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$350+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2404875",
      description: "Versatile sew in with 2 or 3 way parting option\nThis service includes shampoo and conditioning treatment",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2404879": {
      id: "2404879",
      name: "Wash bundles",
      fullName: "Wash bundles",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$30+",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2404879",
      description: "Wash and restore  bundles to be reinstalled",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2361726": {
      id: "2361726",
      name: "Relaxer (virgin hair)",
      fullName: "Relaxer (virgin hair)",
      category: "Color & Relaxers",
      categoryBadge: "\u2726 Color & Texture",
      price: "$150+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361726",
      description: "Full head relaxer using Mizani, Affirm , Nairobi or Dudleys relaxer, includes treatment and flat iron style",
      includes: ["Custom Tone Formulation & Skin Undertone Matching", "Bond-Building Restorative Protection Shield", "Post-Color pH Rebalancing & Deep Moisture Mask", "High-Gloss Mirror Finish & Silk Blowout"]
    },
    "2361731": {
      id: "2361731",
      name: "relaxer touch up",
      fullName: "relaxer touch up",
      category: "Color & Relaxers",
      categoryBadge: "\u2726 Color & Texture",
      price: "$75",
      duration: "1 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361731",
      description: "Precision root relaxer application to new growth using gentle neutralizing treatment, followed by deep conditioning and sleek flat iron finish.",
      includes: ["Custom Tone Formulation & Skin Undertone Matching", "Bond-Building Restorative Protection Shield", "Post-Color pH Rebalancing & Deep Moisture Mask", "High-Gloss Mirror Finish & Silk Blowout"]
    },
    "2361721": {
      id: "2361721",
      name: "Rinse color",
      fullName: "Rinse color",
      category: "Color & Relaxers",
      categoryBadge: "\u2726 Color & Texture",
      price: "$60+",
      duration: "1 hr 15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361721",
      description: "Semi-permanent gloss or rich tone rinse formulated without ammonia to enhance natural radiance, cover faint grays, and seal cuticle moisture.",
      includes: ["Custom Tone Formulation & Skin Undertone Matching", "Bond-Building Restorative Protection Shield", "Post-Color pH Rebalancing & Deep Moisture Mask", "High-Gloss Mirror Finish & Silk Blowout"]
    },
    "2410313": {
      id: "2410313",
      name: "Rod Set",
      fullName: "Rod Set",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$250+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2410313",
      description: "Rod set on natural hair",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "1018157": {
      id: "1018157",
      name: "Sew in with leaveout special hair included up to 22 inches",
      fullName: "Sew in with leaveout special hair included up to 22 inches",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$600+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/1018157",
      description: "Wash ,  treatment, Weave install with minimal leaveout with 3 bundles up to 22 inches any texture, cut and style \n( Hair is included with this service) additional bundles are additional",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "1018154": {
      id: "1018154",
      name: "sew in with lace closure",
      fullName: "sew in with lace closure",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$300+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/1018154",
      description: "3 part closures will be $25.00 additional",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2361622": {
      id: "2361622",
      name: "sew in with lace frontal",
      fullName: "sew in with lace frontal",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$350+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361622",
      description: "Sew in with lace frontal ear to ear and up to 3 bundles of hair",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2361620": {
      id: "2361620",
      name: "Lace Frontal install special with hair included",
      fullName: "Lace Frontal install special with hair included",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$800+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361620",
      description: "Wash, Deep condition with SteamTreatment, Frontal piece install with 3  bundles up to 22 inches, Cut and Style ( hair is included with this service)",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2361718": {
      id: "2361718",
      name: "starter locs",
      fullName: "starter locs",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$250+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361718",
      description: "Comb coil or two-strand twist starter loc installation with scalp analysis, clarifying wash, organic loc elixir, and personalized home care guidance.",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "2395908": {
      id: "2395908",
      name: "Partial color on leaveout",
      fullName: "Partial color on leaveout",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$75+",
      duration: "30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2395908",
      description: "Tint silk closure scalp area to match natural skin tone",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2361702": {
      id: "2361702",
      name: "Small knotless braids",
      fullName: "Small knotless braids",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$550+",
      duration: "8 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361702",
      description: "Small sized braids back length \n+$25.00 waist length\n+ $.00 butt length\n+ $100.00 knee length\nAdd boho hair included \n1 bundle curly hair - $125.00\n2 bundles curly hair - $250.00\nBora Bora / 3 bundles curly hair - $350.00\nBring your own hair will be half price",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2388602": {
      id: "2388602",
      name: "Traditional Sewin with Leaveout/ Versatile Sew In",
      fullName: "Traditional Sewin with Leaveout/ Versatile Sew In",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$275+",
      duration: "3 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2388602",
      description: "Traditional Sew in with minimal leave out or Versatile sew in with Perimeter out 2 - 3 bundles  additional bundles will be an additional charge",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2388620": {
      id: "2388620",
      name: "Smedium knotless",
      fullName: "Smedium knotless",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$450+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2388620",
      description: "Knotless braids in between Small and Medium\n+$25.00 waist length\n+ $.00 butt length\n+ $100.00 knee length\nAdd boho hair included \n1 bundle curly hair - $125.00\n2 bundles curly hair - $250.00\nBora Bora / 3 bundles curly hair - $350.00\nBring your own hair will be half price",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2388625": {
      id: "2388625",
      name: "Wash Wrap Curl",
      fullName: "Wash Wrap Curl",
      category: "Head Spa & Treatments",
      categoryBadge: "\u2726 Scalp Revival",
      price: "$150+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2388625",
      description: "Wash,  treatment wrap and curl for short styles",
      includes: ["Comprehensive Scalp & Follicle Micro-Analysis", "Golden Halo Water Bed Steam Hydration Bath", "Therapeutic Acupressure Scalp Manipulation Massage", "Complimentary Wine or Champagne & Eye Mask"]
    },
    "2361734": {
      id: "2361734",
      name: "silk press",
      fullName: "silk press",
      category: "Head Spa & Treatments",
      categoryBadge: "\u2726 Scalp Revival",
      price: "$175+",
      duration: "3 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2361734",
      description: "Relaxing eye mask, \nCustom Wash\nTreatment with Micromist Steam Hydration \nCustom Scalp Detox ( if Required )\nScalp massage,  \nBlow dry \n Flat iron, trim if necessary and Style",
      includes: ["Comprehensive Scalp & Follicle Micro-Analysis", "Golden Halo Water Bed Steam Hydration Bath", "Therapeutic Acupressure Scalp Manipulation Massage", "Complimentary Wine or Champagne & Eye Mask"]
    },
    "2419340": {
      id: "2419340",
      name: "Wand curls",
      fullName: "Wand curls",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$50+",
      duration: "1 hr",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2419340",
      description: "Small , Medium or large sized want curls",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "2410829": {
      id: "2410829",
      name: "Sew in additional bundles more than 3 for full head",
      fullName: "Sew in additional bundles more than 3 for full head",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$25+",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2410829",
      description: "Additional bundles are $25.00 per bundle",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2419325": {
      id: "2419325",
      name: "Bundles 24 - 32 inches",
      fullName: "Bundles 24 - 32 inches",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$150+",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2419325",
      description: "Premium luxury virgin hair bundles in lengths 24 to 32 inches, available in straight, body wave, deep wave, or curly textures.",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2491320": {
      id: "2491320",
      name: "Loc repairs  with crochet hook/needle",
      fullName: "Loc repairs  with crochet hook/needle",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$50+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2491320",
      description: "Repairing of broken, weak or damaged locs up to 10",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "2458399": {
      id: "2458399",
      name: "Braid Refresh",
      fullName: "Braid Refresh",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$200+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2458399",
      description: "Remove perimeter of braids , wash and Refresh box braids in perimeter and top row of hair. Price is calculated by size of braids",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2414356": {
      id: "2414356",
      name: "Kids braids Natural hair",
      fullName: "Kids braids Natural hair",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$75+",
      duration: "2 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2414356",
      description: "Detangle hair that has been braided, uncombed or matted down for extended period of time. This price can decrease or increase according to the severity of matting and tangles",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2662034": {
      id: "2662034",
      name: "Color wig",
      fullName: "Color wig",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$175+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2662034",
      description: "Custom professional single process, balayage, or tonal coloring service for your 100% virgin human hair wig unit.",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2497586": {
      id: "2497586",
      name: "Kids freestyle braids with hair added",
      fullName: "Kids freestyle braids with hair added",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$150+",
      duration: "3 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2497586",
      description: "Includes wash , deep condition treatment, blow dry, scalp oil, medium sized cornrow freestyle , beads are optional\nSmaller sized cornrowsor  ( All hair is included with this service )",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2785158": {
      id: "2785158",
      name: "Invisible k tip install",
      fullName: "Invisible k tip install",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$3,500+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2785158",
      description: "This service includes wash, deep condition,  hair treatment, k tip installation 150 - 400 grams and gift bag with maintenance products",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "2757810": {
      id: "2757810",
      name: "Custom Wigs",
      fullName: "Custom Wigs",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$500",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2757810",
      description: "Wigs 12 inches -  30 inches\nMust have consultation to determine length and style for pricing",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2757802": {
      id: "2757802",
      name: "Bundles 12 - 22 inches",
      fullName: "Bundles 12 - 22 inches",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$125",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2757802",
      description: "High-grade 100% virgin human hair bundles in lengths 12 to 22 inches, full cuticle aligned for zero tangling and longevity.",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "2662073": {
      id: "2662073",
      name: "Jumbo knotless braids",
      fullName: "Jumbo knotless braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$200+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2662073",
      description: "Jumbo sized knotless box braids 4 - 15 braids",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "2662069": {
      id: "2662069",
      name: "remove lace closure or frontal",
      fullName: "remove lace closure or frontal",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$75",
      duration: "45 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2662069",
      description: "Removal of any closure install not done by me",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "3019709": {
      id: "3019709",
      name: "Instant Locs",
      fullName: "Instant Locs",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$750+",
      duration: "7 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3019709",
      description: "Instantly loc your hair with crochet hook technique",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3053917": {
      id: "3053917",
      name: "Half up half down",
      fullName: "Half up half down",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$200+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3053917",
      description: "Realistic cornrows with small pieces of hair fed in each braid. This service includes wash and deep condition ( hair is included)",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3041215": {
      id: "3041215",
      name: "Finger waves",
      fullName: "Finger waves",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$75",
      duration: "2 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3041215",
      description: "Classic vintage finger wave sculpting on short or relaxed hair using high-gloss styling foam, precision comb work, and shine glaze.",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "2988453": {
      id: "2988453",
      name: "Fulani / Tribal braids / Priestess braids",
      fullName: "Fulani / Tribal braids / Priestess braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$325+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/2988453",
      description: "Freestyle cornrow style with box braids in back with flip over design and intricate parting designs \n( Hair is included with this service and human hair curls)\n$75.00 additional for extra human hair curls\n( wash is included with this service)",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3073287": {
      id: "3073287",
      name: "Tape in extensions ( Hair included )",
      fullName: "Tape in extensions ( Hair included )",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$750+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3073287",
      description: "This service includes a luxury shampoo with steam treatment and trim if necessary , hair is matched to your hair with pre taped individual wefts, flattest install available can be worn in a very high ponytail \n14 - 22 inches  $750.00\n24 - 26 inches  $850.00\n28 - 30 inches  $1000.00\n32 - 34 inches  $1200.00",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "3105127": {
      id: "3105127",
      name: "Loc Retwist with style",
      fullName: "Loc Retwist with style",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$225+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3105127",
      description: "Loc wash, steam treatment, Retwist and choice of updo style, petals or barrels",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3032554": {
      id: "3032554",
      name: "Microloc retie with style",
      fullName: "Microloc retie with style",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$400+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3032554",
      description: "Microloc wash, steam hydration with conditioner , Retie with styleoption Updo, Braids Curls or Twists",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3129266": {
      id: "3129266",
      name: "Small box braids",
      fullName: "Small box braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$500+",
      duration: "8 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3129266",
      description: "Servoce icludes wash, depp condition, blow scalp oil, Small individual box braids bra length\n+ $50.00 waist length\n+ $100.00 booty length\n+ $150.00 thigh length\n+ $200.00 knee length\nBoho/Gypsy curls  synthetic - $50.00 additional \nHuman curls- $175.00 additional",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3007825": {
      id: "3007825",
      name: "Remove weave",
      fullName: "Remove weave",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$40+",
      duration: "1 hr",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3007825",
      description: "Remove regular sew in done by me",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "3082536": {
      id: "3082536",
      name: "Lace Closure Special with hair included",
      fullName: "Lace Closure Special with hair included",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$700+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3082536",
      description: "Wash,Deep condition with SteamTreatment , Install closure and 3 bundles any length up to 22 inches , Cut and Style (Hair is Included with this service)",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "3148715": {
      id: "3148715",
      name: "Hair Consultation",
      fullName: "Hair Consultation",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$0",
      duration: "15 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3148715",
      description: "Complimentary in-suite or virtual consultation to evaluate curl pattern, strand density, scalp health, and map out your optimal hair goals.",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "3231662": {
      id: "3231662",
      name: "Smedium box braids",
      fullName: "Smedium box braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$400+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3231662",
      description: "Service includes wash, depp condition, blow scalp oil, Smedium sized individual box braids bra length\n+ $50.00 waist length\n+ $100.00 booty length\n+ $150.00 thigh length\n+ $200.00 knee length\nBoho/Gypsy curls  synthetic - $50.00 additional \nHuman curls- $175.00 additional",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3372910": {
      id: "3372910",
      name: "Large knotless box braidsl",
      fullName: "Large knotless box braidsl",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$250+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3372910",
      description: "Large  braids back length\n+ $25.00 waist length\n+ $50.00 booty length\n+  $75.00 below the booty\n+ $100.00  knee length\nAdd boho hair included \n1 bundle curly hair - $125.00\n2 bundles curly hair - $250.00\nBora Bora / 3 bundles curly hair - $350.00\nBring your own hair will be half price",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3476101": {
      id: "3476101",
      name: "Wash, treatment and braid down for protective style",
      fullName: "Wash, treatment and braid down for protective style",
      category: "Head Spa & Treatments",
      categoryBadge: "\u2726 Scalp Revival",
      price: "$150+",
      duration: "2 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3476101",
      description: "Wash, condition and braiddown",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3441263": {
      id: "3441263",
      name: "Intensive treatment",
      fullName: "Intensive treatment",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$50+",
      duration: "45 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3441263",
      description: "Treatment for strengthening and conditioning hair once removing protective styles such as weaves, braids , faux Locs, crochet styles, etc\u2026",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3441260": {
      id: "3441260",
      name: "Hybrid Sew in with K tips",
      fullName: "Hybrid Sew in with K tips",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$500+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3441260",
      description: "Sew in Weave with K tips used in leaveout and or perimeter, this service includes wash and treatment",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "3441257": {
      id: "3441257",
      name: "2 strand  /Marley / Senegalese  Twists/ Passion twists",
      fullName: "2 strand  /Marley / Senegalese  Twists/ Passion twists",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$275+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3441257",
      description: "Large size twist with kinky / Marley  hair\nMedium - $375.00\nSmedium - $475.00\nSmall - $650.00\nAdd $50.00 for human hair boho curls\n\n+ $25.00 bra length\n+ $50.00 waist length \n+ $75.00 booty length\n+ $150.00 knee length",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3409943": {
      id: "3409943",
      name: "Wig Restoration",
      fullName: "Wig Restoration",
      category: "Wigs & Bundles",
      categoryBadge: "\u2726 Custom Units",
      price: "$200+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3409943",
      description: "This service includes the repair and or maintenance of used wig units that may need new closure/ closure repair/ tracks added/ detox/ detangling / washing and styling, price is according to all that must be done for restoration of unit",
      includes: ["Precision Knots Bleaching & Plucked Natural Hairline", "Custom Elastic Band & Comb Security Placement", "Scalp-Protective Braid Foundation & Melt", "High-Gloss Thermal Silk Finish & Custom Cut"]
    },
    "3476103": {
      id: "3476103",
      name: "Individual crochet, soft locs",
      fullName: "Individual crochet, soft locs",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$300+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3476103",
      description: "Faux loc styles",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3538043": {
      id: "3538043",
      name: "Tape in / Skin weft maintenance",
      fullName: "Tape in / Skin weft maintenance",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$300+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3538043",
      description: "This service includes clarifying wash,  conditioning,  tightening of any loose or slipping wefts and style which includes flat iron or drop curls",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "3951364": {
      id: "3951364",
      name: "Loc Detox with Hydration",
      fullName: "Loc Detox with Hydration",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$125+",
      duration: "1 hr",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3951364",
      description: "Relaxing detox using baking soda Masque followed by ACV rinse  or Lemon juice,  Scalp invigorating shampoo, with custom treatment followed by Steam Hydration with essential oils",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3859667": {
      id: "3859667",
      name: "Ponytail on natural hair",
      fullName: "Ponytail on natural hair",
      category: "Silk Press & Natural Hair",
      categoryBadge: "\u2726 Natural Crown",
      price: "$175+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3859667",
      description: "Wash flat iron and ponytail pinned in",
      includes: ["Custom Wash & Deep Micromist Steam Hydration", "Precision Tension Blowout & Split-End Care", "Low-Heat Ceramic Silk Press or Defined Style", "Featherweight Bounce & Anti-Humidity Shield"]
    },
    "3737434": {
      id: "3737434",
      name: "Microlink maintenance",
      fullName: "Microlink maintenance",
      category: "Weaves & Extensions",
      categoryBadge: "\u2726 Seamless Install",
      price: "$450+",
      duration: "2 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3737434",
      description: "Microlink extension wash , condition and tightening of any loose or slipping links with style flat iron or drop curls",
      includes: ["Flat Scalp-Protective Braid Foundation & Netting", "Seamless Undetectable Track or Strand Placement", "Precision Face-Framing Cut & Texture Blending", "Silken Thermal Styling & Scalp Comfort Finish"]
    },
    "3689305": {
      id: "3689305",
      name: "Microloc Retie after 8 week fee",
      fullName: "Microloc Retie after 8 week fee",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$100+",
      duration: "6 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3689305",
      description: "This fee is for clients that have went passed 8 weeks for Retie  9 weeks - not to exceed 4 months",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3821302": {
      id: "3821302",
      name: "Full loc color",
      fullName: "Full loc color",
      category: "Locs & Microlocs",
      categoryBadge: "\u2726 Loc Artistry",
      price: "$200+",
      duration: "3 hr 30 min",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3821302",
      description: "Full head color on locs",
      includes: ["Herbal Scalp Cleanse & Clarifying Soak", "Precision Palm Roll or Interlocking Technique", "Organic Botanical Scalp Elixir & Seal", "1-on-1 VIP Suite Care & Overhead Dryer"]
    },
    "3689313": {
      id: "3689313",
      name: "Large Box braids",
      fullName: "Large Box braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$200+",
      duration: "4 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3689313",
      description: "Large size box braids up to bra length",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    },
    "3737428": {
      id: "3737428",
      name: "Medium box braids",
      fullName: "Medium box braids",
      category: "Knotless & Braids",
      categoryBadge: "\u2726 Protective Styling",
      price: "$300+",
      duration: "5 hrs",
      styleseatUrl: "https://www.styleseat.com/m/p/724364/service/3737428",
      description: "Premium 1-on-1 private salon suite service by master stylist Shawnese Parker in Woodmere, NY.",
      includes: ["Zero-Tension Perimeter Protection Guarantee", "Razor-Clean Precision Parting & Seamless Feed-In", "Hydrating Scalp Mist & Botanical Braid Jam", "Hot Water Dip Seal & Organic Scalp Oil Wrap"]
    }
  };
  SERVICES_DATA["silk-press"] = SERVICES_DATA["2361734"];
  SERVICES_DATA["silk-press-overhaul"] = SERVICES_DATA["2361734"];
  SERVICES_DATA["knotless-braids"] = SERVICES_DATA["2361735"];
  SERVICES_DATA["boho-goddess"] = SERVICES_DATA["2388620"];
  SERVICES_DATA["blonding-balayage"] = SERVICES_DATA["1018155"];
  SERVICES_DATA["single-color"] = SERVICES_DATA["1018155"];
  SERVICES_DATA["loc-maintenance"] = SERVICES_DATA["2361717"];
  SERVICES_DATA["loc-styling"] = SERVICES_DATA["11628464"];
  SERVICES_DATA["sew-in"] = SERVICES_DATA["2388602"];
  SERVICES_DATA["mens-braids"] = SERVICES_DATA["2404871"];
  SERVICES_DATA["mens-grooming"] = SERVICES_DATA["2404871"];
  SERVICES_DATA["scalp-detox"] = SERVICES_DATA["11631680"];

  // Dedicated Home Services (House Calls Across Tri-State with Custom Pricing)
  SERVICES_DATA["home-services-elderly"] = {
    id: "home-services-elderly",
    name: "Tri-State In-Home Care (Elderly & Mobility House Calls)",
    fullName: "Tri-State In-Home Care (Elderly & Mobility House Calls)",
    category: "Home Services & House Calls",
    categoryBadge: "House Calls (NY/NJ/CT)",
    price: "Custom Pricing (Call to Inquire)",
    duration: "Custom Duration",
    styleseatUrl: "tel:3472381602",
    isCallOnly: true,
    description: "Compassionate, patient in-home hair care across New York, New Jersey & Connecticut for elderly individuals, seniors, and clients with limited mobility. Customers are required to call for custom pricing.",
    includes: [
      "Full In-Home Travel across Tri-State Area (NY, NJ, CT)",
      "Gentle Scalp Cleansing & Hydration Therapy in Bed or Chair",
      "Protective Braids, Twists, Natural Styling & Loc Care",
      "Dignified, Patient Care with Zero Rush",
      "Call (347) 238-1602 for Custom Quote & Scheduling"
    ]
  };

  SERVICES_DATA["home-services-bridal"] = {
    id: "home-services-bridal",
    name: "Bridal Party Hair (On-Location & Suite)",
    fullName: "Bridal Party Hair (On-Location Tri-State & In-Suite)",
    category: "Home Services & House Calls",
    categoryBadge: "Bridal & Events",
    price: "Custom Pricing (Call to Inquire)",
    duration: "Full Event / Entourage",
    styleseatUrl: "tel:3472381602",
    isCallOnly: true,
    description: "Specializing in bridal party hair, veil placement, and timeless crowns for the bride and entire entourage. Available on-location across the tri-state area. Customers are required to call for custom pricing.",
    includes: [
      "On-Location Bridal Suite, Hotel, or Venue Travel",
      "Bridal Updos, Veil & Hairpiece Securing",
      "Coordinated Styling for Bridesmaids & Mother of the Bride",
      "Call (347) 238-1602 for Custom Package Quote"
    ]
  };

  SERVICES_DATA["home-services-babyshower"] = {
    id: "home-services-babyshower",
    name: "Baby Shower & Milestone Celebration Hair",
    fullName: "Baby Shower & Milestone Celebration Hair",
    category: "Home Services & House Calls",
    categoryBadge: "Baby Showers",
    price: "Custom Pricing (Call to Inquire)",
    duration: "Custom Event",
    styleseatUrl: "tel:3472381602",
    isCallOnly: true,
    description: "Radiant glamour celebrating mothers-to-be. Gentle, comfortable crowns for baby showers, gender reveals, and family celebrations. Customers are required to call for custom pricing.",
    includes: [
      "On-Location or Private Suite Appointment",
      "Low-Tension, Comfortable Styling for Expecting Mothers",
      "Featherweight Silk Blowouts, Soft Waves & Updos",
      "Call (347) 238-1602 for Custom Quote"
    ]
  };

  SERVICES_DATA["home-services-photoshoot"] = {
    id: "home-services-photoshoot",
    name: "Photo Shoots & Editorial Production Styling",
    fullName: "Photo Shoots & Editorial Production Styling",
    category: "Home Services & House Calls",
    categoryBadge: "Editorial & Shoots",
    price: "Custom Pricing (Call to Inquire)",
    duration: "Half-Day / Full-Day",
    styleseatUrl: "tel:3472381602",
    isCallOnly: true,
    description: "Camera-ready hair artistry designed specifically for studio flash, camera lighting, and video production with zero flyaways and fast look changes on set. Customers are required to call for custom pricing.",
    includes: [
      "On-Set Production & Studio Travel",
      "Studio Flash & HD Camera Frizz-Free Defense",
      "Rapid Wardrobe & Hair Texture Changes",
      "Call (347) 238-1602 for Custom Day Rate & Half-Day Quote"
    ]
  };

  SERVICES_DATA["home-services"] = SERVICES_DATA["home-services-elderly"];
  SERVICES_DATA["house-calls"] = SERVICES_DATA["home-services-elderly"];
  SERVICES_DATA["bridal-party"] = SERVICES_DATA["home-services-bridal"];
  SERVICES_DATA["baby-shower"] = SERVICES_DATA["home-services-babyshower"];
  SERVICES_DATA["photo-shoot"] = SERVICES_DATA["home-services-photoshoot"];

  function findServiceData(keyOrName) {
    if (!keyOrName) return SERVICES_DATA['2361734'] || Object.values(SERVICES_DATA)[0];
    const raw = String(keyOrName).trim();
    const lower = raw.toLowerCase();

    // 1. Direct key match (by ID or legacy slug)
    if (SERVICES_DATA[raw]) return SERVICES_DATA[raw];
    if (SERVICES_DATA[lower]) return SERVICES_DATA[lower];

    // 2. Search by id, exact name or exact fullName
    for (const key in SERVICES_DATA) {
      const item = SERVICES_DATA[key];
      if (item && (item.id === raw || item.name.toLowerCase() === lower || item.fullName.toLowerCase() === lower)) {
        return item;
      }
    }

    // 3. Partial keyword matching
    for (const key in SERVICES_DATA) {
      const item = SERVICES_DATA[key];
      if (item) {
        const itemLower = item.name.toLowerCase();
        if (lower.includes(itemLower) || itemLower.includes(lower)) {
          return item;
        }
      }
    }

    // 4. Default fallback
    return SERVICES_DATA['2361734'] || Object.values(SERVICES_DATA)[0];
  }

  let serviceModalOverlay = document.querySelector('#serviceDetailModal');

  function ensureServiceModalExists() {
    serviceModalOverlay = document.querySelector('#serviceDetailModal');
    if (serviceModalOverlay) {
      bindServiceModalEvents();
      return serviceModalOverlay;
    }
    const modalHtml = `
      <div id="serviceDetailModal" class="service-detail-modal-overlay" aria-hidden="true" role="dialog" aria-labelledby="serviceDetailTitle">
        <div class="service-detail-modal-card">
          <button type="button" class="service-detail-close-btn" id="serviceDetailCloseBtn" aria-label="Close service details">✕</button>
          <div class="service-detail-info">
            <div>
              <div class="service-detail-meta-pills">
                <span class="service-pill-price" id="serviceDetailPrice">$175+</span>
                <span class="service-pill-time" id="serviceDetailDuration"> 3 hrs</span>
                <span class="service-detail-badge-chip" id="serviceDetailCategoryChip">✦ Signature Look</span>
                <span class="service-pill-vip">Private Suite VIP</span>
              </div>
              <h3 class="service-detail-title" id="serviceDetailTitle">Silk Press &amp; Steam Hydration</h3>
              <p class="service-detail-desc" id="serviceDetailDesc">
                Clarifying detox cleanse, deep moisture steam hydration bath, precision tension blow-dry, and low-heat ceramic silk press with high-gloss mirror finish.
              </p>
              <div class="service-detail-includes-box">
                <div class="service-includes-heading">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  What's Included in Your Suite Session:
                </div>
                <ul class="service-includes-ul" id="serviceDetailIncludes"></ul>
              </div>
              <div class="service-detail-guarantee">
                <span class="guarantee-icon">✦</span>
                <span>1-on-1 private VIP suite appointment • Never double-booked • Medical-grade ozone hydration</span>
              </div>
            </div>
            <div class="service-detail-actions">
              <a href="https://www.styleseat.com/m/v/stylist101" target="_blank" rel="noopener" class="btn-styleseat-book-now" id="serviceDetailStyleSeatBtn">
                <span>Book Service</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
              </a>
              <div class="service-detail-subactions">
                <span class="service-detail-suite-tag">1-on-1 VIP Suite • Woodmere, NY</span>
                <a href="tel:3472381602" class="service-call-link">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  Text / Call: (347) 238-1602
                </a>
              </div>
              <div class="service-styleseat-trust">
                <span>4.9 Stars • 270+ Verified Reviews on StyleSeat</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = modalHtml.trim();
    serviceModalOverlay = tempDiv.firstElementChild;
    document.body.appendChild(serviceModalOverlay);
    bindServiceModalEvents();
    return serviceModalOverlay;
  }

  function bindServiceModalEvents() {
    if (!serviceModalOverlay) return;
    const closeBtn = serviceModalOverlay.querySelector('#serviceDetailCloseBtn');
    if (closeBtn) closeBtn.onclick = closeServiceDetailModal;
    serviceModalOverlay.onclick = (e) => {
      if (e.target === serviceModalOverlay) closeServiceDetailModal();
    };
  }

  function openServiceDetailModal(keyOrName) {
    const modal = ensureServiceModalExists();
    const service = findServiceData(keyOrName);
    if (!service) return;

    const categoryChip = modal.querySelector('#serviceDetailCategoryChip');
    const price = modal.querySelector('#serviceDetailPrice');
    const duration = modal.querySelector('#serviceDetailDuration');
    const title = modal.querySelector('#serviceDetailTitle');
    const desc = modal.querySelector('#serviceDetailDesc');
    const includesList = modal.querySelector('#serviceDetailIncludes');
    const styleseatBtn = modal.querySelector('#serviceDetailStyleSeatBtn');

    if (categoryChip) categoryChip.textContent = service.categoryBadge || service.category;
    if (price) price.textContent = service.price;
    if (duration) duration.textContent = ' ' + service.duration;
    if (title) title.textContent = service.fullName || service.name;
    if (desc) desc.textContent = service.description;

    if (includesList && Array.isArray(service.includes)) {
      includesList.innerHTML = service.includes.map(inc => `
        <li class="service-includes-li">
          <span class="service-includes-check">✓</span>
          <span>${inc}</span>
        </li>
      `).join('');
    }

    if (styleseatBtn) {
      if (service.isCallOnly || (service.price && service.price.toLowerCase().includes('custom'))) {
        styleseatBtn.href = 'tel:3472381602';
        styleseatBtn.innerHTML = `
          <span>Call for Custom Pricing: (347) 238-1602</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        `;
      } else {
        styleseatBtn.href = service.styleseatUrl || 'https://www.styleseat.com/m/v/stylist101';
        styleseatBtn.innerHTML = `
          <span>Book on StyleSeat</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
        `;
      }
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeServiceDetailModal() {
    if (!serviceModalOverlay) return;
    serviceModalOverlay.classList.remove('active');
    if (!bookingModal || !bookingModal.classList.contains('active')) {
      document.body.style.overflow = '';
    }
  }

  // General Booking Modal Trigger & Logic
  const bookingModal = document.querySelector('.booking-modal-overlay');
  const bookingCloseBtn = document.querySelector('.booking-close-btn');
  const bookingServiceSelect = document.querySelector('#booking-service-select');
  const bookingForm = document.querySelector('.booking-form');

  function updateBookingStyleSeatBtn() {
    const modalStyleSeatBtn = document.querySelector('#modalStyleSeatBtn');
    if (!modalStyleSeatBtn) return;
    const currentVal = bookingServiceSelect ? bookingServiceSelect.value : '';
    if (currentVal) {
      const sData = findServiceData(currentVal);
      if (sData.isCallOnly || (sData.price && sData.price.toLowerCase().includes('custom'))) {
        modalStyleSeatBtn.href = 'tel:3472381602';
        modalStyleSeatBtn.innerHTML = `Call for Custom Pricing <span>↗</span>`;
        modalStyleSeatBtn.title = `Call (347) 238-1602 for custom pricing on ${sData.name}`;
      } else {
        modalStyleSeatBtn.href = sData.styleseatUrl || 'https://www.styleseat.com/m/v/stylist101';
        modalStyleSeatBtn.innerHTML = `Book on StyleSeat <span>↗</span>`;
        modalStyleSeatBtn.title = `Book ${sData.name} live on StyleSeat`;
      }
    } else {
      modalStyleSeatBtn.href = 'https://www.styleseat.com/m/v/stylist101';
      modalStyleSeatBtn.innerHTML = `Book on StyleSeat <span>↗</span>`;
      modalStyleSeatBtn.title = 'Book appointment live on StyleSeat';
    }
  }

  if (bookingServiceSelect) {
    const categories = {};
    for (const key in SERVICES_DATA) {
      if (!/^\d+$/.test(key)) continue;
      const item = SERVICES_DATA[key];
      const cat = item.category || 'Other Services';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    }
    let optHtml = '<option value="">-- Choose a Service --</option>';
    for (const catName in categories) {
      optHtml += `<optgroup label="${catName}">`;
      categories[catName].forEach(s => {
        optHtml += `<option value="${s.id}">${s.name} (${s.price})</option>`;
      });
      optHtml += '</optgroup>';
    }
    bookingServiceSelect.innerHTML = optHtml;
    bookingServiceSelect.addEventListener('change', updateBookingStyleSeatBtn);
  }

  function openBookingModal(preselectedService) {
    if (!bookingModal) return;
    if (bookingServiceSelect && preselectedService) {
      let matched = false;
      for (let i = 0; i < bookingServiceSelect.options.length; i++) {
        const optVal = bookingServiceSelect.options[i].value.toLowerCase();
        if (optVal.includes(preselectedService.toLowerCase()) || preselectedService.toLowerCase().includes(optVal)) {
          bookingServiceSelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) {
        bookingServiceSelect.value = preselectedService;
      }
    }
    updateBookingStyleSeatBtn();
    bookingModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeBookingModal() {
    if (!bookingModal) return;
    bookingModal.classList.remove('active');
    if (!serviceModalOverlay || !serviceModalOverlay.classList.contains('active')) {
      document.body.style.overflow = '';
    }
  }

  // 1. Service card buttons -> Open Rich Service Detail Popup (Event Delegation for all 99+ services)
  document.addEventListener('click', (e) => {
    const serviceBtn = e.target.closest('.btn-book-service, [data-service-key]');
    if (serviceBtn) {
      e.preventDefault();
      closeLightbox();
      const serviceKey = serviceBtn.getAttribute('data-service-key') || serviceBtn.getAttribute('data-service') || '';
      openServiceDetailModal(serviceKey);
    }
  });

  // 2. General booking buttons (Header, Mobile Drawer, Floating Pill, Hero CTA) -> Open StyleSeat Live Calendar
  document.querySelectorAll('.open-booking-modal, .btn-hero-main, .lightbox-book-btn').forEach(btn => {
    if (btn.classList.contains('btn-book-service') || btn.hasAttribute('data-service-key')) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeLightbox();
      window.open('https://www.styleseat.com/m/v/stylist101', '_blank', 'noopener');
    });
  });

  if (bookingCloseBtn) {
    bookingCloseBtn.addEventListener('click', closeBookingModal);
  }

  if (bookingModal) {
    bookingModal.addEventListener('click', (e) => {
      if (e.target === bookingModal) closeBookingModal();
    });
  }

  // Form submission handler with validation
  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.querySelector('#client-name');
      const phoneInput = document.querySelector('#client-phone');
      const name = nameInput?.value?.trim();
      const phone = phoneInput?.value?.trim();
      const service = bookingServiceSelect?.value;
      const date = document.querySelector('#booking-date')?.value;
      const sData = findServiceData(service);

      let existingAlert = bookingForm.querySelector('.form-error-alert');
      if (existingAlert) existingAlert.remove();

      if (!name || !phone) {
        const err = document.createElement('div');
        err.className = 'form-error-alert';
        err.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Please provide your full name and phone number for SMS confirmation.`;
        bookingForm.insertBefore(err, bookingForm.firstChild);
        if (!name && nameInput) nameInput.focus();
        else if (!phone && phoneInput) phoneInput.focus();
        return;
      }

      // Show instant confirmation
      bookingForm.innerHTML = `
        <div style="text-align: center; padding: 24px 0;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(216, 27, 96, 0.1); color: var(--pink-primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 8px;">Appointment Request Received!</h3>
          <p style="color: var(--text-secondary); font-size: 14.5px; margin-bottom: 20px; line-height: 1.5;">
            Thank you, <strong>${name}</strong>! Shawnese will contact you at <strong>${phone}</strong> to confirm your suite appointment for <strong>${service || 'Hair Service'}</strong>${date ? ` on <strong>${date}</strong>` : ''}.<br>
            <span style="font-size: 13px; color: var(--pink-primary); font-weight: 600;">Want immediate calendar confirmation? Book in real-time below:</span>
          </p>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px;">
            <a href="${sData.styleseatUrl || 'https://www.styleseat.com/m/v/stylist101'}" target="_blank" rel="noopener" class="btn-action-solid" style="display: inline-flex; width: auto;">
              Book Instantly on StyleSeat ↗
            </a>
            <a href="tel:3472381602" class="btn-action-outline" style="display: inline-flex; width: auto;">
              Call: (347) 238-1602
            </a>
          </div>
          <button type="button" class="btn-action-outline close-after-submit" style="display: inline-flex; width: auto; font-size: 13px; padding: 6px 16px; opacity: 0.8;">
            Close Window
          </button>
        </div>
      `;

      bookingForm.querySelector('.close-after-submit')?.addEventListener('click', closeBookingModal);
    });
  }

  // 12. Luxury Story & Suite Perks Modal Controller
  const storyModal = document.getElementById('storyDetailModal');
  const closeStoryBtn = document.getElementById('closeStoryModalBtn');
  const storyTabBtns = document.querySelectorAll('.story-tab-btn');
  const storyTabPanes = document.querySelectorAll('.story-tab-pane');

  function openStoryModal(targetTab = 'tab-bio') {
    if (!storyModal) return;
    storyModal.classList.add('active');
    storyModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Switch to target tab
    storyTabBtns.forEach(btn => {
      const isTarget = btn.getAttribute('data-target') === targetTab;
      btn.classList.toggle('active', isTarget);
      if (isTarget) {
        btn.style.background = 'var(--grad-pink-purple)';
        btn.style.color = '#FFFFFF';
        btn.style.border = 'none';
      } else {
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.color = '#E2DFED';
        btn.style.border = '1px solid rgba(255,255,255,0.15)';
      }
    });

    storyTabPanes.forEach(pane => {
      pane.style.display = pane.id === targetTab ? 'block' : 'none';
    });
  }

  function closeStoryModal() {
    if (!storyModal) return;
    storyModal.classList.remove('active');
    storyModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.open-story-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-tab') === 'tab-suite' ? 'tab-suite' : 'tab-bio';
      openStoryModal(target);
    });
  });

  closeStoryBtn?.addEventListener('click', closeStoryModal);
  storyModal?.addEventListener('click', (e) => {
    if (e.target === storyModal) closeStoryModal();
  });

  storyTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      openStoryModal(target);
    });
  });

  // Close modals on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeBookingModal();
      closeServiceDetailModal();
      closeStoryModal();
    }
  });

  // Smooth scroll for nav anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetElem = document.querySelector(targetId);
        if (targetElem) {
          e.preventDefault();
          targetElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });

  // 10. Scroll Reveal & Section Transitions (Smooth Framer Motion Style)
  const isServicesPage = window.location.pathname.includes('services.html') || !!document.querySelector('#servicesCatalogGrid');
  const revealElements = document.querySelectorAll(
    isServicesPage 
      ? '.cta-banner-section.reveal-on-scroll' 
      : '.reveal-on-scroll:not(.services-catalog-section):not(.subpage-hero), .reveal-stagger'
  );
  const revealObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        entry.target.classList.add('is-revealed');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

  revealElements.forEach(el => {
    el.classList.add('reveal-on-scroll');
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 50 && rect.bottom > 0) {
      el.classList.add('revealed');
      el.classList.add('is-revealed');
    } else {
      revealObserver.observe(el);
    }
  });

  // Explicitly guarantee immediate 100% visibility for services and subpages
  document.querySelectorAll('.subpage-hero, .services-catalog-section, .services-expanded-grid, .service-card-expanded').forEach(el => {
    el.classList.add('revealed', 'is-revealed');
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    el.style.transform = 'none';
  });

  // 11. Featured Products Slider Controller (Smooth, Fast Luxury Carousel)
  function initFeaturedProductsSlider() {
    const sliderTrack = document.getElementById('productSliderTrack');
    const slides = document.querySelectorAll('.product-slide-item');
    const prevBtn = document.getElementById('productPrevBtn');
    const nextBtn = document.getElementById('productNextBtn');
    const counterDisplay = document.getElementById('currentSlideDisplay');
    const totalDisplay = document.getElementById('totalSlideDisplay');
    const carouselDots = document.querySelectorAll('#productCarouselDots .carousel-dot');
    const pillTabs = document.querySelectorAll('#productQuickSelectorBar .product-pill-tab');
    const viewport = document.getElementById('productSliderViewport');
    const shopSection = document.getElementById('shop');

    if (!sliderTrack || !slides.length) return;

    const totalSlides = slides.length;
    let currentIndex = 0;
    let autoplayTimer = null;
    const AUTOPLAY_INTERVAL = 6000;

    if (totalDisplay) {
      totalDisplay.textContent = String(totalSlides).padStart(2, '0');
    }

    function goToSlide(targetIndex) {
      currentIndex = (targetIndex + totalSlides) % totalSlides;

      // Translate track smoothly with GPU acceleration
      sliderTrack.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;

      // Update counter
      if (counterDisplay) {
        counterDisplay.textContent = String(currentIndex + 1).padStart(2, '0');
      }

      // Update normal carousel pagination dots
      carouselDots.forEach((dot, idx) => {
        const isActive = idx === currentIndex;
        dot.classList.toggle('active', isActive);
        dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Update Quick Selector pill tabs
      const selectorBar = document.getElementById('productQuickSelectorBar');
      pillTabs.forEach((tab, idx) => {
        const isActive = idx === currentIndex;
        tab.classList.toggle('active', isActive);
        if (isActive && selectorBar) {
          const barRect = selectorBar.getBoundingClientRect();
          const tabRect = tab.getBoundingClientRect();
          const targetLeft = selectorBar.scrollLeft + (tabRect.left - barRect.left) - (barRect.width / 2) + (tabRect.width / 2);
          selectorBar.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
      });
    }

    function startAutoplay() {
      stopAutoplay();
      autoplayTimer = setInterval(() => {
        goToSlide(currentIndex + 1);
      }, AUTOPLAY_INTERVAL);
    }

    function stopAutoplay() {
      if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
      }
    }

    // Prev / Next button bindings
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        goToSlide(currentIndex - 1);
        startAutoplay();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        goToSlide(currentIndex + 1);
        startAutoplay();
      });
    }

    // Carousel dots click bindings
    carouselDots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        goToSlide(idx);
        startAutoplay();
      });
    });

    // Pill tab click bindings
    pillTabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => {
        goToSlide(idx);
        startAutoplay();
      });
    });

    // Pause autoplay on mouse hover over viewport or pill bar
    if (viewport) {
      viewport.addEventListener('mouseenter', stopAutoplay);
      viewport.addEventListener('mouseleave', startAutoplay);
    }

    // Touch and swipe gesture support for mobile & tablet (smooth & fast)
    if (viewport) {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;
      let isTrackingTouch = false;

      viewport.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length > 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = performance.now();
        isTrackingTouch = true;
        stopAutoplay();
      }, { passive: true });

      viewport.addEventListener('touchend', (e) => {
        if (!isTrackingTouch) return;
        isTrackingTouch = false;
        startAutoplay();

        if (!e.changedTouches || !e.changedTouches.length) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        const duration = performance.now() - touchStartTime;

        // Valid swipe if horizontal motion is dominant
        const isHorizontal = Math.abs(diffX) > Math.abs(diffY) * 0.6;
        const hasDistance = Math.abs(diffX) >= 28;
        const isQuickFlick = duration < 320 && Math.abs(diffX) >= 18 && isHorizontal;

        if ((hasDistance && isHorizontal) || isQuickFlick) {
          if (diffX < 0) {
            goToSlide(currentIndex + 1);
          } else {
            goToSlide(currentIndex - 1);
          }
        }
      }, { passive: true });

      viewport.addEventListener('touchcancel', () => {
        isTrackingTouch = false;
        startAutoplay();
      }, { passive: true });
    }

    // Keyboard navigation when user is focused within the section
    if (shopSection) {
      shopSection.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          goToSlide(currentIndex - 1);
          startAutoplay();
        } else if (e.key === 'ArrowRight') {
          goToSlide(currentIndex + 1);
          startAutoplay();
        }
      });
    }

    // Only run autoplay when shop section is visible on screen
    if ('IntersectionObserver' in window && shopSection) {
      const shopObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            startAutoplay();
          } else {
            stopAutoplay();
          }
        });
      }, { threshold: 0.15 });
      shopObserver.observe(shopSection);
    } else {
      startAutoplay();
    }

    // Initialize first slide
    goToSlide(0);
  }

  // 10. Shopping Cart Notice & Toast Handling
  // 10. Luxury E-Commerce Cart Drawer & Real-Time Inventory System
  function initCartNotice() {
    const STORAGE_KEY_CART = 'odh_cart_v1';
    const STORAGE_KEY_INVENTORY = 'odh_inventory_v1';
    const STORAGE_KEY_ORDERS = 'odh_orders_v1';

    // Seed inventory matching admin portal
    const DEFAULT_INVENTORY = [
      { id: 'loc-buffet-bundle-package', title: 'Loc Buffet Bundle Package', price: 99.99, stock: 12, image: 'assets/shop/loc-buffet-bundle-package-enhanced.jpg' },
      { id: 'xxxtra-strength-regrowth-serum', title: 'Xxxtra Strength Regrowth Serum', price: 25.00, stock: 24, image: 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg' },
      { id: 'anti-itch-dandruff-growth-serum', title: 'Anti Itch Dandruff Growth Serum', price: 20.00, stock: 18, image: 'assets/shop/anti-itch-dandruff-growth-serum-enhanced.jpg' },
      { id: 'control-freak-edge-polish', title: 'ICY Edge Glaze', price: 20.00, stock: 30, image: 'assets/shop/control-freak-edge-polish-enhanced.jpg' },
      { id: 'grip-and-glide-braid-jam', title: 'Grip and Glide Braid Jam', price: 15.00, stock: 20, image: 'assets/shop/grip-and-glide-braid-jam-enhanced.jpg' },
      { id: 'aloe-rose-water-spritzer', title: 'Aloe Rose Water Spritzer', price: 25.00, stock: 15, image: 'assets/shop/aloe-rose-water-spritzer-enhanced.jpg' },
      { id: 'loc-butta-sauce', title: 'Loc Butta Sauce', price: 25.00, stock: 14, image: 'assets/shop/loc-butta-sauce-enhanced.jpg' },
      { id: 'citrus-quench-clarifying-shampoo', title: 'Citrus Quench Clarifying Shampoo', price: 25.00, stock: 12, image: 'assets/shop/citrus-quench-clarifying-shampoo-enhanced.jpg' },
      { id: 'citrus-quench-hydrating-conditioner', title: 'Citrus Quench Hydrating Conditioner', price: 25.00, stock: 12, image: 'assets/shop/citrus-quench-hydrating-conditioner-enhanced.jpg' },
      { id: 'off-da-hook-oil-drip-comb', title: 'Off Da Hook Oil Drip Comb', price: 19.99, stock: 10, image: 'assets/shop/off-da-hook-oil-drip-comb-enhanced.jpg' },
      { id: 'the-children-s-line', title: "Perfect Paige's Unicorn Magic Hair System", price: 49.99, stock: 8, image: 'assets/shop/the-children-s-line-enhanced.jpg' },
      { id: 'fully-loaded-regrowth-system', title: 'Fully Loaded Regrowth System', price: 100.00, stock: 7, image: 'assets/shop/fully-loaded-regrowth-system-enhanced.jpg' }
    ];

    function getInventory() {
      const stored = localStorage.getItem(STORAGE_KEY_INVENTORY);
      if (stored) {
        try { return JSON.parse(stored); } catch (e) {}
      }
      localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(DEFAULT_INVENTORY));
      return DEFAULT_INVENTORY;
    }

    function saveInventory(inv) {
      localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(inv));
    }

    function getCart() {
      const stored = localStorage.getItem(STORAGE_KEY_CART);
      if (stored) {
        try { return JSON.parse(stored); } catch (e) {}
      }
      return [];
    }

    function saveCart(cart) {
      localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
      updateBadges();
      renderCartDrawer();
    }

    function updateBadges() {
      const cart = getCart();
      const count = cart.reduce((acc, item) => acc + (item.quantity || 1), 0);
      document.querySelectorAll('.nav-cart-badge, #cartDrawerBadge').forEach(el => {
        el.textContent = count;
        if (count > 0) {
          el.style.transform = 'scale(1.2)';
          setTimeout(() => el.style.transform = 'scale(1)', 250);
        }
      });
      const navCartBtn = document.getElementById('navCartBtn');
      if (navCartBtn) {
        navCartBtn.setAttribute('aria-label', `Shopping Cart (${count} items)`);
      }
    }

    function ensureDrawerMarkup() {
      if (document.getElementById('cartDrawerOverlay')) return;

      const overlay = document.createElement('div');
      overlay.className = 'cart-drawer-overlay';
      overlay.id = 'cartDrawerOverlay';
      overlay.innerHTML = `
        <div class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="Shopping Cart">
          <div class="cart-drawer-header">
            <div class="cart-drawer-title">
              <span>Your Crown Bag</span>
              <span class="cart-badge-count" id="cartDrawerBadge">0</span>
            </div>
            <button type="button" class="cart-drawer-close" id="cartDrawerCloseBtn" aria-label="Close cart">&times;</button>
          </div>
          <div class="cart-drawer-body" id="cartDrawerBody"></div>
          <div class="cart-drawer-footer" id="cartDrawerFooter">
            <div class="cart-subtotal-row">
              <span class="cart-subtotal-label">Subtotal</span>
              <span class="cart-subtotal-amount" id="cartSubtotalAmount">$0.00</span>
            </div>
            <div class="cart-shipping-note">Taxes &amp; priority shipping calculated at checkout.</div>
            <button type="button" class="btn-cart-checkout" id="cartCheckoutBtn">
              <span>Proceed to Secure Checkout</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
            <div class="cart-payment-methods">
              <span>Visa</span> • <span>Mastercard</span> • <span>Amex</span> • <span>Apple Pay</span> • <span>Google Pay</span> • <span>Stripe Verified</span>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCart();
      });
      const closeBtn = document.getElementById('cartDrawerCloseBtn');
      if (closeBtn) closeBtn.addEventListener('click', closeCart);

      const checkoutBtn = document.getElementById('cartCheckoutBtn');
      if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
    }

    function openCart() {
      ensureDrawerMarkup();
      renderCartDrawer();
      const overlay = document.getElementById('cartDrawerOverlay');
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeCart() {
      const overlay = document.getElementById('cartDrawerOverlay');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    function renderCartDrawer() {
      ensureDrawerMarkup();
      const body = document.getElementById('cartDrawerBody');
      const subtotalEl = document.getElementById('cartSubtotalAmount');
      const checkoutBtn = document.getElementById('cartCheckoutBtn');
      if (!body) return;

      const cart = getCart();

      if (cart.length === 0) {
        body.innerHTML = `
          <div class="cart-empty-state">
            <div class="cart-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            </div>
            <h4 style="font-size:16px; font-weight:800; color:#FFFFFF; margin:0;">Your Bag is Empty</h4>
            <p style="font-size:13px; color:#A39EB2; margin:0; line-height:1.5;">Explore our handcrafted botanical hair care and regrowth formulas.</p>
            <a href="shop.html" class="btn-action-solid" style="margin-top:8px;" id="shopFormulasEmptyBtn">Shop Crown Formulas</a>
          </div>
        `;
        const emptyShopBtn = document.getElementById('shopFormulasEmptyBtn');
        if (emptyShopBtn) {
          emptyShopBtn.addEventListener('click', () => {
            closeCart();
          });
        }
        if (subtotalEl) subtotalEl.textContent = '$0.00';
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
      }

      if (checkoutBtn) checkoutBtn.disabled = false;

      let subtotal = 0;
      body.innerHTML = cart.map((item, index) => {
        const itemTotal = (parseFloat(item.price) || 0) * (item.quantity || 1);
        subtotal += itemTotal;
        return `
          <div class="cart-item" data-index="${index}">
            <img src="${item.image || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg'}" alt="${item.title}" class="cart-item-img" onerror="this.src='assets/logo-emblem.jpg'">
            <div class="cart-item-info">
              <div>
                <div class="cart-item-title">${item.title}</div>
                ${item.variant ? `<div class="cart-item-variant">${item.variant}</div>` : ''}
              </div>
              <div class="cart-item-bottom">
                <div class="cart-qty-controls">
                  <button type="button" class="cart-qty-btn cart-qty-dec" data-index="${index}" aria-label="Decrease quantity">-</button>
                  <span class="cart-qty-val">${item.quantity || 1}</span>
                  <button type="button" class="cart-qty-btn cart-qty-inc" data-index="${index}" aria-label="Increase quantity">+</button>
                </div>
                <div class="cart-item-price">$${itemTotal.toFixed(2)}</div>
              </div>
            </div>
            <button type="button" class="cart-item-remove" data-index="${index}" aria-label="Remove item">&times;</button>
          </div>
        `;
      }).join('');

      if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

      body.querySelectorAll('.cart-qty-dec').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          const c = getCart();
          if (c[idx]) {
            if (c[idx].quantity > 1) {
              c[idx].quantity -= 1;
            } else {
              c.splice(idx, 1);
            }
            saveCart(c);
          }
        });
      });

      body.querySelectorAll('.cart-qty-inc').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          const c = getCart();
          if (c[idx]) {
            c[idx].quantity = (c[idx].quantity || 1) + 1;
            saveCart(c);
          }
        });
      });

      body.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          const c = getCart();
          if (c[idx]) {
            c.splice(idx, 1);
            saveCart(c);
          }
        });
      });
    }

    const CANONICAL_PRODUCT_IDS = {
      'loc-buffet-bundle-package': 'loc-buffet-bundle-package',
      'xxxtra-strength-regrowth-serum': 'xxxtra-strength-regrowth-serum',
      'anti-itch-dandruff-growth-serum': 'anti-itch-dandruff-growth-serum',
      'control-freak-edge-polish': 'control-freak-edge-polish',
      'icy-edge-glaze': 'control-freak-edge-polish',
      'grip-and-glide-braid-jam': 'grip-and-glide-braid-jam',
      'aloe-rose-water-spritzer': 'aloe-rose-water-spritzer',
      'loc-butta-sauce': 'loc-butta-sauce',
      'citrus-quench-clarifying-shampoo': 'citrus-quench-clarifying-shampoo',
      'citrus-quench-hydrating-conditioner': 'citrus-quench-hydrating-conditioner',
      'off-da-hook-oil-drip-comb': 'off-da-hook-oil-drip-comb',
      'the-children-s-line': 'the-children-s-line',
      'perfect-paige-s-unicorn-magic-hair-system': 'the-children-s-line',
      'fully-loaded-regrowth-system': 'fully-loaded-regrowth-system'
    };

    function addToCart(product) {
      const cart = getCart();
      const existingIdx = cart.findIndex(i => i.title === product.title && i.variant === product.variant);

      let rawSlug = product.id || product.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const canonicalId = CANONICAL_PRODUCT_IDS[rawSlug] || rawSlug;

      if (existingIdx > -1) {
        cart[existingIdx].quantity = (cart[existingIdx].quantity || 1) + 1;
      } else {
        cart.push({
          id: canonicalId,
          title: product.title,
          variant: product.variant || '',
          price: parseFloat(product.price.toString().replace(/[^0-9.]/g, '')) || 25.00,
          image: product.image || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg',
          quantity: 1
        });
      }

      saveCart(cart);
      openCart();
    }

    async function handleCheckout() {
      const cart = getCart();
      if (cart.length === 0) return;

      const checkoutBtn = document.getElementById('cartCheckoutBtn');
      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = `<span>Connecting to Secure Gateway...</span>`;
      }

      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: cart })
        });

        const data = await response.json();

        if (data && data.success && data.url) {
          window.location.href = data.url;
          return;
        }

        alert(data.error || 'Payment gateway is currently undergoing maintenance. Please call the salon directly at (347) 238-1602 to complete your order.');
      } catch (err) {
        console.error('Checkout error:', err);
        alert('Network communication error. Please check your connection or contact Off Da Hook at (347) 238-1602.');
      } finally {
        if (checkoutBtn) {
          checkoutBtn.disabled = false;
          checkoutBtn.innerHTML = `<span>Proceed to Secure Checkout</span> <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
        }
      }
    }

    async function checkStripePaymentReturn() {
      if (!window.location.search) return;
      const urlParams = new URLSearchParams(window.location.search);
      const isOrderSuccess = urlParams.get('order') === 'success';
      const sessionId = urlParams.get('session_id');

      if (isOrderSuccess && sessionId) {
        try {
          const res = await fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`);
          const data = await res.json();

          if (data && data.success && data.verified) {
            localStorage.removeItem(STORAGE_KEY_CART);
            updateBadges();

            if (data.order_persisted && data.order) {
              showOrderConfirmation(data.order);
            } else {
              showPendingOrderConfirmation(data);
            }
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            alert('Your checkout session could not be verified by Stripe. If your card was charged, please contact the salon at (347) 238-1602.');
          }
        } catch (e) {
          console.error('Session verification error:', e);
        }
      } else if (urlParams.get('order') === 'cancelled') {
        alert('Your checkout was cancelled. Your items have been saved in your crown bag.');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    function showPendingOrderConfirmation(data) {
      let modal = document.getElementById('clientOrderPendingModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'clientOrderPendingModal';
        modal.className = 'admin-modal-overlay';
        modal.innerHTML = `
          <div class="admin-modal-card" style="max-width:540px; text-align:center;">
            <div style="width:54px; height:54px; border-radius:50%; background:rgba(245,158,11,0.15); color:#F59E0B; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <h3 style="font-size:22px; font-weight:800; color:#FFFFFF; margin-bottom:8px;">Payment Verified!</h3>
            <p style="font-size:14px; color:#A39EB2; margin-bottom:16px;">
              Your payment has been successfully confirmed by Stripe. Your order is finalizing in our salon fulfillment system.
            </p>
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:16px; text-align:left; font-size:13px; margin-bottom:20px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                <span style="color:#8E8A9F;">Stripe Reference:</span>
                <span style="color:#FFFFFF; font-family:monospace;" id="pendingSessionRef"></span>
              </div>
              <div style="display:flex; justify-content:space-between; font-weight:700;">
                <span style="color:#8E8A9F;">Total Verified:</span>
                <span style="color:var(--pink-light);" id="pendingTotalPaid"></span>
              </div>
            </div>
            <p style="font-size:12px; color:#8E8A9F; margin-bottom:20px;">
              Your confirmation receipt is being sent to your email. If you need immediate assistance, call Master Stylist Shawnese Parker directly at (347) 238-1602.
            </p>
            <button type="button" class="btn-action-solid" style="width:100%; justify-content:center;" id="closePendingOrderBtn">
              Return to Off Da Hook
            </button>
          </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('closePendingOrderBtn').addEventListener('click', () => {
          modal.classList.remove('active');
        });
      }

      document.getElementById('pendingSessionRef').textContent = data.session_ref || (data.session_id || '').slice(-12);
      document.getElementById('pendingTotalPaid').textContent = `$${parseFloat(data.amount_total || 0).toFixed(2)} USD`;
      modal.classList.add('active');
    }

    function showOrderConfirmation(order) {
      let modal = document.getElementById('clientOrderConfirmModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'clientOrderConfirmModal';
        modal.className = 'admin-modal-overlay';
        modal.innerHTML = `
          <div class="admin-modal-card" style="max-width:540px; text-align:center;">
            <div style="width:54px; height:54px; border-radius:50%; background:rgba(16,185,129,0.15); color:#10B981; display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h3 style="font-size:22px; font-weight:800; color:#FFFFFF; margin-bottom:8px;">Crown Order Confirmed!</h3>
            <p style="font-size:14px; color:#A39EB2; margin-bottom:20px;">
              Thank you, <strong style="color:#FFFFFF;" id="confirmCustomerName"></strong>. Your order <strong style="color:var(--pink-light);" id="confirmOrderId"></strong> has been received.
            </p>
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:16px; text-align:left; font-size:13px; margin-bottom:24px;" id="confirmOrderDetails"></div>
            <p style="font-size:12px; color:#8E8A9F; margin-bottom:20px;">
              A full itemized order receipt has been dispatched to your email. You can also monitor your tracking details with our suite concierge at (347) 238-1602.
            </p>
            <button type="button" class="btn-action-solid" style="width:100%; justify-content:center;" id="closeConfirmOrderBtn">
              Return to Off Da Hook
            </button>
          </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('closeConfirmOrderBtn').addEventListener('click', () => {
          modal.classList.remove('active');
        });
      }

      const escapeConfirmHtml = (str) => String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const customerName = order.customer_name || order.customerName || 'Valued Crown Client';
      const orderId = order.id || 'ODH-ORDER';
      const total = parseFloat(order.total_amount || order.totalAmount || 0);
      const fulfillmentStatus = order.fulfillmentStatus || order.fulfillment_status || 'Pending';
      const isBackordered = fulfillmentStatus === 'Backordered_Action_Required';
      const shippingAddress = typeof order.shipping_address === 'string'
        ? order.shipping_address
        : (order.shippingAddress || 'Shipping details on file with Stripe');

      document.getElementById('confirmCustomerName').textContent = customerName;
      document.getElementById('confirmOrderId').textContent = orderId;

      const itemsHtml = (order.items || []).map(i => {
        const qty = Number(i.qty || i.quantity || 1);
        const price = parseFloat(i.price || 0);
        return `
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span>${qty}x ${escapeConfirmHtml(i.title || 'Crown Formula')} ${i.variant ? '(' + escapeConfirmHtml(i.variant) + ')' : ''}</span>
            <span style="font-weight:700;">$${(price * qty).toFixed(2)}</span>
          </div>
        `;
      }).join('');

      const backorderNotice = isBackordered ? `
        <div style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.35); border-radius:6px; padding:10px; margin-bottom:12px; color:#FCD34D; font-size:12.5px;">
          <strong>Backorder Notice:</strong> Payment was confirmed, however one or more formulas are temporarily low on inventory. Master Stylist Shawnese Parker has been notified and will contact you shortly.
        </div>
      ` : '';

      document.getElementById('confirmOrderDetails').innerHTML = `
        ${backorderNotice}
        <div style="border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:10px; margin-bottom:10px;">
          <div style="font-size:11px; text-transform:uppercase; color:#8E8A9F;">Shipping Destination:</div>
          <div style="color:#FFFFFF; font-weight:600;">${escapeConfirmHtml(shippingAddress)}</div>
        </div>
        ${itemsHtml}
        <div style="display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px; margin-top:10px; font-weight:800; font-size:14.5px;">
          <span>Total Paid:</span>
          <span style="color:var(--pink-light);">$${total.toFixed(2)} USD</span>
        </div>
      `;

      modal.classList.add('active');
    }

    function applyStockToCards() {
      const inv = getInventory();
      document.querySelectorAll('.shop-catalog-card, .product-luxury-card').forEach(card => {
        const titleEl = card.querySelector('.shop-card-title, .product-name-title');
        if (!titleEl) return;
        const titleText = titleEl.textContent.trim().toLowerCase();

        const match = inv.find(p => 
          titleText.includes(p.title.toLowerCase()) || p.title.toLowerCase().includes(titleText)
        );

        if (match) {
          const stock = parseInt(match.stock, 10) || 0;
          const imageBox = card.querySelector('.shop-card-image-box, .product-stage-col');
          const addBtn = card.querySelector('.btn-add-cart');
          const addBtnSpan = addBtn?.querySelector('span') || addBtn;

          card.querySelectorAll('.stock-badge-soldout, .stock-badge-low').forEach(b => b.remove());

          if (stock <= 0) {
            if (imageBox) {
              const badge = document.createElement('span');
              badge.className = 'stock-badge-soldout';
              badge.style.position = 'absolute';
              badge.style.top = '14px';
              badge.style.right = '14px';
              badge.style.zIndex = '5';
              badge.textContent = 'Sold Out';
              imageBox.appendChild(badge);
            }
            if (addBtn) {
              addBtn.disabled = true;
              if (addBtnSpan) addBtnSpan.textContent = 'Sold Out';
              addBtn.style.opacity = '0.5';
              addBtn.style.cursor = 'not-allowed';
            }
            const quickBuyBtn = card.querySelector('.btn-quick-buy');
            if (quickBuyBtn) {
              quickBuyBtn.disabled = true;
              quickBuyBtn.style.opacity = '0.5';
              quickBuyBtn.style.cursor = 'not-allowed';
            }
          } else if (stock <= 3) {
            if (imageBox) {
              const badge = document.createElement('span');
              badge.className = 'stock-badge-low';
              badge.style.position = 'absolute';
              badge.style.top = '14px';
              badge.style.right = '14px';
              badge.style.zIndex = '5';
              badge.textContent = `Only ${stock} Left`;
              imageBox.appendChild(badge);
            }
            if (addBtn) {
              addBtn.disabled = false;
              addBtn.style.opacity = '1';
              addBtn.style.cursor = 'pointer';
            }
            const quickBuyBtn = card.querySelector('.btn-quick-buy');
            if (quickBuyBtn) {
              quickBuyBtn.disabled = false;
              quickBuyBtn.style.opacity = '1';
              quickBuyBtn.style.cursor = 'pointer';
            }
          } else {
            if (addBtn) {
              addBtn.disabled = false;
              addBtn.style.opacity = '1';
              addBtn.style.cursor = 'pointer';
            }
            const quickBuyBtn = card.querySelector('.btn-quick-buy');
            if (quickBuyBtn) {
              quickBuyBtn.disabled = false;
              quickBuyBtn.style.opacity = '1';
              quickBuyBtn.style.cursor = 'pointer';
            }
          }
        }
      });
    }

    async function syncShopStock() {
      applyStockToCards();

      if (window.location.protocol.startsWith('http')) {
        try {
          const res = await fetch('/api/products');
          if (res.ok) {
            const data = await res.json();
            if (data && data.success && Array.isArray(data.products) && data.products.length > 0) {
              saveInventory(data.products);
              applyStockToCards();
            }
          }
        } catch (e) {}
      }
    }

    // Initialize Cart, Stock, and Payment Return Verification
    ensureDrawerMarkup();
    updateBadges();
    syncShopStock();
    checkStripePaymentReturn();

    // Hook all navCartBtn buttons
    document.querySelectorAll('#navCartBtn, .nav-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openCart();
      });
    });

    // Hook all Add to Cart buttons
    document.querySelectorAll('.btn-add-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn.disabled) return;

        const card = btn.closest('.shop-catalog-card') || btn.closest('.product-luxury-card') || btn.closest('.product-card') || btn.closest('div');
        const title = btn.getAttribute('data-product') || card?.querySelector('.product-name-title')?.textContent?.trim() || card?.querySelector('.shop-card-title')?.textContent?.trim() || 'Signature Formula';
        const price = btn.getAttribute('data-price') || card?.querySelector('.product-price-amount')?.textContent?.trim() || card?.querySelector('.shop-card-price')?.textContent?.trim() || '$25.00';
        const image = card?.querySelector('.product-enhanced-img')?.getAttribute('src') || card?.querySelector('img')?.getAttribute('src') || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg';

        let variant = '';
        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          variant = parts[1];
        }

        addToCart({
          title: title.split(' - ')[0],
          variant,
          price,
          image
        });
      });
    });

    // Hook all Quick Buy buttons
    document.querySelectorAll('.btn-quick-buy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const card = btn.closest('.shop-catalog-card') || btn.closest('.product-card') || btn.closest('div');
        const addBtn = card?.querySelector('.btn-add-cart');
        if (addBtn && addBtn.disabled) return;

        const title = addBtn?.getAttribute('data-product') || card?.querySelector('.shop-card-title')?.textContent?.trim() || 'Signature Formula';
        const price = addBtn?.getAttribute('data-price') || card?.querySelector('.shop-card-price')?.textContent?.trim() || '$25.00';
        const image = card?.querySelector('img')?.getAttribute('src') || 'assets/shop/xxxtra-strength-regrowth-serum-enhanced.jpg';

        let variant = '';
        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          variant = parts[1];
        }

        addToCart({
          title: title.split(' - ')[0],
          variant,
          price,
          image
        });

        setTimeout(() => {
          handleCheckout();
        }, 150);
      });
    });

    // Expose helpers globally for cross-module calls
    window.OffDaHookCommerce = {
      openCart,
      closeCart,
      addToCart,
      syncShopStock
    };

    // Product Variant Toggles (Size & Color)
    document.querySelectorAll('.variant-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const parent = btn.parentElement;
        if (parent) {
          parent.querySelectorAll('.variant-pill-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'rgba(255,255,255,0.06)';
            b.style.borderColor = 'rgba(255,255,255,0.15)';
            b.style.color = '#B5B2C5';
          });
        }
        btn.classList.add('active');
        btn.style.background = 'rgba(255, 46, 147, 0.25)';
        btn.style.borderColor = 'var(--pink-primary)';
        btn.style.color = '#fff';

        const target = btn.getAttribute('data-target');
        const size = btn.getAttribute('data-size') || '';
        const price = btn.getAttribute('data-price') || '';

        if (target === 'xxxtra') {
          const priceEl = document.getElementById('shopPriceXxxtra');
          const volEl = document.getElementById('shopVolXxxtra');
          const cartBtn = document.getElementById('shopBtnXxxtra');
          if (priceEl) priceEl.textContent = price;
          if (volEl) volEl.textContent = size;
          if (cartBtn) {
            cartBtn.setAttribute('data-product', `Xxxtra Strength Regrowth Serum - ${size}`);
            cartBtn.setAttribute('data-price', price);
          }
        } else if (target === 'home-xxxtra') {
          const priceEl = document.getElementById('homePriceXxxtra');
          const cartBtn = document.getElementById('homeBtnXxxtra');
          if (priceEl) priceEl.textContent = price;
          if (cartBtn) {
            cartBtn.setAttribute('data-product', `Xxxtra Strength Regrowth Serum - ${size}`);
            cartBtn.setAttribute('data-price', price);
            const span = cartBtn.querySelector('span');
            if (span) span.textContent = `Add to Cart • ${price}`;
          }
        }
      });
    });

    document.querySelectorAll('.variant-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const parent = btn.parentElement;
        if (parent) {
          parent.querySelectorAll('.variant-color-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'rgba(255,255,255,0.06)';
            b.style.borderColor = 'rgba(255,255,255,0.15)';
            b.style.color = '#B5B2C5';
          });
        }
        btn.classList.add('active');
        btn.style.background = 'rgba(255, 46, 147, 0.25)';
        btn.style.borderColor = 'var(--pink-primary)';
        btn.style.color = '#fff';

        const target = btn.getAttribute('data-target');
        const color = btn.getAttribute('data-color') || 'Clear';

        if (target === 'edge') {
          const cartBtn = document.getElementById('shopBtnEdge');
          if (cartBtn) {
            cartBtn.setAttribute('data-product', `ICY Edge Glaze - ${color}`);
          }
        } else if (target === 'home-edge') {
          const cartBtn = document.getElementById('homeBtnEdge');
          if (cartBtn) {
            cartBtn.setAttribute('data-product', `ICY Edge Glaze - ${color}`);
          }
        }
      });
    });
  }

  // Subpage Handlers: Filter Pills & FAQ Accordions
  function initSubpageInteractions() {
    // FAQ Accordion
    document.querySelectorAll('.faq-question-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemBox = btn.closest('.faq-item-box');
        if (itemBox) {
          const isOpen = itemBox.classList.contains('open');
          document.querySelectorAll('.faq-item-box').forEach(b => b.classList.remove('open'));
          if (!isOpen) {
            itemBox.classList.add('open');
          }
        }
      });
    });

    // Subpage Category Filter Pills
    document.querySelectorAll('.filter-pill-item').forEach(pill => {
      pill.addEventListener('click', () => {
        const filterVal = pill.getAttribute('data-filter');
        
        // Sync active state across all filter bars with matching filter
        document.querySelectorAll(`.filter-pill-item[data-filter="${filterVal}"]`).forEach(p => {
          const parentBar = p.closest('.filter-pills-bar');
          if (parentBar) {
            parentBar.querySelectorAll('.filter-pill-item').forEach(btn => btn.classList.remove('active'));
          }
          p.classList.add('active');
        });

        const targetGrid = document.querySelector(pill.getAttribute('data-target') || '#servicesCatalogGrid, .services-expanded-grid, .gallery-masonry-grid, .shop-catalog-grid');
        if (targetGrid) {
          const cards = targetGrid.querySelectorAll('[data-category]');
          cards.forEach(card => {
            const cat = card.getAttribute('data-category') || '';
            const catList = cat.split(' ');
            if (filterVal === 'all' || cat === filterVal || catList.includes(filterVal) || cat.includes(filterVal)) {
              card.style.display = '';
              card.style.opacity = '1';
              card.style.visibility = 'visible';
              card.classList.remove('filter-animating');
              void card.offsetWidth;
              card.classList.add('filter-animating');
            } else {
              card.style.display = 'none';
            }
          });
        }

        // If clicked from the hero, smoothly scroll down to the filtered catalog
        if (pill.closest('.subpage-hero')) {
          const catSection = document.querySelector('#all-services-section') || document.querySelector('#servicesCatalogGrid');
          if (catSection) {
            catSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });

    // Ensure all service cards on services.html are immediately 100% visible on page load
    const catalogGrid = document.querySelector('#servicesCatalogGrid');
    if (catalogGrid) {
      catalogGrid.querySelectorAll('.service-card-expanded').forEach(card => {
        card.style.display = '';
        card.style.opacity = '1';
        card.style.visibility = 'visible';
      });
    }

    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // Amenities Bento Owl Carousel on Phone View (< 768px)
    const $amenitiesGrid = $('#suiteAmenitiesGrid');
    if ($amenitiesGrid.length && window.jQuery && typeof $.fn.owlCarousel === 'function') {
      function checkAmenitiesSlider() {
        if (window.innerWidth <= 768) {
          if (!$amenitiesGrid.hasClass('owl-loaded')) {
            $amenitiesGrid.addClass('owl-carousel owl-theme').owlCarousel({
              items: 1,
              margin: 16,
              loop: true,
              nav: false,
              dots: true,
              autoplay: true,
              autoplayTimeout: 4000,
              autoplayHoverPause: true,
              stagePadding: 16,
              responsive: {
                0: { items: 1, stagePadding: 16 },
                540: { items: 2, stagePadding: 24 }
              }
            });
          }
        } else {
          if ($amenitiesGrid.hasClass('owl-loaded')) {
            $amenitiesGrid.trigger('destroy.owl.carousel').removeClass('owl-carousel owl-theme owl-loaded');
          }
        }
      }
      checkAmenitiesSlider();
      window.addEventListener('resize', debounce(checkAmenitiesSlider, 200));
    }

    // Services Expanded Grid Phone Slider & Controls
    const servicesGrid = document.querySelector('.services-expanded-grid.mobile-slider');
    const servicesPrevBtn = document.querySelector('#servicesPrevBtn');
    const servicesNextBtn = document.querySelector('#servicesNextBtn');
    const servicesCounter = document.querySelector('#servicesSliderCounter');

    if (servicesGrid) {
      function updateServicesCounter() {
        if (!servicesCounter || window.innerWidth > 768) return;
        const visibleCards = Array.from(servicesGrid.querySelectorAll('.service-expanded-card:not([style*="display: none"])'));
        if (!visibleCards.length) return;
        const cardWidth = visibleCards[0].offsetWidth + 16;
        const scrollLeft = servicesGrid.scrollLeft;
        const currentIndex = Math.min(visibleCards.length, Math.max(1, Math.round(scrollLeft / cardWidth) + 1));
        servicesCounter.innerHTML = `<span class="current">${currentIndex}</span> / <span class="total">${visibleCards.length}</span>`;
      }

      servicesGrid.addEventListener('scroll', debounce(updateServicesCounter, 50), { passive: true });

      if (servicesNextBtn) {
        servicesNextBtn.addEventListener('click', () => {
          const visibleCards = servicesGrid.querySelectorAll('.service-expanded-card:not([style*="display: none"])');
          if (!visibleCards.length) return;
          const cardWidth = visibleCards[0].offsetWidth + 16;
          servicesGrid.scrollBy({ left: cardWidth, behavior: 'smooth' });
        });
      }

      if (servicesPrevBtn) {
        servicesPrevBtn.addEventListener('click', () => {
          const visibleCards = servicesGrid.querySelectorAll('.service-expanded-card:not([style*="display: none"])');
          if (!visibleCards.length) return;
          const cardWidth = visibleCards[0].offsetWidth + 16;
          servicesGrid.scrollBy({ left: -cardWidth, behavior: 'smooth' });
        });
      }

      // Also reset slider to first card on tab filter click
      document.querySelectorAll('.filter-pill-item').forEach(pill => {
        pill.addEventListener('click', () => {
          setTimeout(() => {
            servicesGrid.scrollTo({ left: 0, behavior: 'smooth' });
            updateServicesCounter();
          }, 80);
        });
      });

      updateServicesCounter();
    }
  }

  // Initialize Featured Products Slider, Cart Notice & Subpage Handlers
  initFeaturedProductsSlider();
  initCartNotice();
  initSubpageInteractions();
});

