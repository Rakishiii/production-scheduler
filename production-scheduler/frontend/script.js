// Production Scheduler Frontend
// API endpoint used by the frontend. Switch to localhost for local backend runs.
 const BACKEND_URL = "https://production-scheduler-tvi9.onrender.com";
//const BACKEND_URL = "http://127.0.0.1:5000";

const CABINET_UNIT_PRICES = {
  "Tall Cabinet": 15000,
  "Hanging Cabinet": 10000,
  Shelves: 7000,
};

let globalMachineSchedule = {};
let globalAssignments = [];
let globalOrders = [];
let activeProjectOrderId = null;
const DEADLINES_PAGE_SIZE = 4;
const ORDERS_PAGE_SIZE = 10;
let deadlinesPage = 1;
let ordersTablePage = 1;
const PROCESS_FLOW = [
  { name: "CNC Cutting", ratio: 15, color: "#7B542F", machine: "M01" },
  { name: "CNC Edging", ratio: 15, color: "#B6771D", machine: "M02" },
  { name: "CNC Routing", ratio: 15, color: "#FF9D00", machine: "M03" },
  { name: "Assembly", ratio: 40, color: "#FFCF71", machine: "N/A" },
  { name: "Quality Assurance", ratio: 5, color: "#B6771D", machine: "N/A" },
  { name: "Packing", ratio: 10, color: "#7B542F", machine: "N/A" },
];
const PROCESS_STAGE_RANGES = (() => {
  let cursor = 0;
  return PROCESS_FLOW.map((process) => {
    const start = cursor;
    const end = cursor + process.ratio;
    cursor = end;
    return { name: process.name, start, end };
  });
})();
const PROCESS_STAGE_MAP = PROCESS_STAGE_RANGES.reduce((acc, stage) => {
  acc[stage.name] = stage;
  return acc;
}, {});

const orderForm = document.getElementById("orderForm");
const ordersTable = document.getElementById("ordersTable");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const demoDateInput = document.getElementById("demoDate");
const clearDemoDateBtn = document.getElementById("clearDemoDate");
const projectView = document.getElementById("projectView");
const closeProjectView = document.getElementById("closeProjectView");
const timelineSteps = document.getElementById("timelineSteps");
const projectSubtitle = document.getElementById("projectSubtitle");
const projectDateRange = document.getElementById("projectDateRange");
const timelineWeeks = document.getElementById("timelineWeeks");
const timelineWeekLabels = document.getElementById("timelineWeekLabels");

