// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCTYqljDh3hmazRCgpuUssA4jDBPdrzPpo",
  authDomain: "webertechsales.firebaseapp.com",
  databaseURL: "https://webertechsales-default-rtdb.firebaseio.com",
  projectId: "webertechsales",
  storageBucket: "webertechsales.appspot.com",
  messagingSenderId: "543979301868",
  appId: "1:543979301868:web:7250f00bdf7d46db10aec9"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

const loginBtn = document.getElementById("loginBtn");
const resetLink = document.getElementById("resetLink");

loginBtn.addEventListener("click", login);
resetLink.addEventListener("click", resetPassword);

let currentUserEmail = "";
let currentUserName = "";
let stockCache = {}; // Cache stock data for auto-fill

function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  if (!email || !password) return alert("Please enter credentials");

  auth.signInWithEmailAndPassword(email, password)
    .then(cred => {
      const uid = cred.user.uid;
      currentUserEmail = email;
      return db.ref("users/" + uid).once("value");
    })
    .then(snapshot => {
      const userData = snapshot.val();
      if (!userData || !userData.role) {
        alert("No role assigned in DB");
        return;
      }

      currentUserName = userData.name || "User";
      const greeting = getGreeting();
      document.getElementById("greeting").innerText = `${greeting}, ${currentUserName}!`;
      document.getElementById("userRole").innerText = "Role: " + userData.role;
      document.getElementById("userEmail").innerText = "Logged in as: " + currentUserEmail;

      document.getElementById("loginPage").style.display = "none";
      document.getElementById("dashboard").style.display = "block";

      if (userData.role === "admin") {
        document.getElementById("adminSection").style.display = "block";
        document.getElementById("categorySummary").style.display = "block";
      }

      loadStock();
      loadSales();
      loadExpenses();
      populateEmployeeFilter();
    })
    .catch(err => alert("Login failed: " + err.message));
}

function logout() {
  auth.signOut().then(() => {
    document.getElementById("loginPage").style.display = "block";
    document.getElementById("dashboard").style.display = "none";
    location.reload();
  });
}

function resetPassword() {
  const email = prompt("Enter your email to reset password:");
  if (!email) return;
  auth.sendPasswordResetEmail(email)
    .then(() => alert("Password reset email sent!"))
    .catch(err => alert("Error: " + err.message));
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  else if (hour < 18) return "Good afternoon";
  else return "Good evening";
}

// === Pagination helper updated to support Prev/Next and custom options ===
function paginateTable(tableId, rowsPerPageSelectId, pageSelectId, defaultRows = 5) {
  const table = document.getElementById(tableId);
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  let currentPage = 1;
  let rowsPerPage = defaultRows;

  // derive prev/next IDs from rowsPerPageSelectId (stockRowsPerPage -> stockPrev / stockNext)
  const prevId = rowsPerPageSelectId.replace("RowsPerPage", "Prev");
  const nextId = rowsPerPageSelectId.replace("RowsPerPage", "Next");

  function renderTable() {
    rows.forEach((row, index) => {
      row.style.display = (index >= (currentPage - 1) * rowsPerPage && index < currentPage * rowsPerPage) ? "" : "none";
    });
    updatePageSelect();
    // enable/disable prev-next
    const totalPages = Math.ceil(rows.length / rowsPerPage) || 1;
    const prevBtn = document.getElementById(prevId);
    const nextBtn = document.getElementById(nextId);
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }

  function updatePageSelect() {
    const totalPages = Math.ceil(rows.length / rowsPerPage) || 1;
    const pageSelect = document.getElementById(pageSelectId);
    pageSelect.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = `Page ${i}`;
      if (i === currentPage) option.selected = true;
      pageSelect.appendChild(option);
    }
  }

  document.getElementById(rowsPerPageSelectId).addEventListener("change", function () {
    rowsPerPage = parseInt(this.value);
    currentPage = 1;
    renderTable();
  });

  document.getElementById(pageSelectId).addEventListener("change", function () {
    currentPage = parseInt(this.value);
    renderTable();
  });

  const prevBtn = document.getElementById(prevId);
  const nextBtn = document.getElementById(nextId);
  if (prevBtn) prevBtn.addEventListener("click", () => {
    if (currentPage > 1) currentPage--;
    renderTable();
    document.getElementById(pageSelectId).value = currentPage;
  });
  if (nextBtn) nextBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(rows.length / rowsPerPage) || 1;
    if (currentPage < totalPages) currentPage++;
    renderTable();
    document.getElementById(pageSelectId).value = currentPage;
  });

  renderTable();
}

