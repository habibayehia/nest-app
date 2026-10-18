const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = "nest-life-organizer";
let language = localStorage.getItem("nest-language") || "en";
let currentFilter = "all";
let state = loadState();
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
      transactions: Array.isArray(saved?.transactions)
        ? saved.transactions
        : [],
      bills: Array.isArray(saved?.bills) ? saved.bills : [],
      places: Array.isArray(saved?.places) ? saved.places : [],
    };
  } catch {
    return { tasks: [], transactions: [], bills: [], places: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function id() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function t(en, ar) {
  return language === "ar" ? ar : en;
}

function safe(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function money(value) {
  return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-GB", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function dateText(value) {
  if (!value) return t("No date", "من غير ميعاد");
  const date = new Date(value + "T12:00:00");
  return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  }).format(date);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function updateLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.body.lang = language;
  $("#languageButton").textContent = language === "ar" ? "English" : "عربي";

  $$("[data-en][data-ar]").forEach((el) => {
    el.textContent = el.dataset[language];
  });

  $("#taskName").placeholder = t(
    "e.g. Study JavaScript",
    "مثال: مذاكرة JavaScript",
  );
  $("#transactionDescription").placeholder = t(
    "e.g. Transport",
    "مثال: مواصلات",
  );
  $("#billName").placeholder = t("e.g. Internet", "مثال: فاتورة الإنترنت");
  $("#placeName").placeholder = t("e.g. Pick up a package", "مثال: استلام طلب");
  $("#placeNotes").placeholder = t("e.g. Near work", "مثال: قريب من الشغل");

  const active = $(".nav-link.active");
  if (active)
    $("#pageTitle").textContent = active.querySelector("span").textContent;
  renderAll();
}

function showView(view) {
  $$(".view").forEach((section) =>
    section.classList.toggle("active", section.id === view),
  );
  $$(".nav-link").forEach((button) =>
    button.classList.toggle("active", button.dataset.view === view),
  );
  const active = $(`.nav-link[data-view="${view}"]`);
  $("#pageTitle").textContent = active.querySelector("span").textContent;
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getTotals() {
  const income = state.transactions
    .filter((x) => x.type === "income")
    .reduce((sum, x) => sum + Number(x.amount), 0);
  const expenses = state.transactions
    .filter((x) => x.type === "expense")
    .reduce((sum, x) => sum + Number(x.amount), 0);
  return { income, expenses, balance: income - expenses };
}

function thisMonth(type) {
  const month = today().slice(0, 7);
  return state.transactions
    .filter((x) => x.type === type && x.date?.slice(0, 7) === month)
    .reduce((sum, x) => sum + Number(x.amount), 0);
}

function renderDashboard() {
  const done = state.tasks.filter((x) => x.completed).length;
  const total = state.tasks.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const totals = getTotals();

  $("#taskStats").textContent = `${done} / ${total}`;
  $("#taskProgress").style.width = percent + "%";
  $("#taskPercent").textContent = `${percent}% ${t("complete", "مكتمل")}`;
  $("#balanceStats").textContent = money(totals.balance);
  $("#incomeStats").textContent = money(thisMonth("income"));
  $("#expenseStats").textContent = money(thisMonth("expense"));

  const tasks = state.tasks.filter((x) => !x.completed).slice(0, 4);
  $("#dashboardTasks").innerHTML = tasks
    .map(
      (task) => `
    <div class="list-row">
      <input type="checkbox" class="task-checkbox" data-toggle-task="${safe(task.id)}" aria-label="${safe(task.name)}">
      <div class="row-main"><span class="row-title">${safe(task.name)}</span>
      <span class="row-sub">${safe(dateText(task.date))}</span></div>
    </div>`,
    )
    .join("");
  $("#dashboardTasksEmpty").classList.toggle("show", tasks.length === 0);

  const bills = state.bills
    .filter((x) => !x.paid)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
    .slice(0, 3);
  $("#dashboardBills").innerHTML = bills
    .map(
      (bill) => `
    <div class="list-row"><div class="row-main">
      <span class="row-title">${safe(bill.name)}</span>
      <span class="row-sub">${safe(dateText(bill.date))}</span></div>
      <span class="row-amount">${money(bill.amount)}</span></div>`,
    )
    .join("");
  $("#dashboardBillsEmpty").classList.toggle("show", bills.length === 0);
}

function renderTasks() {
  const tasks = state.tasks
    .filter(
      (task) =>
        currentFilter === "all" ||
        (currentFilter === "active" && !task.completed) ||
        (currentFilter === "completed" && task.completed),
    )
    .sort((a, b) => Number(a.completed) - Number(b.completed));

  $("#taskList").innerHTML = tasks
    .map(
      (task) => `
    <div class="list-row">
      <input type="checkbox" class="task-checkbox" data-toggle-task="${safe(task.id)}" ${task.completed ? "checked" : ""} aria-label="${safe(task.name)}">
      <div class="row-main">
        <span class="row-title ${task.completed ? "task-completed" : ""}">${safe(task.name)}</span>
        <span class="row-sub">${safe(dateText(task.date))}</span>
      </div>
      <button class="delete-button" data-delete-task="${safe(task.id)}" aria-label="${t("Delete", "حذف")}">×</button>
    </div>`,
    )
    .join("");

  $("#taskListEmpty").classList.toggle("show", tasks.length === 0);
  $$(".filter").forEach((button) =>
    button.classList.toggle("active", button.dataset.filter === currentFilter),
  );
}

function renderMoney() {
  const totals = getTotals();
  $("#moneyBalance").textContent = money(totals.balance);
  $("#moneyIncome").textContent = money(totals.income);
  $("#moneyExpenses").textContent = money(totals.expenses);

  const transactions = [...state.transactions].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  $("#transactionList").innerHTML = transactions
    .map(
      (item) => `
    <div class="list-row">
      <div class="row-main"><span class="row-title">${safe(item.description)}</span>
      <span class="row-sub">${safe(dateText(item.date))} · ${item.type === "income" ? t("Income", "دخل") : t("Expense", "مصروف")}</span></div>
      <span class="row-amount ${item.type === "income" ? "green-text" : "red-text"}">${item.type === "income" ? "+" : "−"}${money(item.amount)}</span>
      <button class="delete-button" data-delete-transaction="${safe(item.id)}" aria-label="${t("Delete", "حذف")}">×</button>
    </div>`,
    )
    .join("");
  $("#transactionEmpty").classList.toggle("show", transactions.length === 0);
}

function renderBills() {
  const bills = [...state.bills].sort(
    (a, b) => Number(a.paid) - Number(b.paid) || a.date.localeCompare(b.date),
  );
  $("#billList").innerHTML = bills
    .map((bill) => {
      const overdue = !bill.paid && bill.date < today();
      return `<div class="list-row">
      <div class="row-main"><span class="row-title">${safe(bill.name)}</span>
      <span class="row-sub">${t("Due", "موعدها")}: ${safe(dateText(bill.date))} · ${money(bill.amount)}</span></div>
      <span class="status ${bill.paid ? "paid" : overdue ? "overdue" : ""}">${bill.paid ? t("Paid", "مدفوعة") : overdue ? t("Overdue", "متأخرة") : t("Pending", "متبقية")}</span>
      <button class="small-button" data-toggle-bill="${safe(bill.id)}">${bill.paid ? t("Undo", "إلغاء") : t("Mark paid", "تم الدفع")}</button>
      <button class="delete-button" data-delete-bill="${safe(bill.id)}" aria-label="${t("Delete", "حذف")}">×</button>
    </div>`;
    })
    .join("");
  $("#billEmpty").classList.toggle("show", bills.length === 0);
}

function renderPlaces() {
  $("#placeList").innerHTML = state.places
    .map(
      (place) => `
    <div class="list-row">
      <div class="row-main"><span class="row-title ${place.done ? "task-completed" : ""}">${safe(place.name)}</span>
      <span class="row-sub">${safe(place.notes || t("No notes", "مفيش ملاحظات"))}</span></div>
      <button class="small-button" data-toggle-place="${safe(place.id)}">${place.done ? t("Done", "تم") : t("Pending", "متبقي")}</button>
      <button class="delete-button" data-delete-place="${safe(place.id)}" aria-label="${t("Delete", "حذف")}">×</button>
    </div>`,
    )
    .join("");
  $("#placeEmpty").classList.toggle("show", state.places.length === 0);
}

function renderAll() {
  renderDashboard();
  renderTasks();
  renderMoney();
  renderBills();
  renderPlaces();
  $("#year").textContent = new Date().getFullYear();
}

// Navigation
$$(".nav-link").forEach((button) =>
  button.addEventListener("click", () => showView(button.dataset.view)),
);
$$("[data-goto]").forEach((button) =>
  button.addEventListener("click", () => showView(button.dataset.goto)),
);
$("#menuButton").addEventListener("click", () =>
  $("#sidebar").classList.toggle("open"),
);
document.addEventListener("click", (event) => {
  if (
    window.innerWidth <= 800 &&
    $("#sidebar").classList.contains("open") &&
    !$("#sidebar").contains(event.target) &&
    !$("#menuButton").contains(event.target)
  ) {
    $("#sidebar").classList.remove("open");
  }
});
$("#languageButton").addEventListener("click", () => {
  language = language === "en" ? "ar" : "en";
  localStorage.setItem("nest-language", language);
  updateLanguage();
});

// Tasks
$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#taskName").value.trim();
  if (!name) return;
  state.tasks.push({
    id: id(),
    name,
    date: $("#taskDate").value,
    completed: false,
  });
  saveState();
  event.target.reset();
  $("#taskDate").value = today();
  renderAll();
  toast(t("Task added", "تمت إضافة المهمة"));
});
$$(".filter").forEach((button) =>
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    renderTasks();
  }),
);

