
const STORAGE_KEY = "tasks-v1";

const $ = (selector) => document.querySelector(selector);

const elements = {
  list: $("#task-list"),
  empty: $("#empty-state"),
  dialog: $("#task-dialog"),
  form: $("#task-form"),
  title: $("#task-title"),
  description: $("#task-description"),
  priority: $("#task-priority"),
  due: $("#task-due"),
  id: $("#task-id"),
  error: $("#form-error"),
  search: $("#search-input"),
  sort: $("#sort-select"),
  toast: $("#toast"),
};

let tasks = loadTasks();
let currentFilter = "all";
let toastTimer;

const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function loadTasks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((task) =>
      task &&
      typeof task.id === "string" &&
      typeof task.title === "string" &&
      typeof task.completed === "boolean" &&
      ["low", "medium", "high"].includes(task.priority)
    );
  } catch (error) {
    console.error("Could not load saved tasks:", error);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error("Could not save tasks:", error);
    showToast("Could not save tasks in this browser.");
    return false;
  }
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function isOverdue(task) {
  if (!task.dueDate || task.completed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${task.dueDate}T00:00:00`) < today;
}

function getVisibleTasks() {
  const query = elements.search.value.trim().toLowerCase();

  const filtered = tasks.filter((task) => {
    const matchesFilter =
      currentFilter === "all" ||
      (currentFilter === "active" && !task.completed) ||
      (currentFilter === "completed" && task.completed);

    const searchable = `${task.title} ${task.description}`.toLowerCase();
    return matchesFilter && searchable.includes(query);
  });

  const sortBy = elements.sort.value;

  filtered.sort((a, b) => {
    if (sortBy === "due") {
      if (!a.dueDate && !b.dueDate) return b.createdAt - a.createdAt;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }

    if (sortBy === "priority") {
      const weights = { high: 3, medium: 2, low: 1 };
      return weights[b.priority] - weights[a.priority] ||
        b.createdAt - a.createdAt;
    }

    return b.createdAt - a.createdAt;
  });

  return filtered;
}

function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const active = total - completed;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  $("#all-count").textContent = total;
  $("#active-count").textContent = active;
  $("#completed-count").textContent = completed;

  $("#total-stat").textContent = total;
  $("#active-stat").textContent = active;
  $("#completed-stat").textContent = completed;

  $("#progress-percent").textContent = `${percent}%`;
  $("#progress-fill").style.width = `${percent}%`;
  $("#visible-count").textContent = `(${getVisibleTasks().length})`;

  $("#progress-message").textContent =
    total === 0
      ? "Add your first task to get started."
      : percent === 100
        ? "Amazing! You completed every task."
        : `${completed} of ${total} tasks completed. Keep going!`;
}

function renderTasks() {
  const visibleTasks = getVisibleTasks();

  elements.list.innerHTML = visibleTasks.map((task) => {
    const dueLabel = task.dueDate
      ? `<span class="due-date ${isOverdue(task) ? "overdue" : ""}">◷ ${escapeHTML(formatDate(task.dueDate))}${isOverdue(task) ? " · Overdue" : ""}</span>`
      : "";

    const description = task.description
      ? `<p class="task-description">${escapeHTML(task.description)}</p>`
      : "";

    return `
      <article class="task-item ${task.completed ? "is-completed" : ""}">
        <button
          class="task-check"
          type="button"
          data-action="toggle"
          data-id="${escapeHTML(task.id)}"
          aria-label="${task.completed ? "Mark as active" : "Mark as completed"}"
          aria-pressed="${task.completed}"
        >${task.completed ? "✓" : ""}</button>

        <div class="task-main">
          <h3 class="task-title">${escapeHTML(task.title)}</h3>
          ${description}
          <div class="task-meta">
            <span class="priority priority-${task.priority}">
              ${priorityLabels[task.priority]} priority
            </span>
            ${dueLabel}
          </div>
        </div>

        <div class="task-actions">
          <button class="icon-button" type="button" data-action="edit"
            data-id="${escapeHTML(task.id)}" aria-label="Edit ${escapeHTML(task.title)}">✎</button>
          <button class="icon-button delete-button" type="button" data-action="delete"
            data-id="${escapeHTML(task.id)}" aria-label="Delete ${escapeHTML(task.title)}">×</button>
        </div>
      </article>
    `;
  }).join("");

  elements.empty.hidden = visibleTasks.length > 0;
  elements.list.hidden = visibleTasks.length === 0;
  updateStats();
  updateFilterButtons();
}

function updateFilterButtons() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const isActive = button.dataset.filter === currentFilter;
    button.classList.toggle("active", isActive);

    if (button.classList.contains("filter-tab")) {
      button.setAttribute("aria-pressed", String(isActive));
    }
  });
}

function setFilter(filter) {
  currentFilter = filter;
  renderTasks();
}

function openNewTaskDialog() {
  elements.form.reset();
  elements.id.value = "";
  elements.priority.value = "medium";
  elements.error.textContent = "";
  $("#dialog-title").textContent = "Add a task";
  $("#dialog-eyebrow").textContent = "NEW TASK";
  $("#save-task-button").textContent = "Save task";
  elements.dialog.showModal();
  elements.title.focus();
}

function openEditDialog(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  elements.form.reset();
  elements.id.value = task.id;
  elements.title.value = task.title;
  elements.description.value = task.description || "";
  elements.priority.value = task.priority;
  elements.due.value = task.dueDate || "";
  elements.error.textContent = "";

  $("#dialog-title").textContent = "Edit task";
  $("#dialog-eyebrow").textContent = "UPDATE TASK";
  $("#save-task-button").textContent = "Save changes";
  elements.dialog.showModal();
  elements.title.focus();
}

function closeDialog() {
  elements.dialog.close();
  elements.error.textContent = "";
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2600);
}

function handleSubmit(event) {
  event.preventDefault();
  elements.error.textContent = "";

  const title = elements.title.value.trim();
  const description = elements.description.value.trim();
  const priority = elements.priority.value;
  const dueDate = elements.due.value;
  const id = elements.id.value;

  if (!title) {
    elements.error.textContent = "Please enter a task title.";
    elements.title.focus();
    return;
  }

  if (!["low", "medium", "high"].includes(priority)) {
    elements.error.textContent = "Please select a valid priority.";
    return;
  }

  if (dueDate && Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime())) {
    elements.error.textContent = "Please enter a valid due date.";
    return;
  }

  if (id) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) {
      elements.error.textContent = "This task could not be found.";
      return;
    }

    tasks[index] = {
      ...tasks[index],
      title,
      description,
      priority,
      dueDate,
    };

    if (!saveTasks()) return;
    closeDialog();
    renderTasks();
    showToast("Task updated successfully.");
    return;
  }

  tasks.push({
    id: makeId(),
    title,
    description,
    priority,
    dueDate,
    completed: false,
    createdAt: Date.now(),
  });

  if (!saveTasks()) {
    tasks.pop();
    return;
  }

  closeDialog();
  setFilter("all");
  renderTasks();
  showToast("Task added successfully.");
}

function toggleTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  task.completed = !task.completed;

  if (!saveTasks()) {
    task.completed = !task.completed;
    return;
  }

  renderTasks();
  showToast(task.completed ? "Task completed!" : "Task marked as active.");
}

function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  const confirmed = window.confirm(`Delete "${task.title}"?`);
  if (!confirmed) return;

  const oldTasks = tasks;
  tasks = tasks.filter((item) => item.id !== id);

  if (!saveTasks()) {
    tasks = oldTasks;
    return;
  }

  renderTasks();
  showToast("Task deleted.");
}

elements.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "toggle") toggleTask(id);
  if (action === "edit") openEditDialog(id);
  if (action === "delete") deleteTask(id);
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

$("#add-task-button").addEventListener("click", openNewTaskDialog);
$("#empty-add-button").addEventListener("click", openNewTaskDialog);
$("#close-dialog").addEventListener("click", closeDialog);
$("#cancel-dialog").addEventListener("click", closeDialog);
elements.form.addEventListener("submit", handleSubmit);
elements.search.addEventListener("input", renderTasks);
elements.sort.addEventListener("change", renderTasks);

$("#year").textContent = new Date().getFullYear();

$("#today-label").textContent = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date()).toUpperCase();

renderTasks();