// STOCK
function addStock() {
  const item = document.getElementById("stockItem").value.trim();
  const qty = parseInt(document.getElementById("stockQty").value);
  const price = parseFloat(document.getElementById("stockPrice").value);
  const buyPriceInput = document.getElementById("stockBuyPrice").value;
  const buyPrice = buyPriceInput === "" ? 0 : parseFloat(buyPriceInput);
  const category = document.getElementById("stockCategory").value;

  if (!item || !qty || !price || !category) return alert("Fill all stock fields (buy price optional but recommended)");

  const stockRef = db.ref("stock").push();
  stockRef.set({ item, qty, price, buyPrice: buyPrice || 0, category })
    .then(() => {
      loadStock();
      document.getElementById("stockItem").value = "";
      document.getElementById("stockQty").value = "";
      document.getElementById("stockPrice").value = "";
      document.getElementById("stockBuyPrice").value = "";
      document.getElementById("stockCategory").value = "";
    });
}

function loadStock() {
  db.ref("stock").once("value", snapshot => {
    const tbody = document.querySelector("#stockTable tbody");
    const suggestionList = document.getElementById("stockSuggestions");
    tbody.innerHTML = "";
    suggestionList.innerHTML = "";
    stockCache = {}; // reset cache

    snapshot.forEach(child => {
      const s = child.val();
      stockCache[s.item] = { ...s, id: child.key }; // cache for later use

      // stock table row with editable buy price
      const tr = document.createElement("tr");
      const buyPriceDisplay = (s.buyPrice !== undefined && s.buyPrice !== null && s.buyPrice !== "") ? parseFloat(s.buyPrice).toFixed(2) : "0.00";
      const totalBuying = ((s.buyPrice || 0) * (s.qty || 0)).toFixed(2);

      tr.innerHTML = `
        <td>${s.item}</td>
        <td>${s.qty}</td>
        <td>${parseFloat(s.price).toFixed(2)}</td>
        <td><input type="number" min="0" step="0.01" value="${buyPriceDisplay}" style="width:110px" onchange="updateBuyPrice('${child.key}', this.value, '${s.item}')"></td>
        <td>${totalBuying}</td>
        <td>${s.category}</td>
        <td>
          <button onclick="deleteStock('${child.key}')">Delete</button>
        </td>`;
      tbody.appendChild(tr);

      // suggestion list
      const option = document.createElement("option");
      option.value = s.item;
      suggestionList.appendChild(option);
    });

    // init pagination (stock)
    paginateTable("stockTable", "stockRowsPerPage", "stockPageSelect", parseInt(document.getElementById("stockRowsPerPage").value || 5));
  });
}

function updateBuyPrice(stockId, newBuyPrice, itemName) {
  const b = parseFloat(newBuyPrice);
  if (isNaN(b) || b < 0) return alert("Invalid buy price");

  // update stock buy price first
  db.ref("stock/" + stockId).update({ buyPrice: b }).then(() => {
    // update local cache (if loaded)
    if (stockCache[itemName]) stockCache[itemName].buyPrice = b;

    // Now update all sales that reference this item:
    db.ref("sales").once("value").then(snapshot => {
      const updates = {};
      snapshot.forEach(child => {
        const s = child.val();
        if (s && s.item === itemName) {
          // recalc profit using the new buy price
          const qty = parseFloat(s.qty || 0);
          const sellingPrice = parseFloat(s.price || 0);
          const discount = parseFloat(s.discount || 0);
          const newProfit = parseFloat(((sellingPrice - b) * qty - discount).toFixed(2));
          updates[child.key] = { buyingPrice: parseFloat(b.toFixed(2)), profit: newProfit };
        }
      });

      // apply updates in batch
      const promises = [];
      for (const saleKey in updates) {
        promises.push(db.ref("sales/" + saleKey).update(updates[saleKey]));
      }

      return Promise.all(promises);
    }).then(() => {
      // reload everything that depends on these values
      loadStock();
      loadSales();
      loadExpenses();
      populateEmployeeFilter();
    }).catch(err => {
      console.error("Error updating related sales:", err);
      loadStock();
      loadSales();
    });
  }).catch(err => {
    alert("Error updating buy price: " + err.message);
  });
}

