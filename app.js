const dialog = document.querySelector("#verification-dialog");
const startButton = document.querySelector("#start-verification");
const closeButton = document.querySelector("#dialog-back");
const notificationButton = document.querySelector(".notification-button");
const menuToggle = document.querySelector(".menu-toggle");
const siteNavigation = document.querySelector("#site-navigation");
let toastTimeout;

if (dialog && startButton && !document.querySelector("[data-customer-dashboard]")) {
  startButton.addEventListener("click", () => dialog.showModal());
  closeButton.addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.querySelector("#dialog-action").addEventListener("click", () => {
    dialog.close();
    showToast("This demo doesn't collect or upload identity documents.");
  });
}

if (notificationButton) {
  notificationButton.addEventListener("click", () => {
    showToast("You're all caught up. Your verification is ready to continue.");
  });
}

if (menuToggle && siteNavigation) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Open menu" : "Close menu");
    siteNavigation.classList.toggle("is-open", !isOpen);
  });

  siteNavigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open menu");
      siteNavigation.classList.remove("is-open");
    }
  });
}

document.querySelectorAll(".password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.textContent = shouldShow ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(shouldShow));
    button.setAttribute("aria-label", `${shouldShow ? "Hide" : "Show"} password`);
  });
});

const authForms = document.querySelectorAll("[data-auth-form]");
if (authForms.length) initializeAuthentication();

async function initializeAuthentication() {
  const feedbackNodes = document.querySelectorAll(".auth-feedback, .reset-feedback");
  let csrfToken;
  try {
    const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Couldn't connect to the account service.");
    const data = await response.json();
    csrfToken = data.csrfToken;
  } catch (error) {
    feedbackNodes.forEach((node) => showAuthFeedback(node, error.message));
    authForms.forEach((form) => {
      form.querySelector('[type="submit"]').disabled = true;
    });
    return;
  }

  authForms.forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const isSignup = form.dataset.authForm === "signup";
      const feedback = form.querySelector(".auth-feedback");
      const formData = new FormData(form);
      const password = formData.get("password");
      const submit = form.querySelector('[type="submit"]');
      const payload = isSignup
        ? {
            firstName: formData.get("firstName"),
            lastName: formData.get("lastName"),
            email: formData.get("email"),
            password,
          }
        : { email: formData.get("email"), password };

      submit.disabled = true;
      try {
        const response = await fetch(`/api/auth/${isSignup ? "signup" : "login"}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          const details = data.error?.fields?.map((issue) => issue.message).join(" ") || "";
          throw new Error([data.error?.message, details].filter(Boolean).join(" "));
        }

        csrfToken = data.csrfToken;
        const requestedPage = new URLSearchParams(location.search).get("next");
        const allowedNext = ["dashboard.html", "verification.html"].includes(requestedPage)
          ? requestedPage
          : null;
        const defaultPage = ["super_admin", "super_agent", "finance", "operations", "reviewer"].includes(data.user.role)
          ? "dashboard.html"
          : "verification.html";
        location.assign(allowedNext || defaultPage);
      } catch (error) {
        showAuthFeedback(feedback, error.message || "We couldn't complete your request.");
        submit.disabled = false;
      }
    });
  });

  const resetForm = document.querySelector("#auth-reset-form");
  if (resetForm) {
    document.querySelector("#forgot-password").addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelector(".login-card > .auth-form").hidden = true;
      resetForm.hidden = false;
      resetForm.querySelector("input").focus();
    });
    document.querySelector("[data-reset-back]").addEventListener("click", () => {
      resetForm.hidden = true;
      document.querySelector(".login-card > .auth-form").hidden = false;
      resetForm.querySelector(".reset-feedback").classList.remove("is-visible");
    });
    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = resetForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const response = await fetch("/api/auth/password-reset-request", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({ email: new FormData(resetForm).get("email") }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Password reset is unavailable.");
        showAuthFeedback(resetForm.querySelector(".reset-feedback"), data.message);
      } catch (error) {
        showAuthFeedback(resetForm.querySelector(".reset-feedback"), error.message);
      } finally {
        submit.disabled = false;
      }
    });
  }
}

function showAuthFeedback(node, message) {
  if (!node) return;
  node.replaceChildren(document.createTextNode(message));
  node.classList.add("is-visible");
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.id === "forgot-password") return;
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) {
      event.preventDefault();
      if (document.querySelector(".landing-page")) {
        showToast(`${link.textContent.trim()} information will be available soon.`);
      } else {
        const feedback = document.querySelector(".auth-feedback");
        if (feedback) {
          feedback.textContent = `${link.textContent.trim()} information will be available soon.`;
          feedback.classList.add("is-visible");
        }
      }
      return;
    }

    if (link.classList.contains("nav-link")) {
      document.querySelectorAll(".nav-link").forEach((item) => {
        item.classList.remove("active");
        item.removeAttribute("aria-current");
      });
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });
});

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;

  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3400);
}
