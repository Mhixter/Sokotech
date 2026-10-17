const state = {
  csrfToken: null,
  user: null,
  products: [],
  requests: [],
  transactions: [],
  inventory: null,
  activity: [],
  charts: [],
  pages: { products: 1, requests: 1, transactions: 1, activity: 1 },
  toastTimeout: null,
};

const labels = {
  nin_bvn: "NIN / BVN",
  cac: "CAC",
  airtime: "Airtime",
  mobile_data: "Mobile data",
  vpn: "VPN",
  education_pins: "Education PINs",
  validation: "Validation",
  ipe: "IPE",
  personalisation: "Personalisation",
};
const roleLabels = {
  super_admin: "Super Admin",
  super_agent: "Super Agent",
  finance: "Finance",
  operations: "Operations",
  reviewer: "Reviewer",
  sub_agent: "Sub-agent",
  customer: "Customer",
};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  try {
    const [tokenResponse, authResponse] = await Promise.all([
      fetch("/api/auth/csrf", { credentials: "same-origin" }),
      fetch("/api/auth/me", { credentials: "same-origin" }),
    ]);
    if (!tokenResponse.ok || !authResponse.ok) {
      throw new Error("The SOKOTECH service is not connected. Start the app with PostgreSQL enabled.");
    }
    const token = await tokenResponse.json();
    const auth = await authResponse.json();
    state.csrfToken = token.csrfToken;
    state.user = auth.user;

    if (!state.user) {
      window.location.replace("login.html?next=dashboard.html");
      return;
    }
    if (document.querySelector("#dashboard-date")) {
      document.querySelector("#dashboard-date").textContent =
        new Intl.DateTimeFormat("en-NG", {
          timeZone: "Africa/Lagos",
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date()).toUpperCase();
    }
    if (!["super_admin", "super_agent", "finance", "operations", "reviewer"].includes(state.user.role)) {
      showPageError("This account does not have access to the operations dashboard.");
      return;
    }

    updateUser(state.user);
    connectNavigation();
    bindActions();
    const panel = document.querySelector(`[data-panel="${location.hash.slice(1)}"]`);
    if (panel) navigateTo(location.hash.slice(1), false);
    await loadOverview();
  } catch (error) {
    showPageError(error.message || "Couldn't connect to the SOKOTECH service.");
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET" && options.method !== "HEAD") {
    headers.set("X-CSRF-Token", state.csrfToken || "");
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401) {
    window.location.replace("login.html?next=dashboard.html");
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (response.status === 204) return null;
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("The SOKOTECH service is unavailable. Start the app server with a connected PostgreSQL database.");
  }
  const body = await response.json().catch(() => null);
  if (!body) throw new Error("The SOKOTECH service returned an invalid response.");
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Request failed (${response.status}).`);
    error.fields = body?.error?.fields || [];
    error.status = response.status;
    throw error;
  }
  return body;
}

function bindActions() {
  document.querySelector("#refresh-dashboard").addEventListener("click", refreshCurrent);
  document.querySelector("#retry-dashboard").addEventListener("click", refreshCurrent);
  document.querySelector("#refresh-transactions").addEventListener("click", () => loadTransactions().catch(showToast));
  document.querySelector("#logout-button").addEventListener("click", logout);
  document.querySelector("#add-product-button").addEventListener("click", () => openProductDialog());
  document.querySelector("#open-import-button").addEventListener("click", openInventoryDialog);
  document.querySelector("#product-form").addEventListener("submit", saveProduct);
  document.querySelector("#inventory-form").addEventListener("submit", importInventory);
  document.querySelector("#request-update-form").addEventListener("submit", saveRequestUpdate);
  document.querySelector("#product-category-filter").addEventListener("change", () => {
    state.pages.products = 1;
    loadProducts().catch(showToast);
  });
  document.querySelector("#request-status-filter").addEventListener("change", () => {
    state.pages.requests = 1;
    loadRequests().catch(showToast);
  });
  document.querySelector("#transaction-status-filter").addEventListener("change", () => {
    state.pages.transactions = 1;
    loadTransactions().catch(showToast);
  });
  for (const [id, collection] of [
    ["product-search", "products"],
    ["request-search", "requests"],
    ["transaction-search", "transactions"],
  ]) {
    document.querySelector(`#${id}`).addEventListener("input", debounce(() => renderTable(collection), 160));
  }
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  for (const dialog of document.querySelectorAll(".admin-dialog")) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  document.querySelectorAll("[data-navigate]").forEach((button) => {
    button.addEventListener("click", () => navigateTo(button.dataset.navigate));
  });
  document.querySelector("#admin-menu-toggle").addEventListener("click", toggleSidebar);
  window.addEventListener("resize", resizeChart, { passive: true });
}