function deleteStock(id) {
  if (confirm("Delete this stock item?")) {
    db.ref("stock/" + id).remove().then(loadStock);
  }
}

// SALES
document.getElementById("saleItem").addEventListener("input", autoFillSaleDetails);

function autoFillSaleDetails() {
  const itemName = document.getElementById("saleItem").value.trim();
  if (stockCache[itemName]) {
    const s = stockCache[itemName];
    document.getElementById("salePrice").value = parseFloat(s.price).toFixed(2);
    document.getElementById("saleCategory").value = s.category;
    // autopopulate buying price into the sale form
    document.getElementById("saleBuyingPrice").value = (s.buyPrice !== undefined ? parseFloat(s.buyPrice).toFixed(2) : "0.00");
  } else {
    // clear buying price if item not found
    document.getElementById("saleBuyingPrice").value = "";
    document.getElementById("saleBuyingPrice").value = "";
    document.getElementById("saleCategory").value = "";
  }
}

function recordSale() {
  const item = document.getElementById("saleItem").value.trim();
  const qty = parseInt(document.getElementById("saleQty").value);
  const price = parseFloat(document.getElementById("salePrice").value);
  const discountInput = document.getElementById("saleDiscount").value;
  const discount = discountInput === "" ? 0 : parseFloat(discountInput);
  const category = document.getElementById("saleCategory").value;
  const method = document.getElementById("paymentMethod").value;
  const timestamp = new Date().toISOString();

  // validations
  if (!item || !qty || !price || !category || !method) return alert("Fill all sale fields (discount optional)");
  if (isNaN(discount) || discount < 0) return alert("Invalid discount");
  if (discount > 50) return alert("Discount cannot exceed KES 50");

  // Check stock availability
  if (!stockCache[item]) return alert("Item not found in stock!");
  const stockItem = stockCache[item];
  if (qty > stockItem.qty) return alert(`Not enough stock! Only ${stockItem.qty} available.`);

  // buying price from stock cache (fallback to 0)
  const buyingPrice = stockItem.buyPrice ? parseFloat(stockItem.buyPrice) : 0;

  const total = parseFloat((price * qty).toFixed(2));
  // profit per sale entry: (price - buyingPrice) * qty - discount
  const profit = parseFloat(((price - buyingPrice) * qty - discount).toFixed(2));

  const saleData = {
    item,
    qty,
    price: parseFloat(price.toFixed(2)),
    total,
    category,
    method,
    timestamp,
    user: currentUserEmail,
    name: currentUserName,
    buyingPrice: parseFloat(buyingPrice.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    profit: profit
  };

  db.ref("sales").push(saleData)
    .then(() => {
      // reduce stock
      const newQty = stockItem.qty - qty;
      db.ref("stock/" + stockItem.id).update({ qty: newQty }).then(() => {
        loadStock();
      });

      // clear inputs
      document.getElementById("saleItem").value = "";
      document.getElementById("saleQty").value = "";
      document.getElementById("salePrice").value = "";
      document.getElementById("saleBuyingPrice").value = "";
      document.getElementById("saleDiscount").value = "";
      document.getElementById("saleCategory").value = "";
      loadSales();
      populateEmployeeFilter();
    })
    .catch(err => alert("Error saving sale: " + err.message));
}

function loadSales() {
  db.ref("sales").once("value", snapshot => {
    const tbody = document.querySelector("#salesTable tbody");
    tbody.innerHTML = "";
    let totalSales = 0;
    const userSales = {};
    const categorySales = {};
    let totalProfitFromSales = 0;

    snapshot.forEach(child => {
      const s = child.val();
      totalSales += s.total || 0;
      totalProfitFromSales += s.profit || 0;

      if (!userSales[s.name]) userSales[s.name] = 0;
      userSales[s.name] += s.total || 0;

      if (!categorySales[s.category]) categorySales[s.category] = 0;
      categorySales[s.category] += s.total || 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${new Date(s.timestamp).toLocaleString()}</td>
        <td>${s.name || s.user}</td>
        <td>${s.item}</td>
        <td>${s.category}</td>
        <td>${s.qty}</td>
        <td>${parseFloat(s.price).toFixed(2)}</td>
        <td>${(s.buyingPrice !== undefined ? parseFloat(s.buyingPrice).toFixed(2) : "0.00")}</td>
        <td>${(s.discount !== undefined ? parseFloat(s.discount).toFixed(2) : "0.00")}</td>
        <td>${(s.profit !== undefined ? parseFloat(s.profit).toFixed(2) : "0.00")}</td>
        <td>${parseFloat(s.total).toFixed(2)}</td>
        <td>${s.method}</td>
        <td><button onclick="deleteSale('${child.key}')">Delete</button></td>`;
      tbody.appendChild(tr);
    });

    document.getElementById("totalSalesAmount").innerText = `KES ${totalSales.toFixed(2)}`;
    document.getElementById("dailyWage").innerText = `KES ${calculateWage(totalSales)}`;
    updateUserReport(userSales);
    updateCategoryReport(categorySales);
    document.getElementById("totalProfitFromSales").innerText = `KES ${totalProfitFromSales.toFixed(2)}`;

    // After loading sales, load expenses and compute net profit
    computeNetProfit(totalProfitFromSales);

    // init pagination (sales)
    paginateTable("salesTable", "salesRowsPerPage", "salesPageSelect", parseInt(document.getElementById("salesRowsPerPage").value || 5));
  });
}

function deleteSale(id) {
  if (confirm("Delete this sale record?")) {
    db.ref("sales/" + id).remove().then(() => {
      loadSales();
      populateEmployeeFilter();
    });
  }
}

function calculateWage(total) {
  if (total >= 1300) return 300;
  else if (total >= 800) return 250;
  else if (total >= 650) return 150;
  else if (total >= 350) return 100;
  return 0;
}

function updateUserReport(userSales) {
  const tbody = document.querySelector("#userReportTable tbody");
  tbody.innerHTML = "";
  for (let user in userSales) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${user}</td><td>${userSales[user].toFixed(2)}</td>`;
    tbody.appendChild(tr);
  }
}

function updateCategoryReport(categorySales) {
  const tbody = document.querySelector("#categoryReportTable tbody");
  tbody.innerHTML = "";
  for (let cat in categorySales) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${cat}</td><td>${categorySales[cat].toFixed(2)}</td>`;
    tbody.appendChild(tr);
  }
}

// FILTERS
function filterSales() {
  const startDateInput = document.getElementById("startDate").value;
  const endDateInput = document.getElementById("endDate").value;
  const category = document.getElementById("filterCategory").value;
  const employee = document.getElementById("filterEmployee").value;

  const start = startDateInput ? new Date(startDateInput + "T00:00:00") : null;
  const end = endDateInput ? new Date(endDateInput + "T23:59:59") : null;

  db.ref("sales").once("value", snapshot => {
    const tbody = document.querySelector("#salesTable tbody");
    tbody.innerHTML = "";
    let totalSales = 0;
    const userSales = {};

    snapshot.forEach(child => {
      const s = child.val();
      const time = new Date(s.timestamp);

      const matchDate = (!start || time >= start) && (!end || time <= end);
      const matchCategory = !category || s.category === category;
      const matchEmployee = !employee || s.name === employee;

      if (matchDate && matchCategory && matchEmployee) {
        totalSales += s.total || 0;

        if (!userSales[s.name]) userSales[s.name] = 0;
        userSales[s.name] += s.total || 0;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${time.toLocaleString()}</td>
          <td>${s.name || s.user}</td>
          <td>${s.item}</td>
          <td>${s.category}</td>
          <td>${s.qty}</td>
          <td>${parseFloat(s.price).toFixed(2)}</td>
          <td>${(s.buyingPrice !== undefined ? parseFloat(s.buyingPrice).toFixed(2) : "0.00")}</td>
          <td>${(s.discount !== undefined ? parseFloat(s.discount).toFixed(2) : "0.00")}</td>
          <td>${(s.profit !== undefined ? parseFloat(s.profit).toFixed(2) : "0.00")}</td>
          <td>${parseFloat(s.total).toFixed(2)}</td>
          <td>${s.method}</td>
          <td><button onclick="deleteSale('${child.key}')">Delete</button></td>`;
        tbody.appendChild(tr);
      }
    });

    document.getElementById("totalSalesAmount").innerText = `KES ${totalSales.toFixed(2)}`;
    document.getElementById("dailyWage").innerText = `KES ${calculateWage(totalSales)}`;
    updateUserReport(userSales);

    // re-init pagination for filtered table
    paginateTable("salesTable", "salesRowsPerPage", "salesPageSelect", parseInt(document.getElementById("salesRowsPerPage").value || 5));
  });
}

