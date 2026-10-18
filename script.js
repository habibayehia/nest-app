
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = "nest-life-organizer";
const BUDGET_KEY = "nest-daily-budget";
const BUDGET_ALERT_KEY = "nest-budget-alerted";
const BUDGET_SOUND_KEY = "nest-budget-sound";

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
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

// ==================== Daily Budget ====================

function getDailyBudget() {
  const saved = localStorage.getItem(BUDGET_KEY);

  if (saved === null || saved.trim() === "") return null;

  const amount = Number(saved);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function getTodayExpenses() {
  return state.transactions
    .filter(
      (item) =>
        item.type === "expense" &&
        item.date === today(),
    )
    .reduce((sum, item) => {
      const amount = Number(item.amount);
      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
    }, 0);
}

function renderBudget() {
  const input = $("#dailyBudget");
  const spentEl = $("#budgetSpent");
  const remainingEl = $("#budgetRemaining");
  const progressEl = $("#budgetProgress");
  const messageEl = $("#budgetMessage");
  const soundSelect = $("#budgetSound");

  if (
    !input ||
    !spentEl ||
    !remainingEl ||
    !progressEl ||
    !messageEl
  ) {
    return;
  }

  const budget = getDailyBudget();
  const spent = getTodayExpenses();

  input.value = budget === null ? "" : String(budget);

  if (soundSelect) {
    soundSelect.value =
      localStorage.getItem(BUDGET_SOUND_KEY) || "on";
  }

  spentEl.textContent =
    `${t("Spent today: ", "مصروفات النهارده: ")}${money(spent)}`;

  if (budget === null) {
    remainingEl.textContent = t(
      "Set your daily budget first.",
      "حددي ميزانيتك اليومية الأول.",
    );

    progressEl.style.width = "0%";
    messageEl.textContent = t(
      "Choose your own daily spending limit.",
      "اختاري الحد اليومي للمصاريف اللي يناسبك.",
    );
    messageEl.style.color = "";
    return;
  }

  const remaining = budget - spent;
  const percent = Math.min(100, (spent / budget) * 100);

  remainingEl.textContent =
    remaining >= 0
      ? `${t("Remaining: ", "المتبقي: ")}${money(remaining)}`
      : `${t("Over budget by: ", "تجاوزتي الميزانية بمقدار: ")}${money(Math.abs(remaining))}`;

  progressEl.style.width = `${percent}%`;
  progressEl.style.background =
    spent > budget ? "#ef6b73" : "#80d9b0";

  if (spent > budget) {
    messageEl.textContent = t(
      "Budget exceeded! Review today's spending.",
      "خدي بالك، إنتِ تجاوزتي ميزانية النهارده!",
    );
    messageEl.style.color = "#ef6b73";
  } else if (spent === budget) {
    messageEl.textContent = t(
      "You've reached your daily budget.",
      "وصلتي للحد اليومي للمصاريف.",
    );
    messageEl.style.color = "";
  } else {
    messageEl.textContent = t(
      "You're within your daily budget.",
      "إنتِ لسه داخل الميزانية اليومية.",
    );
    messageEl.style.color = "";
  }
}

function playBudgetAlarm() {
  if (localStorage.getItem(BUDGET_SOUND_KEY) === "off") return;

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    const audio = new AudioContextClass();

    audio.resume().then(() => {
      const playTone = (start, frequency) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.2, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);

        oscillator.connect(gain);
        gain.connect(audio.destination);

        oscillator.start(start);
        oscillator.stop(start + 0.31);
      };

      const start = audio.currentTime;
      playTone(start, 880);
      playTone(start + 0.38, 660);

      setTimeout(() => {
        audio.close().catch(() => {});
      }, 1000);
    }).catch(() => {
      // Some browsers block sound until the user interacts with the page.
    });
  } catch (error) {
    console.warn("Budget alarm could not play.", error);
  }
}

async function showBudgetNotification(message) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = t("NEST budget alert", "تنبيه ميزانية NEST");
  const options = {
    body: message,
    icon: "./nest-192.png",
    tag: "nest-daily-budget",
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;

      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return;
      }
    }

    new Notification(title, options);
  } catch (error) {
    console.warn("Budget notification could not be shown.", error);
  }
}