document.addEventListener("change", (event) => {
  const toggleTask = event.target.dataset.toggleTask;
  if (toggleTask) {
    const task = state.tasks.find((x) => x.id === toggleTask);
    if (task) {
      task.completed = event.target.checked;
      saveState();
      renderAll();
    }
  }
});

document.addEventListener("click", (event) => {
  const taskId = event.target.dataset.deleteTask;
  if (taskId) {
    state.tasks = state.tasks.filter((x) => x.id !== taskId);
    saveState();
    renderAll();
    toast(t("Task deleted", "تم حذف المهمة"));
  }
});

// Income and expenses
$("#transactionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const description = $("#transactionDescription").value.trim();
  const amount = Number($("#transactionAmount").value);
  const date = $("#transactionDate").value;
  if (!description || amount <= 0 || !date) return;

  state.transactions.push({
    id: id(),
    type: $("#transactionType").value,
    description,
    amount,
    date,
  });
  saveState();
  event.target.reset();
  $("#transactionDate").value = today();
  renderAll();
  toast(t("Transaction saved", "تم حفظ الحركة المالية"));
});

document.addEventListener("click", (event) => {
  const transactionId = event.target.dataset.deleteTransaction;
  if (transactionId) {
    state.transactions = state.transactions.filter(
      (x) => x.id !== transactionId,
    );
    saveState();
    renderAll();
  }
});

