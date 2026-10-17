const customerToast = document.querySelector("#toast");
let customerToastTimeout;

document.addEventListener("DOMContentLoaded", loadCustomerDashboard);

async function loadCustomerDashboard() {
  try {
    const identity = await customerApi("/api/auth/me");
    if (!identity.user) {
      location.replace("login.html?next=verification.html");
      return;
    }
    const demoCustomerView = identity.user.isDemo && identity.user.role === "super_admin";
    if (["super_admin", "super_agent", "finance", "operations", "reviewer"].includes(identity.user.role) && !demoCustomerView) {
      location.replace("dashboard.html");
      return;
    }
    if (demoCustomerView) {
      document.querySelector("#customer-demo-banner").hidden = false;
      document.querySelector("#demo-admin-view").hidden = false;
    }
    const name = `${identity.user.firstName} ${identity.user.lastName}`.trim();
    document.querySelector("#customer-name").textContent = name;
    document.querySelector("#customer-avatar").textContent = name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    document.querySelector("#welcome-title").replaceChildren(
      document.createTextNode(`Welcome, ${identity.user.firstName} `),
      document.createTextNode("✳"),
    );
    document.querySelector("#customer-date").textContent = new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date()).toUpperCase();

    const data = await customerApi(`/api/requests?page=1&limit=25${demoCustomerView ? "&scope=mine" : ""}`);
    renderCustomerRequests(data.items);
    document.querySelector("#start-verification").addEventListener("click", () => {
      showCustomerToast("Product-specific request forms and authorized service integrations are not configured yet. No request was submitted.");
    });
    document.querySelector("#customer-logout").addEventListener("click", logoutCustomer);
  } catch (error) {
    showCustomerToast(error.message);
  }
}

async function customerApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: options.headers,
  });
  if (response.status === 401) return { user: null };
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Your SOKOTECH account service is unavailable. Please try again later.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "We couldn't load your account.");
  return data;
}

function renderCustomerRequests(requests) {
  const sorted = [...requests].sort(
    (first, second) => new Date(second.createdAt) - new Date(first.createdAt),
  );
  const latest = sorted[0];
  const statusPill = document.querySelector("#customer-request-status");
  const copy = document.querySelector("#customer-request-copy");
  const heading = document.querySelector("#progress-heading");
  const ring = document.querySelector("#customer-progress-ring");
  const progressLabel = document.querySelector("#progress-percent");
  const activity = document.querySelector("#customer-activity");
  statusPill.classList.toggle("customer-inactive", !latest);

  if (!latest) {
    statusPill.lastChild.textContent = " NO REQUESTS YET";
    heading.textContent = "No requests yet";
    copy.textContent = "Service request forms appear here when an administrator configures a product with an approved workflow.";
    progressLabel.replaceChildren(document.createTextNode("—"));
    ring.setAttribute("aria-label", "No service requests found");
    activity.replaceChildren(text("div", "activity-empty", "No service requests have been submitted for this account."));
    updateSteps(0, false);
    return;
  }

  const step = getRequestStep(latest.status);
  const formattedStatus = latest.status.replaceAll("_", " ");
  statusPill.lastChild.textContent = ` ${formattedStatus.toUpperCase()}`;
  heading.textContent = `${step.number} of 3 steps`;
  copy.textContent = `${latest.productName} · ${latest.reference} · ${step.description}`;
  progressLabel.replaceChildren(
    document.createTextNode(step.number === 0 ? "—" : String(step.percent)),
    ...(step.number === 0 ? [] : [percentText()]),
  );
  ring.setAttribute("aria-label", `${step.number} of 3 request steps`);
  updateSteps(step.number, true);

  activity.replaceChildren();
  for (const request of sorted) {
    const row = document.createElement("div");
    row.className = "activity-row";
    const icon = text("span", `activity-icon ${request.status === "completed" ? "confirmed" : ""}`, request.status === "completed" ? "✓" : "≡");
    const content = document.createElement("span");
    content.className = "activity-copy";
    content.append(
      text("strong", "", `${request.productName} · ${request.reference}`),
      text("small", "", `Status updated ${formatDate(request.updatedAt)}.`),
    );
    const time = text("span", "activity-time", formatDate(request.createdAt));
    const status = text("span", "request-status-label", formatted(request.status));
    row.append(icon, content, time, status);
    activity.append(row);
  }
}

function updateSteps(completed, hasRequest) {
  document.querySelectorAll("[data-customer-step]").forEach((element) => {
    const number = Number(element.dataset.customerStep);
    const symbol = element.querySelector(".step-symbol");
    const status = element.querySelector(".step-status");
    element.classList.toggle("complete", number < completed);
    element.classList.toggle("current", hasRequest && number === completed && completed < 3);
    if (number < completed) {
      symbol.textContent = "✓";
      status.textContent = "DONE";
    } else if (hasRequest && number === completed && completed < 3) {
      symbol.textContent = String(number + 1);
      status.textContent = "NOW";
    } else {
      symbol.textContent = String(number + 1);
      status.textContent = "UP NEXT";
    }
  });
  const bar = document.querySelector("#progress-bar");
  const percent = Math.round(completed / 3 * 100);
  bar.style.width = `${percent}%`;
  bar.style.background = completed === 3 ? "#a5d8bd" : "";
}

function getRequestStep(status) {
  if (status === "completed") {
    return { number: 3, percent: 100, description: "This request has been completed." };
  }
  if (["processing", "pending_review", "awaiting_customer_information", "paid"].includes(status)) {
    return { number: 2, percent: 67, description: "The latest recorded status is shown below." };
  }
  if (["rejected", "failed", "refunded"].includes(status)) {
    return { number: 1, percent: 33, description: "This request is no longer active. See your latest status below." };
  }
  return { number: 1, percent: 33, description: "Your request has been recorded." };
}

function percentText() {
  const percent = document.createElement("small");
  percent.textContent = "%";
  return percent;
}

async function logoutCustomer() {
  try {
    const { csrfToken } = await customerApi("/api/auth/csrf");
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": csrfToken },
    });
    if (!response.ok) throw new Error("We couldn't sign you out. Please try again.");
    location.assign("login.html");
  } catch (error) {
    showCustomerToast(error.message);
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatted(value) {
  return value.replaceAll("_", " ");
}

function text(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = content;
  return element;
}

function showCustomerToast(message) {
  window.clearTimeout(customerToastTimeout);
  customerToast.textContent = message;
  customerToast.classList.add("visible");
  customerToastTimeout = window.setTimeout(
    () => customerToast.classList.remove("visible"),
    4500,
  );
}