function checkBudgetAlert() {
  const budget = getDailyBudget();
  if (budget === null) return;

  const spent = getTodayExpenses();
  if (spent <= budget) return;

  const alertKey = `${today()}-${budget}`;
  if (localStorage.getItem(BUDGET_ALERT_KEY) === alertKey) return;

  localStorage.setItem(BUDGET_ALERT_KEY, alertKey);

  const message = t(
    `Daily budget exceeded! You've spent ${money(spent)} out of ${money(budget)}.`,
    `تجاوزتي الميزانية اليومية! صرفتي ${money(spent)} من أصل ${money(budget)}.`,
  );

  toast(message);
  playBudgetAlarm();
  showBudgetNotification(message);
}

// ==================== Language ====================

function updateLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.body.lang = language;
  $("#languageButton").textContent =
    language === "ar" ? "English" : "عربي";

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

  $("#billName").placeholder = t(
    "e.g. Internet",
    "مثال: فاتورة الإنترنت",
  );

  $("#placeName").placeholder = t(
    "e.g. Pick up a package",
    "مثال: استلام طلب",
  );

  $("#placeNotes").placeholder = t(
    "e.g. Near work",
    "مثال: قريب من الشغل",
  );

  const budgetInput = $("#dailyBudget");
  if (budgetInput) {
    budgetInput.placeholder = t(
      "Enter your daily budget",
      "اكتبي ميزانيتك اليومية بالجنيه",
    );
  }

  const active = $(".nav-link.active");
  if (active) {
    $("#pageTitle").textContent =
      active.querySelector("span").textContent;
  }

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
  if (active) {
    $("#pageTitle").textContent =
      active.querySelector("span").textContent;
  }

  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==================== Dashboard ====================

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
  $("#taskPercent").textContent =
    `${percent}% ${t("complete", "مكتمل")}`;
  $("#balanceStats").textContent = money(totals.balance);
  $("#incomeStats").textContent = money(thisMonth("income"));
  $("#expenseStats").textContent = money(thisMonth("expense"));

  const tasks = state.tasks.filter((x) => !x.completed).slice(0, 4);

  $("#dashboardTasks").innerHTML = tasks
    .map(
      (task) => `
    <div class="list-row">
      <input type="checkbox" class="task-checkbox" data-toggle-task="${safe(task.id)}" aria-label="${safe(task.name)}">
      <div class="row-main">
        <span class="row-title">${safe(task.name)}</span>
        <span class="row-sub">${safe(dateText(task.date))}</span>
      </div>
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
    <div class="list-row">
      <div class="row-main">
        <span class="row-title">${safe(bill.name)}</span>
        <span class="row-sub">${safe(dateText(bill.date))}</span>
      </div>
      <span class="row-amount">${money(bill.amount)}</span>
    </div>`,
    )
    .join("");

  $("#dashboardBillsEmpty").classList.toggle("show", bills.length === 0);
}

// ==================== Tasks ====================

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
    button.classList.toggle(
      "active",
      button.dataset.filter === currentFilter,
    ),
  );
}

