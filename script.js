/*  ============================================================
    Student Management System — script.js
    All logic lives here: storage, validation, rendering, search.

    Key design decisions:
    • Students are stored as an array of objects in localStorage.
    • Every mutating action (add / delete) calls saveStudents() and
      then re-renders the whole table — simple and reliable.
    • Search filters the in-memory array; nothing is written to
      storage during a search operation.
    ============================================================ */

"use strict";

/* ─────────────────────────────────────────────
   1. GRAB DOM REFERENCES
   We read these once at startup and reuse them.
   ───────────────────────────────────────────── */
const form         = document.getElementById("studentForm");
const nameInput    = document.getElementById("studentName");
const rollInput    = document.getElementById("rollNumber");
const deptInput    = document.getElementById("department");
const phoneInput   = document.getElementById("phone");

const nameError    = document.getElementById("nameError");
const rollError    = document.getElementById("rollError");
const deptError    = document.getElementById("deptError");
const phoneError   = document.getElementById("phoneError");

const tableBody    = document.getElementById("studentTableBody");
const emptyState   = document.getElementById("emptyState");
const searchInput  = document.getElementById("searchInput");

const totalStudentsEl = document.getElementById("totalStudents");
const totalDeptsEl    = document.getElementById("totalDepts");

const toast          = document.getElementById("toast");
const overlay        = document.getElementById("overlay");
const confirmDeleteBtn = document.getElementById("confirmDelete");
const cancelDeleteBtn  = document.getElementById("cancelDelete");
const dialogMsg        = document.getElementById("dialogMsg");

/* ─────────────────────────────────────────────
   2. IN-MEMORY STUDENT ARRAY
   On page load we pull from localStorage, or
   start with an empty array if nothing is saved.
   ───────────────────────────────────────────── */
let students = loadStudents();

/* ID of the student scheduled for deletion — set when the
   user clicks "Delete" and confirmed in the dialog. */
let pendingDeleteId = null;

/* ─────────────────────────────────────────────
   3. LOCAL STORAGE HELPERS
   ───────────────────────────────────────────── */

/**
 * loadStudents — reads and parses the JSON array from localStorage.
 * Returns an empty array if nothing is stored or parsing fails.
 */
function loadStudents() {
  try {
    return JSON.parse(localStorage.getItem("sms_students")) || [];
  } catch (e) {
    return [];
  }
}

/**
 * saveStudents — serialises the in-memory array and writes it to
 * localStorage so data survives a page refresh.
 */
function saveStudents() {
  localStorage.setItem("sms_students", JSON.stringify(students));
}

/* ─────────────────────────────────────────────
   4. VALIDATION HELPERS
   ───────────────────────────────────────────── */

/**
 * clearErrors — wipe all inline error messages and remove
 * the "invalid" CSS class from every input field.
 */
function clearErrors() {
  [nameError, rollError, deptError, phoneError].forEach(el => el.textContent = "");
  [nameInput, rollInput, deptInput, phoneInput].forEach(el => el.classList.remove("invalid"));
}

/**
 * setError — display an error on a specific field.
 * @param {HTMLElement} input   — the <input> element
 * @param {HTMLElement} errEl   — the <span> that shows the message
 * @param {string}      message — text to display
 */
function setError(input, errEl, message) {
  input.classList.add("invalid");
  errEl.textContent = message;
}

/**
 * validateForm — checks all four fields.
 * Returns true only when every field passes.
 * Also catches duplicate roll numbers.
 */
