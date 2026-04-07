const THEME_KEY = "botd-theme";
const body = document.body;
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = themeToggle?.querySelector(".theme-toggle-label");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");
const topbar = document.querySelector(".topbar");
const hero = document.querySelector(".hero");
const parallaxLayers = document.querySelectorAll(".poster-card");
const interactiveCards = document.querySelectorAll(
  ".highlight-card, .glass-card, .concept-card, .step-card, .vote-card, .category-card, .benefit-card, .cta-panel"
);
const revealItems = document.querySelectorAll(".reveal");
let scrollTicking = false;

function applyTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  body.setAttribute("data-theme", selectedTheme);

  if (themeToggle) {
    const isLight = selectedTheme === "light";
    themeToggle.setAttribute("aria-pressed", String(isLight));
  }

  if (themeLabel) {
    themeLabel.textContent = selectedTheme === "light" ? "Dark" : "Light";
  }
}

function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) {
    applyTheme(savedTheme);
    return;
  }

  applyTheme("dark");
}

function toggleTheme() {
  const nextTheme = body.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
}

function closeMenu() {
  if (!menuToggle || !siteNav) {
    return;
  }

  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open menu");
  siteNav.classList.remove("is-open");
}

function toggleMenu() {
  if (!menuToggle || !siteNav) {
    return;
  }

  const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isExpanded));
  menuToggle.setAttribute("aria-label", isExpanded ? "Open menu" : "Close menu");
  siteNav.classList.toggle("is-open", !isExpanded);
}

function setupRevealAnimations() {
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.14,
      rootMargin: "0px 0px -6% 0px",
    }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function syncHeaderState() {
  if (!topbar) {
    return;
  }

  topbar.classList.toggle("is-scrolled", window.scrollY > 18);
}

function syncScrollEffects() {
  if (hero) {
    const heroRect = hero.getBoundingClientRect();
    const heroProgress = Math.max(-0.12, Math.min(1, -heroRect.top / Math.max(heroRect.height, 1)));
    const shift = Math.round(heroProgress * 28);
    hero.style.setProperty("--hero-shift", `${shift}px`);
  }

  scrollTicking = false;
}

function setupHeroParallax() {
  if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  hero.addEventListener("pointermove", (event) => {
    const bounds = hero.getBoundingClientRect();
    const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;

    parallaxLayers.forEach((layer, index) => {
      const depth = [18, 28, 22][index] || 16;
      const rotate = index === 1 ? -8 : index === 2 ? 8 : 0;
      const moveX = offsetX * depth;
      const moveY = offsetY * depth * 0.55;
      layer.style.transform = `translate3d(${moveX}px, ${moveY}px, 0) rotate(${rotate}deg)`;
    });
  });

  hero.addEventListener("pointerleave", () => {
    parallaxLayers.forEach((layer, index) => {
      const rotate = index === 1 ? -8 : index === 2 ? 8 : 0;
      layer.style.transform = `translate3d(0, 0, 0) rotate(${rotate}deg)`;
    });
  });
}

function setupInteractiveCards() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  interactiveCards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const bounds = card.getBoundingClientRect();
      const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -6;
      const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 8;
      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });
}

loadTheme();
setupRevealAnimations();
syncHeaderState();
syncScrollEffects();
setupHeroParallax();
setupInteractiveCards();

themeToggle?.addEventListener("click", toggleTheme);
menuToggle?.addEventListener("click", toggleMenu);

document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 820) {
    closeMenu();
  }
});

window.addEventListener(
  "scroll",
  () => {
    syncHeaderState();

    if (!scrollTicking) {
      window.requestAnimationFrame(syncScrollEffects);
      scrollTicking = true;
    }
  },
  { passive: true }
);
