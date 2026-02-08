// Production Scheduler Frontend
const BACKEND_URL = "https://production-scheduler-tvi9.onrender.com";

const orderForm = document.getElementById("orderForm");
const ordersTable = document.getElementById("ordersTable");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const demoDateInput = document.getElementById("demoDate");
const clearDemoDateBtn = document.getElementById("clearDemoDate");
const projectView = document.getElementById("projectView");
const closeProjectView = document.getElementById("closeProjectView");
const timelineSteps = document.getElementById("timelineSteps");
const projectSubtitle = document.getElementById("projectSubtitle");
const timelineWeeks = document.getElementById("timelineWeeks");
const timelineWeekLabels = document.getElementById("timelineWeekLabels");

// Fetch and display orders
async function loadOrders() {
  try {
    const demoDate = demoDateInput?.value;
    const query = demoDate ? `?date=${demoDate}` : "";
    const response = await fetch(`${BACKEND_URL}/orders${query}`);
    const orders = await response.json();

    if (!orders || orders.length === 0) {
      ordersTable.innerHTML =
        '<tr><td colspan="12" class="p-4 text-center text-slate-500">No orders yet. Add one above.</td></tr>';
      return;
    }

    ordersTable.innerHTML = orders
      .map((order) => {
        const days = Math.ceil(
          (new Date(order.completion_date) - new Date(order.start_date)) /
            (1000 * 60 * 60 * 24)
        );
        const progressWidth = Math.min(100, order.progress);
        const statusColor =
          order.progress === 100
            ? "bg-green-100 text-green-800"
            : "bg-blue-100 text-blue-800";
        const priorityBadge = order.is_priority
          ? '<span class="px-2 py-1 rounded-lg bg-red-100 text-red-800 text-xs font-semibold">HIGH</span>'
          : '<span class="px-2 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold">NORMAL</span>';

        return `
          <tr class="border-b border-slate-200 hover:bg-slate-50">
            <td class="p-2">
              <span class="px-2 py-1 rounded-lg ${statusColor} text-xs font-semibold">
                ${order.status}
              </span>
            </td>
            <td class="p-2">${priorityBadge}</td>
            <td class="p-2 font-semibold">${order.cabinet_type}</td>
            <td class="p-2">${order.customer_name}</td>
            <td class="p-2">${order.start_date}</td>
            <td class="p-2">${order.completion_date}</td>
            <td class="p-2">${days}</td>
            <td class="p-2">${order.quantity}</td>
            <td class="p-2 font-bold">${order.machines}</td>
            <td class="p-2 font-semibold">${order.progress.toFixed(0)}%</td>
            <td class="p-2">
              <div class="gantt-bar ${order.is_priority ? "priority" : ""}" style="width: ${progressWidth}px; min-width: 100px;">
                <div class="gantt-bar-text">${order.progress.toFixed(0)}%</div>
              </div>
            </td>
            <td class="p-2 no-print">
              <button
                onclick='openProjectView(${JSON.stringify(order)})'
                class="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold hover:bg-blue-200 mr-2"
              >
                View Project
              </button>
              <button
                onclick='deleteOrder(${order.id})'
                class="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200"
              >
                Delete
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (error) {
    ordersTable.innerHTML =
      '<tr><td colspan="12" class="p-4 text-center text-red-500">Failed to load orders. Check backend.</td></tr>';
  }
}

// Submit new order
orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    customer_name: document.getElementById("customerName").value,
    cabinet_type: document.getElementById("cabinetType").value,
    color: document.getElementById("color").value,
    quantity: parseInt(document.getElementById("quantity").value),
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

// Delete order
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

// Project timeline view
function openProjectView(order) {
  if (!projectView || !timelineSteps) {
    return;
  }

  projectSubtitle.textContent = `${order.customer_name} • ${order.cabinet_type} • Qty ${order.quantity}`;

  const startDate = new Date(order.start_date);
  const endDate = new Date(order.completion_date);
  const totalDays = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
  const displayWeeks = Math.max(1, Math.ceil(totalDays / 7));

  const steps = [
    { name: "CNC Cutting", ratio: 0.2 },
    { name: "CNC Edging", ratio: 0.2 },
    { name: "CNC Routing", ratio: 0.2 },
    { name: "Assembly", ratio: 0.3 },
    { name: "Packing", ratio: 0.1 },
  ];

  const barColors = [
    "bg-purple-500",
    "bg-blue-500",
    "bg-cyan-500",
    "bg-yellow-400",
    "bg-orange-500",
  ];

  let cumulativePercent = 0;
  if (timelineWeekLabels) {
    timelineWeekLabels.style.gridTemplateColumns = `repeat(${displayWeeks}, minmax(0, 1fr))`;
    timelineWeekLabels.innerHTML = Array.from({ length: displayWeeks })
      .map((_, index) => `<div class="text-center">Week ${index + 1}</div>`)
      .join("");
  }

  const rows = steps
    .map((step, index) => {
      const offsetPercent = Math.min(100, cumulativePercent);
      let widthPercent = step.ratio * 100;
      if (index === steps.length - 1) {
        widthPercent = Math.max(0, 100 - cumulativePercent);
      }
      widthPercent = Math.min(100 - offsetPercent, widthPercent);
      cumulativePercent += widthPercent;

      return `
        <div class="flex items-center gap-3">
          <div class="w-48 text-xs text-slate-700">${step.name}</div>
          <div class="relative flex-1 h-4 bg-slate-100 rounded timeline-grid" style="--weeks: ${displayWeeks}">
            <div
              class="absolute top-0 h-4 rounded ${barColors[index % barColors.length]}"
              style="left: ${offsetPercent}%; width: ${widthPercent}%;"
            ></div>
          </div>
        </div>
      `;
    })
    .join("");

  timelineSteps.innerHTML = rows;
  projectView.classList.remove("hidden");
  projectView.scrollIntoView({ behavior: "smooth", block: "start" });
}

if (closeProjectView) {
  closeProjectView.addEventListener("click", () => {
    projectView.classList.add("hidden");
  });
}

// Load orders on page load and refresh every 5 seconds
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

// Download PDF of the orders table
if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", async () => {
    const printableArea = document.querySelector(".print-full");
    if (!printableArea) {
      alert("Nothing to print.");
      return;
    }

    try {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.textContent = "Preparing PDF...";

      const canvas = await html2canvas(printableArea, {
        scale: 2,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let y = 0;
      pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);

      if (imgHeight > pageHeight) {
        let remainingHeight = imgHeight - pageHeight;
        while (remainingHeight > 0) {
          y -= pageHeight;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);
          remainingHeight -= pageHeight;
        }
      }

      pdf.save("production-schedule.pdf");
    } catch (error) {
      alert("Failed to generate PDF.");
    } finally {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "Download PDF";
    }
  });
}