function validateForm() {
  clearErrors();
  let valid = true;

  const name  = nameInput.value.trim();
  const roll  = rollInput.value.trim();
  const dept  = deptInput.value.trim();
  const phone = phoneInput.value.trim();

  /* ── Name: required, letters only (allow spaces and hyphens) ── */
  if (!name) {
    setError(nameInput, nameError, "Student name is required.");
    valid = false;
  } else if (!/^[a-zA-Z\s\-']+$/.test(name)) {
    setError(nameInput, nameError, "Name must contain letters only.");
    valid = false;
  }

  /* ── Roll Number: required, no duplicates ── */
  if (!roll) {
    setError(rollInput, rollError, "Roll number is required.");
    valid = false;
  } else if (students.some(s => s.roll.toLowerCase() === roll.toLowerCase())) {
    setError(rollInput, rollError, "This roll number already exists.");
    valid = false;
  }

  /* ── Department: required ── */
  if (!dept) {
    setError(deptInput, deptError, "Department is required.");
    valid = false;
  }

  /* ── Phone: required, 7–15 digits (allows leading + and spaces) ── */
  if (!phone) {
    setError(phoneInput, phoneError, "Phone number is required.");
    valid = false;
  } else if (!/^\+?[\d\s\-]{7,15}$/.test(phone)) {
    setError(phoneInput, phoneError, "Enter a valid phone number (7–15 digits).");
    valid = false;
  }

  return valid;
}

/* ─────────────────────────────────────────────
   5. ADD STUDENT
   ───────────────────────────────────────────── */

/**
 * handleFormSubmit — triggered when the user clicks "Add Student".
 * Validates inputs, creates a student object, pushes it into the
 * array, persists to localStorage, then re-renders the table.
 */
form.addEventListener("submit", function (e) {
  e.preventDefault(); // stop the browser from reloading the page

  if (!validateForm()) return; // stop if any field is invalid

  /* Build the student object */
  const newStudent = {
    id:    Date.now(),           // unique numeric ID (timestamp)
    name:  nameInput.value.trim(),
    roll:  rollInput.value.trim(),
    dept:  deptInput.value.trim(),
    phone: phoneInput.value.trim(),
  };

  students.push(newStudent);    // add to the in-memory array
  saveStudents();               // persist to localStorage
  renderTable(students);        // refresh the table
  updateDashboard();            // refresh the stat cards
  form.reset();                 // clear the form fields
  clearErrors();                // clear any leftover error styles

  showToast("Student added successfully! 🎉", "success");
  nameInput.focus();            // move focus back to the first field
});

/* ─────────────────────────────────────────────
   6. DELETE STUDENT
   We use a two-step confirm dialog so the user
   can't accidentally delete a record.
   ───────────────────────────────────────────── */

/**
 * requestDelete — called when the user clicks the "Delete" button
 * in a table row. Stores the target student's ID and opens the
 * confirm dialog.
 * @param {number} id — the student's id field
 */
function requestDelete(id) {
  const student = students.find(s => s.id === id);
  if (!student) return;

  pendingDeleteId = id;
  dialogMsg.textContent =
    `Are you sure you want to remove "${student.name}" (${student.roll})?`;
  overlay.classList.add("active"); // show the dialog
}

/* "Yes, Delete" button in the dialog */
confirmDeleteBtn.addEventListener("click", function () {
  if (pendingDeleteId === null) return;

  /* Filter out the student with the matching ID */
  students = students.filter(s => s.id !== pendingDeleteId);
  saveStudents();
  renderTable(students);
  updateDashboard();

  closeDialog();
  showToast("Student removed.", "info");
});

/* "Cancel" button — just close without deleting */
cancelDeleteBtn.addEventListener("click", closeDialog);

/* Close dialog when clicking outside it (on the dark overlay) */
overlay.addEventListener("click", function (e) {
  if (e.target === overlay) closeDialog();
});

/** closeDialog — hides the confirm overlay and resets pending ID. */
function closeDialog() {
  overlay.classList.remove("active");
  pendingDeleteId = null;
}

/* ─────────────────────────────────────────────
   7. SEARCH
   Filters the array live as the user types;
   does NOT modify storage.
   ───────────────────────────────────────────── */

searchInput.addEventListener("input", function () {
  const query = this.value.trim().toLowerCase();

  if (!query) {
    renderTable(students); // show all when search is cleared
    return;
  }

  /* Keep only students whose name or roll number contains the query */
  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(query) ||
    s.roll.toLowerCase().includes(query)
  );

  renderTable(filtered);
});

/* ─────────────────────────────────────────────
   8. RENDER TABLE
   Clears the <tbody> and rebuilds it from the
   given array. Shows the empty-state block when
   the array has no entries.
   ───────────────────────────────────────────── */

/**
 * renderTable — rebuilds the student table from the provided array.
 * @param {Array} data — array of student objects to display
 */
function renderTable(data) {
  tableBody.innerHTML = ""; // wipe existing rows

  if (data.length === 0) {
    /* Show the "no students" placeholder */
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none"; // hide placeholder

  /* Build one <tr> per student */
  data.forEach(function (student) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><span class="roll-badge">${escapeHtml(student.roll)}</span></td>
      <td>${escapeHtml(student.name)}</td>
      <td>${escapeHtml(student.dept)}</td>
      <td>${escapeHtml(student.phone)}</td>
      <td>
        <button
          class="btn--delete"
          onclick="requestDelete(${student.id})"
          title="Delete ${escapeHtml(student.name)}"
          aria-label="Delete student ${escapeHtml(student.name)}"
        >
          🗑️ Delete
        </button>
      </td>
    `;

    tableBody.appendChild(tr);
  });
}

/* ─────────────────────────────────────────────
   9. DASHBOARD CARDS
   ───────────────────────────────────────────── */

/**
 * updateDashboard — recalculates and displays the summary stats.
 * Total students = students.length
 * Total departments = count of unique department names (case-insensitive)
 */
function updateDashboard() {
  const total = students.length;
  totalStudentsEl.textContent = total;

  /* Build a Set of lowercase department names to count unique values */
  const uniqueDepts = new Set(students.map(s => s.dept.toLowerCase().trim()));
  totalDeptsEl.textContent = uniqueDepts.size;
}

/* ─────────────────────────────────────────────
   10. TOAST NOTIFICATIONS
   ───────────────────────────────────────────── */

let toastTimer = null; // track the auto-hide timer so we can reset it

/**
 * showToast — briefly displays a coloured notification at the
 *             bottom-right corner of the screen.
 * @param {string} message — text to display
 * @param {string} type    — "success" | "error" | "info"
 */
function showToast(message, type = "info") {
  /* Reset any running timer so a new toast doesn't flash away too fast */
  if (toastTimer) {
    clearTimeout(toastTimer);
    toast.classList.remove("show");
  }

  toast.textContent = message;
  toast.className   = `toast toast--${type}`; // apply colour class

  /* Use a small delay so the browser registers the class change before
     we add "show" — required for the CSS transition to fire. */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });
  });

  /* Auto-hide after 3 seconds */
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

/* ─────────────────────────────────────────────
   11. SECURITY: HTML ESCAPING
   Always escape user-supplied text before
   inserting it into innerHTML to prevent XSS.
   ───────────────────────────────────────────── */

/**
 * escapeHtml — converts the five special HTML characters to their
 * entity equivalents so user input cannot inject tags.
 * @param  {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

/* ─────────────────────────────────────────────
   12. KEYBOARD ACCESSIBILITY
   Close the confirm dialog on Escape key.
   ───────────────────────────────────────────── */
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && overlay.classList.contains("active")) {
    closeDialog();
  }
});

/* ─────────────────────────────────────────────
   13. INITIALISE ON PAGE LOAD
   ───────────────────────────────────────────── */
renderTable(students);   // populate the table from localStorage
updateDashboard();       // set the initial card values