function populateEmployeeFilter() {
  const employeeSet = new Set();

  db.ref("sales").once("value", snapshot => {
    snapshot.forEach(child => {
      const s = child.val();
      if (s.name) employeeSet.add(s.name);
    });

    const filterEmployee = document.getElementById("filterEmployee");
    filterEmployee.innerHTML = '<option value="">All Employees</option>';
    employeeSet.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.innerText = name;
      filterEmployee.appendChild(option);
    });
  });
}

// EXPENSES
function addExpense() {
  const date = document.getElementById("expenseDate").value;
  const type = document.getElementById("expenseType").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const amount = parseFloat(document.getElementById("expenseAmount").value);

  if (!date || !type || !desc || isNaN(amount) || amount <= 0) return alert("Fill all expense fields correctly");

  db.ref("expenses").push({ date, type, desc, amount })
    .then(() => {
      document.getElementById("expenseDate").value = "";
      document.getElementById("expenseType").value = "";
      document.getElementById("expenseDesc").value = "";
      document.getElementById("expenseAmount").value = "";
      loadExpenses();
      loadSales(); // recompute net profit
    })
    .catch(err => alert("Error adding expense: " + err.message));
}

function loadExpenses() {
  db.ref("expenses").once("value", snapshot => {
    const tbody = document.querySelector("#expensesTable tbody");
    tbody.innerHTML = "";
    let totalExpenses = 0;

    snapshot.forEach(child => {
      const e = child.val();
      totalExpenses += parseFloat(e.amount || 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${e.date}</td>
        <td>${e.type}</td>
        <td>${e.desc}</td>
        <td>${parseFloat(e.amount).toFixed(2)}</td>
        <td><button onclick="deleteExpense('${child.key}')">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("totalExpensesAmount").innerText = `KES ${totalExpenses.toFixed(2)}`;
    // after loading expenses, recompute net profit using existing sales totals
    db.ref("sales").once("value", snap => {
      let totalProfitFromSales = 0;
      snap.forEach(c => {
        const s = c.val();
        totalProfitFromSales += parseFloat(s.profit || 0);
      });
      computeNetProfit(totalProfitFromSales);
    });

  });
}

function deleteExpense(id) {
  if (confirm("Delete this expense record?")) {
    db.ref("expenses/" + id).remove().then(() => {
      loadExpenses();
      loadSales();
    });
  }
}

// PROFIT ANALYSIS
function computeNetProfit(totalProfitFromSales) {
  db.ref("expenses").once("value", snapshot => {
    let totalExpenses = 0;
    snapshot.forEach(child => {
      const e = child.val();
      totalExpenses += parseFloat(e.amount || 0);
    });

    document.getElementById("totalExpensesAmount").innerText = `KES ${totalExpenses.toFixed(2)}`;
    document.getElementById("totalProfitFromSales").innerText = `KES ${totalProfitFromSales.toFixed(2)}`;
    const net = parseFloat((totalProfitFromSales - totalExpenses).toFixed(2));
    document.getElementById("netProfit").innerText = `KES ${net.toFixed(2)}`;
  });
}

// EXPORT
function exportTableToExcel(tableID, filename = "") {
  const table = document.getElementById(tableID);
  const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
  return XLSX.writeFile(wb, filename + ".xlsx");
}