const statTotalOrders = document.getElementById("statTotalOrders");
const statActiveOrders = document.getElementById("statActiveOrders");
const statCompletedOrders = document.getElementById("statCompletedOrders");
const statDueSoon = document.getElementById("statDueSoon");
const statTotalUnits = document.getElementById("statTotalUnits");
const statPendingUnits = document.getElementById("statPendingUnits");
const priorityBreakdown = document.getElementById("priorityBreakdown");
const cabinetBreakdown = document.getElementById("cabinetBreakdown");
const upcomingDeadlines = document.getElementById("upcomingDeadlines");
const deadlinesPrevBtn = document.getElementById("deadlinesPrevBtn");
const deadlinesNextBtn = document.getElementById("deadlinesNextBtn");
const deadlinesPageInfo = document.getElementById("deadlinesPageInfo");
const ordersPrevBtn = document.getElementById("ordersPrevBtn");
const ordersNextBtn = document.getElementById("ordersNextBtn");
const ordersPageInfo = document.getElementById("ordersPageInfo");
const machineUtilizationSection = document.getElementById("machineUtilizationSection");
const machineUtilizationList = document.getElementById("machineUtilizationList");
const WORKDAY_START_MINUTES = 8 * 60; // 08:00
const WORKDAY_LUNCH_START_MINUTES = 12 * 60; // 12:00
const WORKDAY_LUNCH_END_MINUTES = 13 * 60; // 13:00
const WORKDAY_END_MINUTES = 17 * 60; // 17:00
const WORKDAY_MORNING_MINUTES = WORKDAY_LUNCH_START_MINUTES - WORKDAY_START_MINUTES; // 4 hours
const WORKDAY_AFTERNOON_MINUTES = WORKDAY_END_MINUTES - WORKDAY_LUNCH_END_MINUTES; // 4 hours
const WORKDAY_MINUTES = 8 * 60; // 8-hour shift

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatClock(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDateForDisplay(dateString) {
  const parts = String(dateString || "").split("-");
  if (parts.length === 3) {
    const year = parts[0];
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (Number.isFinite(month) && Number.isFinite(day)) {
      return `${month}/${day}/${year}`;
    }
  }
  return dateString || "N/A";
}

function formatWorkMinute(workMinuteOffset) {
  const safeOffset = Math.max(0, Math.round(workMinuteOffset));
  const day = Math.floor(safeOffset / WORKDAY_MINUTES) + 1;
  const minuteInDay = safeOffset % WORKDAY_MINUTES;
  const clockMinute =
    minuteInDay < WORKDAY_MORNING_MINUTES
      ? WORKDAY_START_MINUTES + minuteInDay
      : WORKDAY_LUNCH_END_MINUTES + (minuteInDay - WORKDAY_MORNING_MINUTES);
  const clock = formatClock(clockMinute);
  return { day, clock, label: `D${day} ${clock}` };
}

function getProcessRange(processName) {
  return PROCESS_STAGE_MAP[processName] || null;
}

function getProcessProgressPercent(orderProgress, processName) {
  const stage = getProcessRange(processName);
  if (!stage) {
    return 0;
  }

  const progress = Number(orderProgress) || 0;
  if (progress <= stage.start) {
    return 0;
  }
  if (progress >= stage.end) {
    return 100;
  }

  const span = stage.end - stage.start;
  if (span <= 0) {
    return 0;
  }
  return ((progress - stage.start) / span) * 100;
}

function isStatusCompleted(order) {
  return String(order?.status || "").toLowerCase() === "completed";
}

function calculateDateProgress(order) {
  const start = parseDate(order?.start_date);
  const end = parseDate(order?.completion_date);
  if (!start || !end) {
    return null;
  }

  const referenceDate = parseDate(demoDateInput?.value) || parseDate(new Date());
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.floor((end - start) / msPerDay);
  const elapsedDays = Math.floor((referenceDate - start) / msPerDay);

  if (elapsedDays >= totalDays) {
    return 100;
  }
  if (elapsedDays <= 0) {
    return 0;
  }
  if (totalDays <= 0) {
    return 100;
  }
  return Math.min(100, (100 / totalDays) * elapsedDays);
}

function isCompleted(order) {
  return isStatusCompleted(order) || getNormalizedProgress(order) >= 100;
}

function getNormalizedProgress(order) {
  const rawProgress = Number(order?.progress);
  const backendProgress = Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(100, rawProgress))
    : 0;
  const dateProgress = calculateDateProgress(order);
  const normalized = dateProgress === null ? backendProgress : dateProgress;
  return isStatusCompleted(order) || normalized >= 100 ? 100 : normalized;
}

function getEffectivePriority(order) {
  if (isCompleted(order)) {
    return "LOW";
  }
  const priority = String(order.priority || "LOW").toUpperCase();
  if (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW") {
    return priority;
  }
  return "LOW";
}

function formatCurrency(value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getEstimatedOrderSales(order) {
  if (Number.isFinite(order.total_amount)) {
    return Number(order.total_amount);
  }
  if (Number.isFinite(order.total_price)) {
    return Number(order.total_price);
  }
  if (Number.isFinite(order.amount)) {
    return Number(order.amount);
  }
  const quantity = Number(order.quantity) || 0;
  const unitPrice = CABINET_UNIT_PRICES[order.cabinet_type] || 0;
  return quantity * unitPrice;
}

function renderBreakdown(container, rows) {
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML = '<p class="text-sm" style="color: #B6771D;">No data yet.</p>';
    return;
  }

  container.innerHTML = rows
    .map(
      (row) => `
      <div class="mix-circle-item">
        <div class="mix-ring" style="--value: ${row.percent};">
          <span>${row.percent}%</span>
        </div>
        <p class="mix-circle-label">${row.label}</p>
        <p class="mix-circle-count">${row.count} (${row.percent}%)</p>
      </div>
    `
    )
    .join("");
}