// Bills
$("#billForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#billName").value.trim();
  const amount = Number($("#billAmount").value);
  const date = $("#billDate").value;
  if (!name || amount <= 0 || !date) return;

  state.bills.push({ id: id(), name, amount, date, paid: false });
  saveState();
  event.target.reset();
  $("#billDate").value = today();
  renderAll();
  toast(t("Bill added", "تمت إضافة الفاتورة"));
});

document.addEventListener("click", (event) => {
  const toggleBill = event.target.dataset.toggleBill;
  const deleteBill = event.target.dataset.deleteBill;
  if (toggleBill) {
    const bill = state.bills.find((x) => x.id === toggleBill);
    if (bill) bill.paid = !bill.paid;
    saveState();
    renderAll();
  }
  if (deleteBill) {
    state.bills = state.bills.filter((x) => x.id !== deleteBill);
    saveState();
    renderAll();
  }
});

// Places and errands
$("#placeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#placeName").value.trim();
  if (!name) return;

  state.places.push({
    id: id(),
    name,
    notes: $("#placeNotes").value.trim(),
    done: false,
  });
  saveState();
  event.target.reset();
  renderAll();
  toast(t("Place added", "تمت إضافة المكان"));
});

document.addEventListener("click", (event) => {
  const togglePlace = event.target.dataset.togglePlace;
  const deletePlace = event.target.dataset.deletePlace;
  if (togglePlace) {
    const place = state.places.find((x) => x.id === togglePlace);
    if (place) place.done = !place.done;
    saveState();
    renderAll();
  }
  if (deletePlace) {
    state.places = state.places.filter((x) => x.id !== deletePlace);
    saveState();
    renderAll();
  }
});

// Initial setup
$("#taskDate").value = today();
$("#billDate").value = today();
$("#transactionDate").value = today();
updateLanguage();