// ==================== Money and Budget ====================

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
      <div class="row-main">
        <span class="row-title">${safe(item.description)}</span>
        <span class="row-sub">${safe(dateText(item.date))} · ${item.type === "income" ? t("Income", "دخل") : t("Expense", "مصروف")}</span>
      </div>
      <span class="row-amount ${item.type === "income" ? "green-text" : "red-text"}">${item.type === "income" ? "+" : "−"}${money(item.amount)}</span>
      <button class="delete-button" data-delete-transaction="${safe(item.id)}" aria-label="${t("Delete", "حذف")}">×</button>
    </div>`,
    )
    .join("");

  $("#transactionEmpty").classList.toggle(
    "show",
    transactions.length === 0,
  );

  renderBudget();
}

// ==================== Bills ====================

function renderBills() {
  const bills = [...state.bills].sort(
    (a, b) =>
      Number(a.paid) - Number(b.paid) ||
      a.date.localeCompare(b.date),
  );

  $("#billList").innerHTML = bills
    .map((bill) => {
      const overdue = !bill.paid && bill.date < today();

      return `<div class="list-row">
      <div class="row-main">
        <span class="row-title">${safe(bill.name)}</span>
        <span class="row-sub">${t("Due", "موعدها")}: ${safe(dateText(bill.date))} · ${money(bill.amount)}</span>
      </div>
      <span class="status ${bill.paid ? "paid" : overdue ? "overdue" : ""}">${bill.paid ? t("Paid", "مدفوعة") : overdue ? t("Overdue", "متأخرة") : t("Pending", "متبقية")}</span>
      <button class="small-button" data-toggle-bill="${safe(bill.id)}">${bill.paid ? t("Undo", "إلغاء") : t("Mark paid", "تم الدفع")}</button>
      <button class="delete-button" data-delete-bill="${safe(bill.id)}" aria-label="${t("Delete", "حذف")}">×</button>
    </div>`;
    })
    .join("");

  $("#billEmpty").classList.toggle("show", bills.length === 0);
}

// ==================== Places and Errands ====================

function renderPlaces() {
  $("#placeList").innerHTML = state.places
    .map(
      (place) => `
    <div class="list-row">
      <div class="row-main">
        <span class="row-title ${place.done ? "task-completed" : ""}">${safe(place.name)}</span>
        <span class="row-sub">${safe(place.notes || t("No notes", "مفيش ملاحظات"))}</span>
      </div>
      <button class="small-button" data-toggle-place="${safe(place.id)}">${place.done ? t("Done", "تم") : t("Pending", "متبقي")}</button>
      <button class="delete-button" data-delete-place="${safe(place.id)}" aria-label="${t("Delete", "حذف")}">×</button>
    </div>`,
    )
    .join("");

  $("#placeEmpty").classList.toggle("show", state.places.length === 0);
}

// ==================== Render All ====================

function renderAll() {
  renderDashboard();
  renderTasks();
  renderMoney();
  renderBills();
  renderPlaces();
  $("#year").textContent = new Date().getFullYear();
}

// ==================== Budget Controls ====================

$("#budgetForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("#dailyBudget");
  const budget = Number(input.value);

  if (
    input.value.trim() === "" ||
    !Number.isFinite(budget) ||
    budget <= 0
  ) {
    toast(t(
      "Enter a valid daily budget.",
      "اكتبي ميزانية يومية صحيحة.",
    ));
    return;
  }

  localStorage.setItem(BUDGET_KEY, String(budget));

  // Allow a new alert if the user changes the budget.
  localStorage.removeItem(BUDGET_ALERT_KEY);

  renderBudget();
  checkBudgetAlert();

  toast(t("Daily budget saved.", "تم حفظ الميزانية اليومية."));
});

$("#budgetSound").addEventListener("change", (event) => {
  localStorage.setItem(BUDGET_SOUND_KEY, event.target.value);
  toast(t("Sound setting saved.", "تم حفظ إعداد الصوت."));
});

$("#enableBudgetNotifications").addEventListener("click", async () => {
  const status = $("#budgetNotificationStatus");

  if (!("Notification" in window)) {
    status.textContent = t(
      "This browser does not support notifications.",
      "المتصفح ده لا يدعم الإشعارات.",
    );
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      status.textContent = t(
        "Notifications enabled on this browser.",
        "تم تفعيل الإشعارات على المتصفح ده.",
      );

      toast(t(
        "Notifications enabled.",
        "تم تفعيل الإشعارات.",
      ));
    } else {
      status.textContent = t(
        "Notifications are blocked. Allow them in browser settings.",
        "الإشعارات مرفوضة. اسمحي بيها من إعدادات المتصفح.",
      );
    }
  } catch (error) {
    status.textContent = t(
      "Could not enable notifications.",
      "حصلت مشكلة في تفعيل الإشعارات.",
    );
  }
});

// ==================== Navigation ====================

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

// ==================== Task Events ====================

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

// ==================== Income and Expenses ====================

$("#transactionForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const description = $("#transactionDescription").value.trim();
  const amount = Number($("#transactionAmount").value);
  const date = $("#transactionDate").value;

  if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
    return;
  }

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
  checkBudgetAlert();

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

// ==================== Bill Events ====================

$("#billForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("#billName").value.trim();
  const amount = Number($("#billAmount").value);
  const date = $("#billDate").value;

  if (!name || amount <= 0 || !date) return;

  state.bills.push({
    id: id(),
    name,
    amount,
    date,
    paid: false,
  });

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

// ==================== Place Events ====================

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

// ==================== Initial Setup ====================

$("#taskDate").value = today();
$("#billDate").value = today();
$("#transactionDate").value = today();

updateLanguage();
checkBudgetAlert();