function getUpcomingDeadlineOrders(orders) {
  return [...orders]
    .filter((order) => !isCompleted(order))
    .filter((order) => parseDate(order.completion_date))
    .sort((a, b) => parseDate(a.completion_date) - parseDate(b.completion_date));
}

function updateDeadlinesPagination(totalItems) {
  if (!deadlinesPrevBtn || !deadlinesNextBtn || !deadlinesPageInfo) {
    return;
  }

  if (!totalItems) {
    deadlinesPrevBtn.disabled = true;
    deadlinesNextBtn.disabled = true;
    deadlinesPageInfo.textContent = "Page 0 of 0";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / DEADLINES_PAGE_SIZE));
  deadlinesPrevBtn.disabled = deadlinesPage <= 1;
  deadlinesNextBtn.disabled = deadlinesPage >= totalPages;
  deadlinesPageInfo.textContent = `Page ${deadlinesPage} of ${totalPages}`;
}

function renderUpcomingDeadlines(orders) {
  if (!upcomingDeadlines) {
    return;
  }

  const dueOrders = getUpcomingDeadlineOrders(orders);
  if (!dueOrders.length) {
    upcomingDeadlines.innerHTML = '<p class="text-sm" style="color: #B6771D;">No upcoming active orders.</p>';
    updateDeadlinesPagination(0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(dueOrders.length / DEADLINES_PAGE_SIZE));
  deadlinesPage = Math.min(Math.max(1, deadlinesPage), totalPages);
  const start = (deadlinesPage - 1) * DEADLINES_PAGE_SIZE;
  const pageItems = dueOrders.slice(start, start + DEADLINES_PAGE_SIZE);

  upcomingDeadlines.innerHTML = pageItems
    .map((order) => {
      const priority = getEffectivePriority(order);
      const priorityStyle =
        priority === "HIGH"
          ? "background: #FF9D00; color: #ffffff;"
          : priority === "MEDIUM"
            ? "background: #B6771D; color: #ffffff;"
            : "background: #FFCF71; color: #7B542F;";

      return `
        <div class="deadline-item">
          <div class="flex items-center justify-between gap-2">
            <p class="deadline-name">${order.customer_name}</p>
            <span class="px-2 py-1 rounded text-xs font-semibold" style="${priorityStyle}">${priority}</span>
          </div>
          <p class="deadline-meta">${order.cabinet_type} - Qty ${order.quantity}</p>
          <p class="text-sm mt-2" style="color: #7B542F;">Due: ${order.completion_date}</p>
        </div>
      `;
    })
    .join("");

  updateDeadlinesPagination(dueOrders.length);
}

function renderMachineUtilization(orders) {
  if (!machineUtilizationList) {
    return;
  }

  if (!orders.length) {
    machineUtilizationList.innerHTML =
      '<p class="text-sm col-span-full" style="color: #B6771D;">No orders yet.</p>';
    return;
  }

  const stageUtilizations = calculateStageUtilizations(orders);
  machineUtilizationList.innerHTML = stageUtilizations.map((stage) => {
    const clampedUtilization = Math.max(0, Math.min(100, stage.utilization));

    return `
      <div class="util-card">
        <div class="util-ring" style="--value: ${clampedUtilization};">
          <span>${clampedUtilization}%</span>
        </div>
        <p class="util-label">${stage.name} (%)</p>
      </div>
    `;
  }).join("");
}

function calculateStageUtilizations(orders) {
  const totalWeight = orders.reduce(
    (sum, order) => sum + (Number(order.quantity) || 1),
    0
  );
  const safeWeight = totalWeight || 1;

  return PROCESS_FLOW.map((process) => {
    const weightedProgress = orders.reduce((sum, order) => {
      const weight = Number(order.quantity) || 1;
      const processProgress = getProcessProgressPercent(
        getNormalizedProgress(order),
        process.name
      );
      return sum + processProgress * weight;
    }, 0);

    const utilization = Math.round(weightedProgress / safeWeight);
    return {
      name: process.name,
      utilization: Math.max(0, Math.min(100, utilization)),
    };
  });
}

function calculateStageRemainingLoads(orders) {
  const stageLoads = PROCESS_FLOW.map((process) => ({
    name: process.name,
    load: 0,
  }));

  orders.forEach((order) => {
    const weight = Number(order.quantity) || 1;
    const progress = getNormalizedProgress(order);

    PROCESS_FLOW.forEach((process, index) => {
      const stage = getProcessRange(process.name);
      if (!stage) {
        return;
      }

      let remainingPercent = 0;
      if (progress <= stage.start) {
        remainingPercent = process.ratio;
      } else if (progress >= stage.end) {
        remainingPercent = 0;
      } else {
        remainingPercent = stage.end - progress;
      }

      stageLoads[index].load += remainingPercent * weight;
    });
  });

  const totalLoad = stageLoads.reduce((sum, stage) => sum + stage.load, 0) || 1;
  return stageLoads.map((stage) => ({
    ...stage,
    share: Math.round((stage.load / totalLoad) * 100),
  }));
}

function renderDashboard(orders) {
  if (!statTotalOrders) {
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 1000 * 60 * 60 * 24;

  const totalOrders = orders.length;
  const completedOrders = orders.filter(isCompleted).length;
  const activeOrders = totalOrders - completedOrders;

  const dueSoon = orders.filter((order) => {
    if (isCompleted(order)) {
      return false;
    }
    const endDate = parseDate(order.completion_date);
    if (!endDate) {
      return false;
    }
    const daysUntilDue = Math.floor((endDate - today) / msPerDay);
    return daysUntilDue >= 0 && daysUntilDue <= 7;
  }).length;

  const activeOrdersOnly = orders.filter((order) => !isCompleted(order));
  const totalUnits = orders.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0);
  const wipUnits = activeOrdersOnly.reduce((sum, order) => sum + (Number(order.quantity) || 0), 0);

  statTotalOrders.textContent = String(totalOrders);
  statActiveOrders.textContent = String(activeOrders);
  statCompletedOrders.textContent = String(completedOrders);
  statDueSoon.textContent = String(dueSoon);
  statTotalUnits.textContent = String(totalUnits);
  if (statPendingUnits) {
    statPendingUnits.textContent = String(wipUnits);
  }

  const activePriorityOrders = activeOrdersOnly;
  const priorityCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };

  activePriorityOrders.forEach((order) => {
    const priority = getEffectivePriority(order);
    if (priorityCounts[priority] !== undefined) {
      priorityCounts[priority] += 1;
    } else {
      priorityCounts.LOW += 1;
    }
  });

  const priorityTotal = activePriorityOrders.length || 1;
  renderBreakdown(priorityBreakdown, [
    {
      label: "High",
      count: priorityCounts.HIGH,
      percent: Math.round((priorityCounts.HIGH / priorityTotal) * 100),
      color: "#FF9D00",
    },
    {
      label: "Medium",
      count: priorityCounts.MEDIUM,
      percent: Math.round((priorityCounts.MEDIUM / priorityTotal) * 100),
      color: "#B6771D",
    },
    {
      label: "Low",
      count: priorityCounts.LOW,
      percent: Math.round((priorityCounts.LOW / priorityTotal) * 100),
      color: "#7B542F",
    },
  ]);

  const typeCounts = {};
  orders.forEach((order) => {
    const type = order.cabinet_type || "Unspecified";
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  const typeTotal = totalOrders || 1;
  const palette = ["#7B542F", "#B6771D", "#FF9D00", "#9c8064"];
  const typeRows = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], index) => ({
      label,
      count,
      percent: Math.round((count / typeTotal) * 100),
      color: palette[index % palette.length],
    }));

  renderBreakdown(cabinetBreakdown, typeRows);
  renderUpcomingDeadlines(orders);
}

