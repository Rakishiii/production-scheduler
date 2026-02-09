// Production Scheduler Frontend
const BACKEND_URL = "http://127.0.0.1:5000";

// Store machine schedule data globally
let globalMachineSchedule = {};
let globalAssignments = [];

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
    const data = await response.json();
    
    // Handle both old format (array) and new format (object with orders/machine_schedule)
    const orders = Array.isArray(data) ? data : (data.orders || []);
    const machineSchedule = data.machine_schedule || {};
    const assignments = data.assignments || [];
    
    // Store machine schedule and assignments globally for use in openProjectView
    globalMachineSchedule = machineSchedule;
    globalAssignments = assignments;

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
            ? "text-white"
            : "text-white";
        const statusBg = 
          order.progress === 100
            ? "#7B542F"
            : "#B6771D";
        
        // Priority badge with 3 levels
        let priorityBadge = '';
        if (order.priority === "HIGH") {
          priorityBadge = '<span class="px-2 py-1 rounded-lg text-white text-xs font-semibold" style="background: #FF9D00;">HIGH</span>';
        } else if (order.priority === "MEDIUM") {
          priorityBadge = '<span class="px-2 py-1 rounded-lg text-white text-xs font-semibold" style="background: #B6771D;">MEDIUM</span>';
        } else {
          priorityBadge = '<span class="px-2 py-1 rounded-lg text-xs font-semibold" style="background: #FFCF71; color: #7B542F;">LOW</span>';
        }

        return `
          <tr class="border-b border-slate-200 hover:bg-slate-50">
            <td class="p-2">
              <span class="px-2 py-1 rounded-lg ${statusColor} text-xs font-semibold" style="background: ${statusBg};">
                ${order.status}
              </span>
            </td>
            <td class="p-2">${priorityBadge}</td>
            <td class="p-2 font-semibold">${order.cabinet_type}</td>
            <td class="p-2">${order.customer_name}</td>
            <td class="p-2">${order.start_date}</td>
            <td class="p-2">${order.completion_date}</td>
            <td class="p-2 text-center">${days}</td>
            <td class="p-2 text-center">${order.quantity}</td>
            <td class="p-2 text-center font-bold">${order.color || 'N/A'}</td>
            <td class="p-2 text-center font-semibold">${order.progress.toFixed(0)}%</td>
            <td class="p-2">
              <div class="w-full rounded-lg h-6 relative overflow-hidden" style="min-width: 150px; background: #FFCF71;">
                <div class="gantt-bar ${order.priority === "HIGH" ? "priority" : ""}" style="width: ${order.progress}%; height: 100%;">
                  <div class="gantt-bar-text">${order.progress.toFixed(0)}%</div>
                </div>
              </div>
            </td>
            <td class="p-2 no-print">
              <button
                onclick='openProjectView(${order.id}, ${JSON.stringify(order)})'
                class="px-2 py-1 rounded-lg text-white text-xs font-semibold mr-2"
                style="background: #FF9D00;"
              >
                View Project
              </button>
              <button
                onclick='deleteOrder(${order.id})'
                class="px-2 py-1 rounded-lg text-white text-xs font-semibold"
                style="background: #7B542F;"
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
function openProjectView(orderId, order) {
  if (!projectView || !timelineSteps) {
    return;
  }

  projectSubtitle.textContent = `${order.customer_name} • ${order.cabinet_type} • Qty ${order.quantity}`;

  // SECTION 1: Production Timeline (5 stages)
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
    "#7B542F",
    "#B6771D",
    "#FF9D00",
    "#FFCF71",
    "#7B542F",
  ];

  let cumulativePercent = 0;
  const productionRows = steps
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
          <div class="w-48 text-xs font-semibold" style="color: #7B542F;">${step.name}</div>
          <div class="relative flex-1 h-4 rounded timeline-grid" style="background: #F3F4F6; border: 1px solid #D1D5DB; --weeks: ${displayWeeks}">
            <div
              class="absolute top-0 h-4 rounded"
              style="left: ${offsetPercent}%; width: ${widthPercent}%; background: ${barColors[index % barColors.length]};"
            ></div>
          </div>
        </div>
      `;
    })
    .join("");

  // SECTION 2: Machine Schedule (Worker and Machine Assignments)
  // Get assignments for this specific order
  const orderAssignments = globalAssignments.filter(a => a.order === `O-${orderId}`);
  
  // Build rows from assignments
  const assignmentRows = orderAssignments.length > 0 
    ? orderAssignments.map(assignment => `
      <tr style="background: #FFFBF3;">
        <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.process}</td>
        <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.worker}</td>
        <td class="p-2 text-center" style="color: #7B542F; border: 1px solid #FFCF71;">1</td>
        <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.machine !== 'N/A' ? assignment.machine : 'Manual Station'}</td>
      </tr>
    `).join('')
    : '<tr style="background: #FFFBF3;"><td colspan="4" class="p-2 text-center" style="color: #7B542F; border: 1px solid #FFCF71;">No assignments available</td></tr>';

  const machineScheduleTable = `
    <table class="w-full text-xs" style="border-collapse: collapse; border: 1px solid #FFCF71;">
      <thead style="background: #FFCF71;">
        <tr>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Process</th>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Assigned Worker</th>
          <th class="p-2 text-center" style="color: #7B542F; border: 1px solid #FFE4A3;">Count</th>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Assigned Machine</th>
        </tr>
      </thead>
      <tbody>
        ${assignmentRows}
      </tbody>
    </table>
  `;

  // Combine both sections
  const fullContent = `
    <div>
      <h4 class="text-sm font-semibold mb-4" style="color: #7B542F;">Production Timeline</h4>
      ${productionRows}
    </div>
    <div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid #FFCF71;">
      <h4 class="text-sm font-semibold mb-4" style="color: #7B542F;">Machine Schedule</h4>
      ${machineScheduleTable}
    </div>
  `;

  timelineSteps.innerHTML = fullContent;
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

      // Clone the printable area and enforce a stable layout for capture
      const clone = printableArea.cloneNode(true);
      clone.style.background = "#ffffff";
      clone.style.padding = "0";
      clone.style.margin = "0";
      clone.style.boxSizing = "border-box";
      // A4 landscape width at 96dpi for consistent capture size
      clone.style.width = "1122px";
      clone.style.maxWidth = "1122px";

      const table = clone.querySelector("table");
      if (table) {
        table.style.width = "100%";
        table.style.tableLayout = "fixed";
        table.style.borderCollapse = "collapse";

        // Define column widths
        const widths = [
          "7%",  // Status
          "7%",  // Priority
          "11%", // Product
          "11%", // Customer
          "8%",  // Start
          "8%",  // End
          "5%",  // Days
          "5%",  // Qty
          "6%",  // Machines
          "6%",  // Progress
          "16%", // Timeline
          "9%"   // Actions
        ];

        const rows = table.querySelectorAll("tr");
        rows.forEach((row) => {
          const cells = row.querySelectorAll("th, td");
          cells.forEach((cell, index) => {
            if (index < widths.length) {
              cell.style.width = widths[index];
            }
            cell.style.padding = "6px";
            cell.style.fontSize = "10px";
            cell.style.whiteSpace = "nowrap";
            cell.style.verticalAlign = "middle";
            // Center the customer column (index 3)
            if (index === 3) {
              cell.style.textAlign = "center";
            }
          });
        });

        const actionButtons = table.querySelectorAll("button");
        actionButtons.forEach((btn, index) => {
          btn.style.padding = "4px 6px";
          btn.style.fontSize = "10px";
          btn.style.lineHeight = "1";
          btn.style.display = "inline-block";
          btn.style.marginRight = index % 2 === 0 ? "2px" : "0";
        });

      }

      // Offscreen render container
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.style.zIndex = "-1";
      container.style.overflow = "visible";
      container.appendChild(clone);
      document.body.appendChild(container);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const captureWidth = clone.offsetWidth;
      const captureHeight = clone.offsetHeight;

      const canvas = await html2canvas(clone, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        width: captureWidth,
        height: captureHeight
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Fill the page width and align to top-left for a simple layout
      const renderWidth = pageWidth;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;
      const x = 0;
      const y = 0;

      pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);

      pdf.save("production-schedule.pdf");
    } catch (error) {
      alert("Failed to generate PDF.");
    } finally {
      downloadPdfBtn.disabled = false;
      downloadPdfBtn.textContent = "Download PDF";
    }
  });
}