function connectNavigation() {
  document.querySelectorAll(".admin-nav-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      navigateTo(link.dataset.view);
    });
  });
}

function navigateTo(view, updateHistory = true) {
  if (!document.querySelector(`[data-panel="${view}"]`)) return;
  document.querySelectorAll(".admin-nav-link").forEach((link) => {
    const active = link.dataset.view === view;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.querySelectorAll(".admin-view").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === view);
  });
  document.querySelector("#breadcrumb-current").textContent = ({
    overview: "Overview",
    products: "Products & pricing",
    requests: "Service requests",
    transactions: "Transactions",
    inventory: "PIN inventory",
    activity: "Audit activity",
  })[view];
  if (updateHistory) history.pushState({ view }, "", `#${view}`);
  closeSidebarOnMobile();

  const loaders = {
    overview: loadOverview,
    products: loadProducts,
    requests: loadRequests,
    transactions: loadTransactions,
    inventory: loadInventory,
    activity: loadActivity,
  };
  loaders[view]?.().catch(showToast);
}

window.addEventListener("popstate", () => {
  navigateTo(location.hash.slice(1) || "overview", false);
});

async function refreshCurrent() {
  try {
    await loadOverview();
    showToast("Overview refreshed from the database.");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadOverview() {
  try {
    const data = await api("/api/dashboard/overview");
    document.querySelector("#database-alert").hidden = true;
    document.querySelector("#connection-status").innerHTML = "<i></i> Live database data";
    const metrics = data.transactions;
    setMetric("transactionValue", formatNgn(metrics.transaction_value));
    setMetric("revenue", formatNgn(metrics.revenue));
    setMetric("grossProfit", formatNgn(metrics.gross_profit));
    setMetric("successful", formatNumber(metrics.successful));
    setMetric("pending", formatNumber(metrics.pending));
    setMetric("failed", formatNumber(metrics.failed));
    setMetric("requests", formatNumber(data.requests.pending));
    setMetric("chartRevenue", formatNgn(metrics.revenue));
    setMetric("chartProfit", formatNgn(metrics.gross_profit));
    setMetric("pinsAvailable", formatNumber(data.inventory.available));
    setMetric("pinsReserved", formatNumber(data.inventory.reserved));
    setMetric("pinsSold", formatNumber(data.inventory.sold));
    document.querySelector("#pending-request-count").textContent = formatNumber(data.requests.pending);
    document.querySelector("#provider-status-copy").textContent =
      `${formatNumber(data.providers.configuredProducts)} connected providers · live health unavailable`;
    renderLowStock(data.lowStock);
    renderActivityPreview(data.activity);
    renderChart(data.dailyActivity || []);
  } catch (error) {
    showPageError(error.message);
    throw error;
  }
}

function showPageError(message) {
  const alert = document.querySelector("#database-alert");
  alert.hidden = false;
  document.querySelector("#database-error").textContent = `${message} No sample data is shown.`;
  document.querySelector("#connection-status").innerHTML = "<i class='connection-offline'></i> Database unavailable";
  document.querySelectorAll(".metric-value").forEach((element) => {
    element.textContent = "—";
  });
  const chart = document.querySelector("#chart-surface");
  if (chart) chart.replaceChildren(textElement("div", "chart-empty", "Verified daily revenue data will appear here when the database is connected."));
}

function renderChart(rows) {
  state.charts = rows.map((row) => ({
    date: row.date,
    revenue: Number(row.revenue),
    profit: Number(row.profit),
  })).filter((row) => Number.isFinite(row.revenue) && Number.isFinite(row.profit));
  resizeChart();
}

function resizeChart() {
  const canvas = document.querySelector("#revenue-chart");
  const container = document.querySelector("#chart-surface");
  if (!container) return;
  if (!state.charts.length) {
    const message = "No payment-confirmed transaction data for this period yet.";
    container.replaceChildren(textElement("div", "chart-empty", message));
    return;
  }

  let chart = canvas;
  if (!chart) {
    container.replaceChildren();
    chart = document.createElement("canvas");
    chart.id = "revenue-chart";
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", "Daily revenue and gross profit based on confirmed database transactions.");
    container.append(chart);
  }
  const width = container.clientWidth;
  if (width < 1) return;
  const height = 180;
  const scale = window.devicePixelRatio || 1;
  chart.width = Math.round(width * scale);
  chart.height = Math.round(height * scale);
  chart.style.width = `${width}px`;
  chart.style.height = `${height}px`;
  const context = chart.getContext("2d");
  context.scale(scale, scale);
  const computedStyle = getComputedStyle(document.documentElement);
  const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
  const values = state.charts.flatMap((row) => [row.revenue, row.profit]);
  const peak = Math.max(...values, 1);
  const left = 7;
  const right = width - 8;
  const top = 11;
  const bottom = height - 22;
  for (let index = 0; index <= 4; index += 1) {
    const y = top + ((bottom - top) / 4) * index;
    context.beginPath();
    context.strokeStyle = "#e9efeb";
    context.lineWidth = 1;
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }
  drawSeries(context, state.charts.map((row) => row.revenue), left, right, top, bottom, peak, computedStyle.getPropertyValue("--chart-green").trim(), true);
  drawSeries(context, state.charts.map((row) => row.profit), left, right, top, bottom, peak, computedStyle.getPropertyValue("--chart-blue").trim(), false);
  context.fillStyle = "#86938d";
  context.font = "9px DM Sans, sans-serif";
  context.fillText(formatShortDate(state.charts[0].date), left, height - 5);
  const lastDate = state.charts.at(-1).date;
  const label = state.charts.length > 1 ? formatShortDate(lastDate) : currency.format(state.charts.at(-1).revenue);
  context.textAlign = "right";
  context.fillText(label, right, height - 5);
}

function drawSeries(context, values, left, right, top, bottom, peak, color, fill) {
  const points = values.map((value, index) => ({
    x: values.length === 1 ? (left + right) / 2 : left + (right - left) * index / (values.length - 1),
    y: bottom - Math.max(0, value) / peak * (bottom - top),
  }));
  if (!points.length) return;
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.lineCap = "round";
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  if (fill) {
    context.lineTo(points.at(-1).x, bottom);
    context.lineTo(points[0].x, bottom);
    context.closePath();
    context.globalAlpha = 0.08;
    context.fillStyle = color;
    context.fill();
    context.globalAlpha = 1;
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
  }
  context.stroke();
  if (points.length < 12) {
    context.fillStyle = color;
    points.forEach((point) => {
      context.beginPath();
      context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
      context.fill();
    });
  }
}

async function loadProducts() {
  const category = document.querySelector("#product-category-filter").value;
  const page = state.pages.products;
  const query = new URLSearchParams({ page: String(page), limit: "25" });
  if (category) query.set("category", category);
  const data = await api(`/api/products?${query}`);
  state.products = data.items;
  renderTable("products");
  renderPagination("products", data);
  const select = document.querySelector("#inventory-product-select");
  const previous = select.value;
  select.replaceChildren(new Option("Choose a product", ""));
  state.products
    .filter((product) => product.category === "education_pins" && product.active)
    .forEach((product) => select.add(new Option(product.name, product.id)));
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

async function loadRequests() {
  const data = await api(`/api/requests?page=${state.pages.requests}&limit=25`);
  state.requests = data.items;
  renderTable("requests");
  renderPagination("requests", data);
  document.querySelector("#requests-count").textContent = `${data.items.length} requests shown · page ${data.page}`;
  if (["super_admin", "super_agent", "operations", "reviewer"].includes(state.user?.role)) {
    const staff = await api("/api/staff");
    const select = document.querySelector("#request-assignee");
    const selected = select.value;
    select.replaceChildren(new Option("Unassigned", ""));
    staff.items.forEach((user) => {
      select.add(new Option(`${user.firstName} ${user.lastName} · ${user.role.replaceAll("_", " ")}`, user.id));
    });
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }
}

async function loadTransactions() {
  const data = await api(`/api/transactions?page=${state.pages.transactions}&limit=25`);
  state.transactions = data.items;
  renderTable("transactions");
  renderPagination("transactions", data);
}

async function loadInventory() {
  const data = await api("/api/inventory");
  state.inventory = data;
  ["available", "reserved", "sold"].forEach((key) => setMetric(`pins${capitalize(key)}`, formatNumber(data.totals[key])));
  setMetric("pinsExpired", formatNumber(Number(data.totals.expired) + Number(data.totals.revoked)));
  renderTable("inventory");
  await loadProducts();
}

async function loadActivity() {
  const data = await api(`/api/activity?page=${state.pages.activity}&limit=50`);
  state.activity = data.items;
  renderTable("activity");
  renderPagination("activity", data);
}

function renderTable(type) {
  const search = type === "products"
    ? document.querySelector("#product-search").value.trim().toLowerCase()
    : type === "requests"
      ? document.querySelector("#request-search").value.trim().toLowerCase()
      : type === "transactions"
        ? document.querySelector("#transaction-search").value.trim().toLowerCase()
        : "";
  const filters = {
    requests: document.querySelector("#request-status-filter")?.value,
    transactions: document.querySelector("#transaction-status-filter")?.value,
  };
  if (type === "products") {
    const productRows = state.products.filter((item) => `${item.name} ${labels[item.category] || item.category}`.toLowerCase().includes(search));
    fillTable("products-table", productRows, 7, renderProductRow);
  } else if (type === "requests") {
    const rows = state.requests.filter((item) => {
      const matchesSearch = `${item.reference} ${item.customerFirstName} ${item.customerLastName} ${item.productName}`.toLowerCase().includes(search);
      return matchesSearch && (!filters.requests || item.status === filters.requests);
    });
    fillTable("requests-table", rows, 7, renderRequestRow);
  } else if (type === "transactions") {
    const rows = state.transactions.filter((item) => {
      const matchesSearch = `${item.reference} ${item.customerEmail} ${item.productName}`.toLowerCase().includes(search);
      return matchesSearch && (!filters.transactions || item.paymentStatus === filters.transactions);
    });
    fillTable("transactions-table", rows, 13, renderTransactionRow);
  } else if (type === "inventory" && state.inventory) {
    fillTable("inventory-products", state.inventory.products, 7, renderInventoryRow);
    fillTable("batches-table", state.inventory.batches, 7, renderBatchRow);
  } else if (type === "activity") {
    fillTable("audit-table", state.activity, 5, renderAuditRow);
  }
}

function fillTable(id, rows, columnCount, makeRow) {
  const tbody = document.querySelector(`#${id}`);
  if (!tbody) return;
  tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columnCount;
    td.append(textElement("div", "table-state", "No records yet."));
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const row of rows) tbody.append(makeRow(row));
}

function renderProductRow(product) {
  const tr = document.createElement("tr");
  appendCell(tr, product.name, "product-name");
  appendCell(tr, labels[product.category] || product.category);
  appendCell(tr, formatNgn(product.price), "numeric-cell");
  appendStatusCell(tr, product.providerEnabled ? "configured" : "not_configured");
  appendCell(tr, product.fulfilmentMethod);
  appendStatusCell(tr, product.active ? "active" : "inactive");
  const actionCell = document.createElement("td");
  if (["super_admin", "super_agent"].includes(state.user?.role)) {
    const edit = textElement("button", "row-action", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => openProductDialog(product));
    actionCell.append(edit);
  } else {
    actionCell.textContent = "Read only";
    actionCell.className = "readonly-cell";
  }
  tr.append(actionCell);
  return tr;
}

function renderRequestRow(request) {
  const tr = document.createElement("tr");
  appendCell(tr, request.reference, "reference-cell");
  appendCell(tr, request.productName, "product-name");
  appendCell(tr, `${request.customerFirstName} ${request.customerLastName}`.trim());
  appendCell(tr, [request.assignedFirstName, request.assignedLastName].filter(Boolean).join(" ") || "Unassigned");
  appendCell(tr, formatDate(request.createdAt));
  appendStatusCell(tr, request.status);
  const actionCell = document.createElement("td");
  if (["super_admin", "super_agent", "operations", "reviewer"].includes(state.user?.role)) {
    const action = textElement("button", "row-action", "Update");
    action.type = "button";
    action.addEventListener("click", () => openRequestDialog(request));
    actionCell.append(action);
  } else {
    actionCell.textContent = "Read only";
    actionCell.className = "readonly-cell";
  }
  tr.append(actionCell);
  return tr;
}

function renderTransactionRow(transaction) {
  const tr = document.createElement("tr");
  appendCell(tr, transaction.reference, "reference-cell");
  appendCell(tr, transaction.productName, "product-name");
  appendCell(tr, transaction.customerEmail);
  appendCell(tr, formatNgn(transaction.amountDue), "numeric-cell");
  appendCell(tr, formatNgn(transaction.providerCost), "numeric-cell");
  appendCell(tr, formatNgn(transaction.serviceFee), "numeric-cell");
  appendCell(tr, formatNgn(transaction.commission), "numeric-cell");
  appendCell(tr, transaction.paymentStatus === "confirmed"
    ? formatNgn(transaction.grossProfit)
    : "Pending confirmation", "numeric-cell");
  appendCell(tr, transaction.paymentReference);
  appendCell(tr, transaction.providerReference);
  appendStatusCell(tr, transaction.paymentStatus);
  appendStatusCell(tr, transaction.fulfilmentStatus);
  appendCell(tr, formatDate(transaction.createdAt));
  return tr;
}

function renderInventoryRow(product) {
  const tr = document.createElement("tr");
  appendCell(tr, product.name, "product-name");
  for (const key of ["available", "reserved", "sold", "expired"]) appendCell(tr, formatNumber(product[key]), "numeric-cell");
  appendCell(tr, formatNumber(product.lowStockThreshold), "numeric-cell");
  appendStatusCell(tr, product.lowStock ? "low_stock" : "in_stock");
  return tr;
}

function renderBatchRow(batch) {
  const tr = document.createElement("tr");
  appendCell(tr, batch.batchReference, "reference-cell");
  appendCell(tr, batch.productName, "product-name");
  appendCell(tr, batch.supplier);
  appendCell(tr, formatNumber(batch.importedQuantity), "numeric-cell");
  appendCell(tr, formatNumber(batch.remaining), "numeric-cell");
  appendCell(tr, formatNgn(batch.acquisitionCost), "numeric-cell");
  appendCell(tr, formatDate(batch.createdAt));
  return tr;
}

function renderAuditRow(event) {
  const tr = document.createElement("tr");
  appendCell(tr, event.action, "product-name");
  appendCell(tr, [event.actorFirstName, event.actorLastName].filter(Boolean).join(" ") || "System");
  appendCell(tr, event.entityType);
  appendCell(tr, safeStringify(event.metadata));
  appendCell(tr, formatDate(event.createdAt));
  return tr;
}

function renderPagination(type, pageData) {
  const container = document.querySelector(`#${type}-pagination`);
  if (!container) return;
  container.replaceChildren();
  const label = textElement("span", "pagination-label", `Page ${pageData.page} · ${pageData.items.length} records`);
  const controls = document.createElement("div");
  controls.className = "pagination-controls";
  for (const [direction, text, disabled] of [
    ["previous", "← Previous", pageData.page <= 1],
    ["next", "Next →", pageData.items.length < pageData.limit],
  ]) {
    const button = textElement("button", "pagination-button", text);
    button.type = "button";
    button.disabled = disabled;
    button.addEventListener("click", () => {
      state.pages[type] += direction === "next" ? 1 : -1;
      const loaders = { products: loadProducts, requests: loadRequests, transactions: loadTransactions, activity: loadActivity };
      loaders[type]().catch(showToast);
    });
    controls.append(button);
  }
  container.append(label, controls);
}

function renderLowStock(products) {
  const container = document.querySelector("#low-stock-summary");
  container.replaceChildren();
  if (!products.length) {
    container.classList.remove("has-alert");
    container.append(textElement("span", "stock-ok-symbol", "✓"));
    container.append(textElement("span", "", "No low-stock alerts for configured products."));
    return;
  }
  container.classList.add("has-alert");
  container.append(textElement("span", "", "!"));
  container.append(textElement("span", "", `${products.length} product${products.length === 1 ? "" : "s"} at or below the low-stock threshold: ${products.map((product) => product.name).join(", ")}`));
}

function renderActivityPreview(events) {
  const tbody = document.querySelector("#overview-activity");
  tbody.replaceChildren();
  if (!events.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.append(textElement("div", "table-state", "No audit activity has been recorded yet."));
    tr.append(td);
    tbody.append(tr);
    return;
  }
  for (const event of events) {
    const tr = document.createElement("tr");
    appendCell(tr, event.action, "product-name");
    appendCell(tr, [event.actorFirstName, event.actorLastName].filter(Boolean).join(" ") || "System");
    appendCell(tr, formatDate(event.createdAt));
    tbody.append(tr);
  }
}

function openProductDialog(product = null) {
  const form = document.querySelector("#product-form");
  form.reset();
  form.elements.namedItem("id").value = product?.id || "";
  form.elements.namedItem("name").value = product?.name || "";
  form.elements.namedItem("category").value = product?.category || "nin_bvn";
  form.elements.namedItem("description").value = product?.description || "";
  form.elements.namedItem("price").value = product?.price || "";
  form.elements.namedItem("providerCost").value = product?.providerCost || "0";
  form.elements.namedItem("serviceFee").value = product?.serviceFee || "0";
  form.elements.namedItem("commissionRate").value = product?.commissionRate || "0";
  form.elements.namedItem("providerName").value = product?.providerName || "";
  form.elements.namedItem("fulfilmentMethod").value = product?.fulfilmentMethod || "manual";
  form.elements.namedItem("lowStockThreshold").value = product?.lowStockThreshold || "0";
  form.elements.namedItem("providerEnabled").checked = product?.providerEnabled || false;
  form.elements.namedItem("active").checked = product?.active ?? true;
  form.querySelector(".dialog-feedback").classList.remove("is-visible");
  document.querySelector("#product-dialog-title").textContent = product ? "Edit product" : "Add product";
  form.querySelector('[type="submit"]').textContent = product ? "Save changes" : "Save product";
  document.querySelector("#product-dialog").showModal();
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const input = Object.fromEntries(formData.entries());
  input.price = Number(input.price);
  input.providerCost = Number(input.providerCost);
  input.serviceFee = Number(input.serviceFee);
  input.commissionRate = Number(input.commissionRate);
  input.lowStockThreshold = Number(input.lowStockThreshold);
  input.active = formData.has("active");
  input.providerEnabled = formData.has("providerEnabled");
  input.providerName ||= null;
  const id = input.id;
  delete input.id;
  const feedback = form.querySelector(".dialog-feedback");
  try {
    feedback.classList.remove("is-visible");
    if (id) {
      await api(`/api/products/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      showToast("Product settings saved and audited.");
    } else {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify(input),
      });
      showToast("Product created and audited.");
    }
    document.querySelector("#product-dialog").close();
    await loadProducts();
    await loadOverview();
  } catch (error) {
    showDialogError(feedback, error);
  }
}

function openInventoryDialog() {
  const select = document.querySelector("#inventory-product-select");
  if (!select.options.length || select.options.length === 1) {
    loadProducts()
      .then(() => document.querySelector("#inventory-dialog").showModal())
      .catch(showToast);
    return;
  }
  document.querySelector("#inventory-dialog").showModal();
}

async function importInventory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const file = formData.get("csvFile");
  const feedback = form.querySelector(".dialog-feedback");
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) {
    showDialogError(feedback, new Error("Choose a non-empty CSV file smaller than 1 MB."));
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Encrypting & importing…";
  try {
    const csv = await file.text();
    const result = await api("/api/inventory/import", {
      method: "POST",
      body: JSON.stringify({
        productId: formData.get("productId"),
        supplier: formData.get("supplier"),
        batchReference: formData.get("batchReference"),
        acquisitionCost: Number(formData.get("acquisitionCost")),
        csv,
      }),
    });
    document.querySelector("#inventory-dialog").close();
    form.reset();
    showToast(`${formatNumber(result.imported)} PINs imported; ${formatNumber(result.duplicates)} duplicates securely skipped.`);
    await loadInventory();
    await loadOverview();
  } catch (error) {
    showDialogError(feedback, error);
  } finally {
    submit.disabled = false;
    submit.textContent = "Encrypt & import";
  }
}

function openRequestDialog(request) {
  const form = document.querySelector("#request-update-form");
  form.reset();
  form.elements.namedItem("id").value = request.id;
  form.elements.namedItem("status").value = request.status;
  form.elements.namedItem("assignedTo").value = request.assignedTo || "";
  document.querySelector("#request-current-status").textContent = `${request.reference} · Current status: ${request.status.replaceAll("_", " ")}`;
  form.querySelector(".dialog-feedback").classList.remove("is-visible");
  document.querySelector("#request-dialog").showModal();
}

async function saveRequestUpdate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const id = formData.get("id");
  const payload = {
    status: formData.get("status"),
    assignedTo: formData.get("assignedTo") || null,
    internalNotes: formData.get("internalNotes"),
    completionNote: formData.get("completionNote"),
    rejectionReason: formData.get("rejectionReason"),
  };
  try {
    await api(`/api/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    document.querySelector("#request-dialog").close();
    showToast("Request updated and audit event recorded.");
    await loadRequests();
    await loadOverview();
  } catch (error) {
    showDialogError(form.querySelector(".dialog-feedback"), error);
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
    window.location.assign("login.html");
  } catch (error) {
    showToast(error.message);
  }
}

function updateUser(user) {
  const name = `${user.firstName} ${user.lastName}`.trim();
  document.querySelector("#user-name").textContent = name;
  document.querySelector("#user-role").textContent = roleLabels[user.role] || user.role;
  document.querySelector("#user-avatar").textContent = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  document.querySelector("#welcome-name").textContent = user.firstName;
  if (user.isDemo) {
    document.querySelector("#demo-sandbox-banner").hidden = false;
    document.querySelector("#demo-customer-view").hidden = false;
    document.querySelector("#connection-status").innerHTML = "<i></i> Demo sandbox";
    document.querySelector(".admin-brand small").textContent = "DEMO SUPER ADMIN";
  }
  const canManage = ["super_admin", "super_agent"].includes(user.role);
  document.querySelector("#add-product-button").hidden = !canManage;
  document.querySelector("#open-import-button").hidden = !canManage;
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value == null || value === "" ? "—" : String(value);
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function appendStatusCell(row, status) {
  const cell = document.createElement("td");
  const badge = textElement("span", `status-badge status-${String(status).toLowerCase().replaceAll("_", "-")}`, String(status).replaceAll("_", " "));
  cell.append(badge);
  row.append(cell);
  return cell;
}

function showDialogError(container, error) {
  const details = error.fields?.map((field) => `${field.field}: ${field.message}`).join(" · ");
  container.textContent = details ? `${error.message} ${details}` : error.message;
  container.classList.add("is-visible");
}

function toggleSidebar() {
  const sidebar = document.querySelector("#admin-sidebar");
  const button = document.querySelector("#admin-menu-toggle");
  const isOpen = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isOpen));
  button.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
  sidebar.classList.toggle("sidebar-open", !isOpen);
}

function closeSidebarOnMobile() {
  const sidebar = document.querySelector("#admin-sidebar");
  const button = document.querySelector("#admin-menu-toggle");
  sidebar.classList.remove("sidebar-open");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Open navigation");
}

function setMetric(name, value) {
  document.querySelectorAll(`[data-metric="${name}"]`).forEach((element) => {
    element.textContent = value;
  });
}

function formatNgn(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: amount < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-NG").format(number) : "—";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatShortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function safeStringify(value) {
  if (!value || typeof value !== "object") return "—";
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`)
    .join(" · ") || "—";
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function capitalize(value) {
  return value[0].toUpperCase() + value.slice(1);
}

function showToast(message) {
  const toast = document.querySelector("#admin-toast");
  window.clearTimeout(state.toastTimeout);
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function debounce(callback, delay) {
  let timeout;
  return () => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(callback, delay);
  };
}