function updateOrdersPagination(totalItems) {
  if (!ordersPrevBtn || !ordersNextBtn || !ordersPageInfo) {
    return;
  }

  if (!totalItems) {
    ordersPrevBtn.disabled = true;
    ordersNextBtn.disabled = true;
    ordersPageInfo.textContent = "Page 0 of 0";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / ORDERS_PAGE_SIZE));
  ordersPrevBtn.disabled = ordersTablePage <= 1;
  ordersNextBtn.disabled = ordersTablePage >= totalPages;
  ordersPageInfo.textContent = `Page ${ordersTablePage} of ${totalPages}`;
}

function renderOrderRow(order) {
  const progress = getNormalizedProgress(order);
  const days = Math.ceil(
    (new Date(order.completion_date) - new Date(order.start_date)) /
      (1000 * 60 * 60 * 24)
  );

  const completed = isCompleted(order);
  const effectivePriority = getEffectivePriority(order);

  const statusBg = completed ? "#7B542F" : "#B6771D";
  const statusText = completed ? "Completed" : order.status;

  let priorityBadge = "";
  if (effectivePriority === "HIGH") {
    priorityBadge =
      '<span class="px-2 py-1 rounded-lg text-white text-xs font-semibold" style="background: #FF9D00;">HIGH</span>';
  } else if (effectivePriority === "MEDIUM") {
    priorityBadge =
      '<span class="px-2 py-1 rounded-lg text-white text-xs font-semibold" style="background: #B6771D;">MEDIUM</span>';
  } else {
    priorityBadge =
      '<span class="px-2 py-1 rounded-lg text-xs font-semibold" style="background: #FFCF71; color: #7B542F;">LOW</span>';
  }

  return `
    <tr class="border-b border-amber-100 hover:bg-amber-50">
      <td class="p-2">
        <span class="px-2 py-1 rounded-lg text-white text-xs font-semibold" style="background: ${statusBg};">
          ${statusText}
        </span>
      </td>
      <td class="p-2">${priorityBadge}</td>
      <td class="p-2 font-semibold">${order.cabinet_type}</td>
      <td class="p-2">${order.customer_name}</td>
      <td class="p-2">${order.start_date}</td>
      <td class="p-2">${order.completion_date}</td>
      <td class="p-2 text-center">${days}</td>
      <td class="p-2 text-center">${order.quantity}</td>
      <td class="p-2 text-center font-bold">${order.color || "N/A"}</td>
      <td class="p-2 text-center font-semibold">${progress.toFixed(0)}%</td>
      <td class="p-2">
        <div class="w-full rounded-lg h-6 relative overflow-hidden" style="min-width: 150px; background: #FFCF71;">
          <div class="gantt-bar ${effectivePriority === "HIGH" ? "priority" : ""}" style="width: ${progress}%; height: 100%;">
            <div class="gantt-bar-text">${progress.toFixed(0)}%</div>
          </div>
        </div>
      </td>
      <td class="p-2 no-print">
        <button
          onclick="openProjectView(${order.id})"
          class="px-2 py-1 rounded-lg text-white text-xs font-semibold mr-2"
          style="background: #FF9D00;"
          onmouseover="this.style.background='#B6771D'"
          onmouseout="this.style.background='#FF9D00'"
        >
          View Project
        </button>
        <button
          onclick="deleteOrder(${order.id})"
          class="px-2 py-1 rounded-lg text-white text-xs font-semibold"
          style="background: #7B542F;"
          onmouseover="this.style.background='#B6771D'"
          onmouseout="this.style.background='#7B542F'"
        >
          Delete
        </button>
      </td>
    </tr>
  `;
}

