const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const themePicker = document.querySelector(".theme-picker");
const themeOptions = document.querySelectorAll("[data-theme-choice]");
const menuToggle = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-menu");
const scrollTopBtn = document.getElementById("scrollTopBtn");
const navLinks = document.querySelectorAll(".nav-link");

const validThemes = new Set(["classic", "demon", "light", "ocean", "forest", "violet", "gold", "rose"]);
const savedTheme = localStorage.getItem("siteTheme") || localStorage.getItem("theme");
const initialTheme = savedTheme === "light" ? "light" : savedTheme === "dark" || !validThemes.has(savedTheme) ? "demon" : savedTheme;

function setTheme(theme) {
  const selectedTheme = validThemes.has(theme) ? theme : "demon";
  body.dataset.theme = selectedTheme;
  body.classList.toggle("light-theme", selectedTheme === "light");
  localStorage.setItem("siteTheme", selectedTheme);
  themeOptions.forEach((option) => {
    option.setAttribute("aria-checked", String(option.dataset.themeChoice === selectedTheme));
  });
}

setTheme(initialTheme);

if (themeToggle && themePicker) {
  themeToggle.addEventListener("click", () => {
    const isOpen = themePicker.classList.toggle("open");
    themeToggle.setAttribute("aria-expanded", String(isOpen));
  });

  themeOptions.forEach((option) => {
    option.addEventListener("click", () => {
      setTheme(option.dataset.themeChoice);
      themePicker.classList.remove("open");
      themeToggle.setAttribute("aria-expanded", "false");
      themeToggle.focus();
    });
  });

  document.addEventListener("click", (event) => {
    if (!themePicker.contains(event.target)) {
      themePicker.classList.remove("open");
      themeToggle.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && themePicker.classList.contains("open")) {
      themePicker.classList.remove("open");
      themeToggle.setAttribute("aria-expanded", "false");
      themeToggle.focus();
    }
  });
}

if (menuToggle && mobileMenu) {
  const setMobileMenuOpen = (isOpen) => {
    mobileMenu.classList.toggle("open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  };

  menuToggle.addEventListener("click", () => {
    setMobileMenuOpen(!mobileMenu.classList.contains("open"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenu.classList.contains("open")) {
      setMobileMenuOpen(false);
      menuToggle.focus();
    }
  });
}

const currentPage = body.dataset.page;
if (navLinks.length) {
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href && href.includes(currentPage + ".html")) {
      link.classList.add("active");
    }
  });
}

const revealElements = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealElements.forEach((el) => observer.observe(el));
} else {
  revealElements.forEach((el) => el.classList.add("visible"));
}

window.addEventListener("scroll", () => {
  if (window.scrollY > 360) {
    scrollTopBtn?.classList.add("visible");
  } else {
    scrollTopBtn?.classList.remove("visible");
  }
});

scrollTopBtn?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const mobileLinks = document.querySelectorAll(".mobile-menu a");
mobileLinks.forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu?.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
    menuToggle?.setAttribute("aria-label", "Open menu");
  });
});

const navItems = document.querySelectorAll(".nav-link");
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((link) => link.classList.remove("active"));
    item.classList.add("active");
  });
});
