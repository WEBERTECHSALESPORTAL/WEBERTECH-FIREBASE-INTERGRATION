// stock.js
// Ensure firebase / db exist (safe init guard)
if (!window.firebaseInitialized) {
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
  window.firebaseInitialized = true;
}
window.db = window.db || firebase.database();
window.auth = window.auth || firebase.auth();
window.stockCache = window.stockCache || {};

// Add stock
function addStock() {
  const item = document.getElementById("stockItem").value.trim();
  const qty = parseInt(document.getElementById("stockQty").value);
  const price = parseFloat(document.getElementById("stockPrice").value);
  const buyPriceInput = document.getElementById("stockBuyPrice").value;
  const buyPrice = buyPriceInput === "" ? 0 : parseFloat(buyPriceInput);
  const category = document.getElementById("stockCategory").value;

  if (!item || isNaN(qty) || isNaN(price) || !category) return alert("Fill all stock fields (buy price optional but recommended)");

  const stockRef = db.ref("stock").push();
  stockRef.set({ item, qty, price, buyPrice: buyPrice || 0, category, editDelta: 0 })
    .then(() => {
      loadStock();
      document.getElementById("stockItem").value = "";
      document.getElementById("stockQty").value = "";
      document.getElementById("stockPrice").value = "";
      document.getElementById("stockBuyPrice").value = "";
      document.getElementById("stockCategory").value = "";
    })
    .catch(err => {
      console.error("Error adding stock:", err);
      alert("Failed to add stock.");
    });
}