function renderOrdersTable(orders) {
  if (!ordersTable) {
    return;
  }

  if (!orders.length) {
    ordersTable.innerHTML =
      '<tr><td colspan="12" class="p-4 text-center" style="color: #B6771D;">No orders yet. Add one above.</td></tr>';
    updateOrdersPagination(0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PAGE_SIZE));
  ordersTablePage = Math.min(Math.max(1, ordersTablePage), totalPages);
  const start = (ordersTablePage - 1) * ORDERS_PAGE_SIZE;
  const pageItems = orders.slice(start, start + ORDERS_PAGE_SIZE);

  ordersTable.innerHTML = pageItems.map((order) => renderOrderRow(order)).join("");
  updateOrdersPagination(orders.length);
}

async function loadOrders() {
  if (!ordersTable) {
    return;
  }

  try {
    const demoDate = demoDateInput?.value;
    const query = demoDate ? `?date=${demoDate}` : "";

    const response = await fetch(`${BACKEND_URL}/orders${query}`);
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const data = await response.json();
    const orders = Array.isArray(data) ? data : data.orders || [];
    const machineSchedule = data.machine_schedule || {};
    const assignments = data.assignments || [];

    globalMachineSchedule = machineSchedule;
    globalAssignments = assignments;
    globalOrders = orders;

    renderDashboard(orders);
    if (machineUtilizationSection && !machineUtilizationSection.classList.contains("hidden")) {
      const selectedOrder = orders.find((item) => item.id === activeProjectOrderId);
      renderMachineUtilization(selectedOrder ? [selectedOrder] : orders);
    }
    renderOrdersTable(orders);
  } catch (error) {
    console.error("Failed to load orders:", error);
    globalOrders = [];
    renderDashboard([]);
    if (machineUtilizationSection && !machineUtilizationSection.classList.contains("hidden")) {
      renderMachineUtilization([]);
    }
    renderOrdersTable([]);
    ordersTable.innerHTML =
      '<tr><td colspan="12" class="p-4 text-center" style="color: #B6771D;">Failed to load orders. Check backend connection.</td></tr>';
  }
}

if (orderForm) {
  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      customer_name: document.getElementById("customerName").value,
      cabinet_type: document.getElementById("cabinetType").value,
      color: document.getElementById("color").value,
      quantity: parseInt(document.getElementById("quantity").value, 10),
      completion_date: document.getElementById("completionDate").value,
    };

    try {
      const response = await fetch(`${BACKEND_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        orderForm.reset();
        loadOrders();
      } else {
        alert("Failed to add order.");
      }
    } catch (error) {
      alert("Error connecting to backend.");
    }
  });
}

async function deleteOrder(id) {
  if (confirm("Delete this order?")) {
    try {
      await fetch(`${BACKEND_URL}/orders/${id}`, { method: "DELETE" });
      loadOrders();
    } catch (error) {
      alert("Failed to delete order.");
    }
  }
}

function openProjectView(orderId) {
  if (!projectView || !timelineSteps || !projectSubtitle) {
    return;
  }

  const order = globalOrders.find((item) => item.id === orderId);
  if (!order) {
    return;
  }
  activeProjectOrderId = orderId;

  projectSubtitle.textContent = `${order.customer_name} - ${order.cabinet_type} - Qty ${order.quantity}`;
  if (projectDateRange) {
    projectDateRange.textContent = `Project Dates: ${formatDateForDisplay(order.start_date)} - ${formatDateForDisplay(order.completion_date)}`;
  }

  const startDate = new Date(order.start_date);
  const endDate = new Date(order.completion_date);
  const totalDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));

  const dayLabels = Array.from({ length: totalDays }, (_, idx) => `<div style="text-align: center;">Day ${idx + 1}</div>`).join("");
  timelineWeekLabels.innerHTML = `<div style="display: grid; grid-template-columns: repeat(${totalDays}, 1fr); width: 100%; gap: 0;">${dayLabels}</div>`;

  const totalWorkMinutes = totalDays * WORKDAY_MINUTES;
  let allocatedMinutes = 0;
  const processDurations = PROCESS_FLOW.map((process, idx) => {
    if (idx === PROCESS_FLOW.length - 1) {
      return Math.max(0, totalWorkMinutes - allocatedMinutes);
    }
    const minutes = Math.round((totalWorkMinutes * process.ratio) / 100);
    allocatedMinutes += minutes;
    return minutes;
  });

  let cumulativePercent = 0;
  const productionRows = PROCESS_FLOW
    .map((step) => {
      const offsetPercent = Math.min(100, cumulativePercent);
      let widthPercent = step.ratio;
      if (step === PROCESS_FLOW[PROCESS_FLOW.length - 1]) {
        widthPercent = Math.max(0, 100 - cumulativePercent);
      }
      widthPercent = Math.min(100 - offsetPercent, widthPercent);
      cumulativePercent += widthPercent;

      return `
        <div class="flex items-center gap-3">
          <div class="w-48 text-xs font-semibold" style="color: #7B542F;">${step.name}</div>
          <div class="relative flex-1 h-4 rounded timeline-grid" style="background: #F3F4F6; border: 1px solid #D1D5DB; --weeks: ${totalDays}">
            <div
              class="absolute top-0 h-4 rounded"
              style="left: ${offsetPercent}%; width: ${widthPercent}%; background: ${step.color};"
            ></div>
          </div>
        </div>
      `;
    })
    .join("");

  const rawAssignments = globalAssignments.filter((a) => a.order === `O-${orderId}`);
  const assignmentMap = new Map(
    rawAssignments.map((assignment) => [assignment.process, assignment])
  );
  const orderAssignments = PROCESS_FLOW.map((process) => {
    const existing = assignmentMap.get(process.name);
    if (existing) {
      return existing;
    }
    return {
      process: process.name,
      worker: process.machine === "N/A" ? "Manual Team" : "Unassigned",
      machine: process.machine,
    };
  });

  const getProcessStatus = (processName, progress, machineId, currentOrderId) => {
    const stage = getProcessRange(processName);
    if (!stage) {
      return { status: "Unknown", color: "#B6771D", textColor: "#ffffff" };
    }

    if (progress >= stage.end) {
      return { status: "Completed", color: "#7B542F", textColor: "#ffffff" };
    }

    if (progress >= stage.start && progress < stage.end) {
      if (!machineId || machineId === "N/A") {
        return { status: "Ongoing", color: "#FF9D00", textColor: "#ffffff" };
      }

      const currentOrder = globalOrders.find((o) => o.id === currentOrderId);
      if (!currentOrder) {
        return { status: "Ongoing", color: "#FF9D00", textColor: "#ffffff" };
      }

      let blockedByHigherPriority = false;
      for (const otherOrder of globalOrders) {
        if (otherOrder.id === currentOrderId) {
          continue;
        }
        const otherProgress = getNormalizedProgress(otherOrder);
        if (otherProgress >= stage.start && otherProgress < stage.end) {
          const currentDeadline = new Date(currentOrder.completion_date);
          const otherDeadline = new Date(otherOrder.completion_date);
          if (otherDeadline < currentDeadline) {
            blockedByHigherPriority = true;
            break;
          }
        }
      }

      if (blockedByHigherPriority) {
        return { status: "Pending", color: "#FFCF71", textColor: "#7B542F" };
      }

      return { status: "Ongoing", color: "#FF9D00", textColor: "#ffffff" };
    }

    return { status: "Pending", color: "#FFCF71", textColor: "#7B542F" };
  };

  let scheduleCursor = 0;
  const orderProgress = getNormalizedProgress(order);
  const assignmentRows = orderAssignments
    .map((assignment, index) => {
      const statusInfo = getProcessStatus(
        assignment.process,
        orderProgress,
        assignment.machine,
        order.id
      );
      const durationMinutes = processDurations[index] || 0;
      const startInfo = formatWorkMinute(scheduleCursor);
      const endInfo = formatWorkMinute(scheduleCursor + durationMinutes);
      scheduleCursor += durationMinutes;

      return `
        <tr style="background: #FFFBF3;">
          <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.process}</td>
          <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${startInfo.label}</td>
          <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${endInfo.label}</td>
          <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.machine && assignment.machine !== "N/A" ? assignment.machine : "Manual Station"}</td>
          <td class="p-2 text-center" style="border: 1px solid #FFCF71;">
            <span class="px-2 py-1 rounded text-xs font-semibold" style="background: ${statusInfo.color}; color: ${statusInfo.textColor};">
              ${statusInfo.status}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");

  const machineScheduleTable = `
    <table class="w-full text-xs" style="border-collapse: collapse; border: 1px solid #FFCF71;">
      <thead style="background: #FFCF71;">
        <tr>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Process</th>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Start Time</th>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Finish Time</th>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Assigned Machine</th>
          <th class="p-2 text-center" style="color: #7B542F; border: 1px solid #FFE4A3;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${assignmentRows}
      </tbody>
    </table>
  `;

  timelineSteps.innerHTML = `
    <div>
      <h4 class="text-sm font-semibold mb-4" style="color: #7B542F;">Production Schedule - Gantt Chart</h4>
      ${productionRows}
    </div>
    <div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #FFCF71;">
      <h4 class="text-sm font-semibold mb-4" style="color: #7B542F;">Machine Schedule</h4>
      ${machineScheduleTable}
    </div>
  `;

  if (machineUtilizationSection) {
    machineUtilizationSection.classList.remove("hidden");
  }
  renderMachineUtilization([order]);
  projectView.classList.remove("hidden");
  projectView.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (closeProjectView) {
  closeProjectView.addEventListener("click", () => {
    activeProjectOrderId = null;
    projectView.classList.add("hidden");
    if (machineUtilizationSection) {
      machineUtilizationSection.classList.add("hidden");
    }
  });
}