function loadStock() {
  db.ref("stock").once("value", snapshot => {
    const tbody = document.querySelector("#stockTable tbody");
    const suggestionList = document.getElementById("stockSuggestions");
    tbody.innerHTML = "";
    if (suggestionList) suggestionList.innerHTML = "";
    window.stockCache = {}; // reset cache

    snapshot.forEach(child => {
      const s = child.val();
      // cache
      window.stockCache[s.item] = { ...s, id: child.key };

      const tr = document.createElement("tr");
      const buyPriceDisplay = (s.buyPrice !== undefined && s.buyPrice !== null && s.buyPrice !== "") ? parseFloat(s.buyPrice).toFixed(2) : "0.00";
      const totalBuying = ((s.buyPrice || 0) * (s.qty || 0)).toFixed(2);

      // Original Qty cell has id so we can update it after computing from sales + edits
      tr.innerHTML = `
        <td>${s.item}</td>
        <td>${s.qty}</td>
        <td>${parseFloat(s.price).toFixed(2)}</td>
        <td><input type="number" min="0" step="0.01" value="${buyPriceDisplay}" style="width:110px" onchange="updateBuyPrice('${child.key}', this.value, '${s.item}')"></td>
        <td>${totalBuying}</td>
        <td>${s.category}</td>
        <td id="orig-${child.key}">...</td>
        <td>
          <button onclick="editStockQty('${child.key}', '${s.item}', ${s.qty})">Edit Qty</button>
          <button onclick="deleteStock('${child.key}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);

      // suggestion for sales datalist
      if (suggestionList) {
        const option = document.createElement("option");
        option.value = s.item;
        suggestionList.appendChild(option);
      }

      // compute original qty asynchronously
      calculateOriginalStock(child.key, s.item, s.qty);
    });

    // init pagination (stock)
    paginateTable("stockTable", "stockRowsPerPage", "stockPageSelect", parseInt(document.getElementById("stockRowsPerPage").value || 5));
  });
}

function calculateOriginalStock(stockId, itemName, currentQty) {
  // total sold qty for this item
  db.ref("sales").orderByChild("item").equalTo(itemName).once("value").then(snap => {
    let totalSalesQty = 0;
    snap.forEach(saleSnap => {
      const sale = saleSnap.val();
      totalSalesQty += parseInt(sale.qty || 0);
    });

    // get editDelta if any
    db.ref("stock/" + stockId).once("value").then(stockSnap => {
      const s = stockSnap.val() || {};
      const editDelta = parseInt(s.editDelta || 0);
      const origQty = (parseInt(currentQty || 0) + totalSalesQty + editDelta);
      const cell = document.getElementById(`orig-${stockId}`);
      if (cell) cell.textContent = origQty;
    }).catch(err => {
      console.error("Error reading stock for original qty:", err);
      const cell = document.getElementById(`orig-${stockId}`);
      if (cell) cell.textContent = (currentQty + totalSalesQty);
    });
  }).catch(err => {
    console.error("Error calculating total sales qty:", err);
    const cell = document.getElementById(`orig-${stockId}`);
    if (cell) cell.textContent = currentQty;
  });
}

function editStockQty(stockId, itemName, currentQty) {
  const newQtyStr = prompt(`Edit quantity for "${itemName}" (current: ${currentQty}). Enter new absolute quantity:`, currentQty);
  if (newQtyStr === null) return;
  if (newQtyStr.trim() === "" || isNaN(newQtyStr)) return alert("Invalid quantity.");

  const newQty = parseInt(newQtyStr);
  if (newQty < 0) return alert("Quantity cannot be negative.");

  // Update qty and keep track of editDelta (accumulate changes)
  db.ref("stock/" + stockId).once("value").then(snapshot => {
    const s = snapshot.val() || {};
    const oldQty = parseInt(s.qty || 0);
    const delta = newQty - oldQty;
    const newEditDelta = (parseInt(s.editDelta || 0) + delta);

    db.ref("stock/" + stockId).update({ qty: newQty, editDelta: newEditDelta })
      .then(() => {
        alert("Stock quantity updated successfully.");
        // reload stock and recalculated original qtys
        if (typeof loadStock === "function") loadStock();
      })
      .catch(err => {
        console.error("Error updating stock qty:", err);
        alert("Failed to update stock quantity.");
      });
  });
}

function updateBuyPrice(stockId, newBuyPrice, itemName) {
  const b = parseFloat(newBuyPrice);
  if (isNaN(b) || b < 0) return alert("Invalid buy price");

  // update stock buy price first
  db.ref("stock/" + stockId).update({ buyPrice: b }).then(() => {
    // update local cache (if loaded)
    if (window.stockCache && window.stockCache[itemName]) window.stockCache[itemName].buyPrice = b;

    // Now update all sales that reference this item:
    db.ref("sales").once("value").then(snapshot => {
      const updates = {};
      snapshot.forEach(child => {
        const s = child.val();
        if (s && s.item === itemName) {
          const qty = parseFloat(s.qty || 0);
          const sellingPrice = parseFloat(s.price || 0);
          const discount = parseFloat(s.discount || 0);
          const newProfit = parseFloat(((sellingPrice - b) * qty - discount).toFixed(2));
          updates[child.key] = { buyingPrice: parseFloat(b.toFixed(2)), profit: newProfit };
        }
      });

      const promises = [];
      for (const saleKey in updates) {
        promises.push(db.ref("sales/" + saleKey).update(updates[saleKey]));
      }
      return Promise.all(promises);
    }).then(() => {
      // reload dependent data
      if (typeof loadStock === "function") loadStock();
      if (typeof loadSales === "function") loadSales();
      if (typeof loadExpenses === "function") loadExpenses();
      if (typeof populateEmployeeFilter === "function") populateEmployeeFilter();
    }).catch(err => {
      console.error("Error updating related sales:", err);
      if (typeof loadStock === "function") loadStock();
      if (typeof loadSales === "function") loadSales();
    });
  }).catch(err => {
    alert("Error updating buy price: " + err.message);
  });
}

function deleteStock(stockId) {
  if (confirm("Delete this stock item?")) {
    db.ref("stock/" + stockId).remove().then(() => {
      if (typeof loadStock === "function") loadStock();
    });
  }
}