if (deadlinesPrevBtn) {
  deadlinesPrevBtn.addEventListener("click", () => {
    if (deadlinesPage > 1) {
      deadlinesPage -= 1;
      renderUpcomingDeadlines(globalOrders);
    }
  });
}

if (deadlinesNextBtn) {
  deadlinesNextBtn.addEventListener("click", () => {
    const totalItems = getUpcomingDeadlineOrders(globalOrders).length;
    const totalPages = Math.max(1, Math.ceil(totalItems / DEADLINES_PAGE_SIZE));
    if (deadlinesPage < totalPages) {
      deadlinesPage += 1;
      renderUpcomingDeadlines(globalOrders);
    }
  });
}

if (ordersPrevBtn) {
  ordersPrevBtn.addEventListener("click", () => {
    if (ordersTablePage > 1) {
      ordersTablePage -= 1;
      renderOrdersTable(globalOrders);
    }
  });
}

if (ordersNextBtn) {
  ordersNextBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(globalOrders.length / ORDERS_PAGE_SIZE));
    if (ordersTablePage < totalPages) {
      ordersTablePage += 1;
      renderOrdersTable(globalOrders);
    }
  });
}

loadOrders();
setInterval(loadOrders, 5000);

if (demoDateInput) {
  demoDateInput.addEventListener("change", () => {
    loadOrders();
  });
}

if (clearDemoDateBtn) {
  clearDemoDateBtn.addEventListener("click", () => {
    demoDateInput.value = "";
    loadOrders();
  });
}

if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", async () => {
    if (!projectView || projectView.classList.contains("hidden")) {
      alert("No project view open. Please click 'View Project' on an order first.");
      return;
    }

    try {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.textContent = "Preparing PDF...";

      const clone = projectView.cloneNode(true);
      clone.style.background = "#ffffff";
      clone.style.padding = "30px";
      clone.style.margin = "0";
      clone.style.boxSizing = "border-box";
      clone.style.width = "1200px";
      clone.style.maxWidth = "1200px";
      clone.style.display = "block";

      const buttonContainer = clone.querySelector(".flex.items-center.justify-between");
      if (buttonContainer) {
        const titleDiv = buttonContainer.querySelector("div:first-child");
        if (titleDiv) {
          buttonContainer.replaceWith(titleDiv);
          titleDiv.style.marginBottom = "20px";
          titleDiv.style.paddingBottom = "15px";
          titleDiv.style.borderBottom = "2px solid #FFCF71";
        }
      }

      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.style.zIndex = "-1";
      container.appendChild(clone);
      document.body.appendChild(container);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(clone, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const renderWidth = pageWidth - 20;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;

      let remainingHeight = renderHeight;
      let yOffset = 0;
      let pageNum = 0;

      while (remainingHeight > 0) {
        const canvasSliceHeight = Math.min(remainingHeight, pageHeight - 20);
        const sourceY = (yOffset * canvas.height) / renderHeight;
        const sourceHeight = (canvasSliceHeight * canvas.height) / renderHeight;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = sourceHeight;
        const ctx = tempCanvas.getContext("2d");
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sourceHeight,
          0,
          0,
          canvas.width,
          sourceHeight
        );

        if (pageNum > 0) {
          pdf.addPage();
        }

        pdf.addImage(tempCanvas.toDataURL("image/png"), "PNG", 10, 10, renderWidth, canvasSliceHeight);

        yOffset += canvasSliceHeight;
        remainingHeight -= canvasSliceHeight;
        pageNum += 1;
      }

      pdf.save("gantt-chart.pdf");
    } catch (error) {
      console.error("PDF generation error:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "Download PDF";
    }
  });
}
