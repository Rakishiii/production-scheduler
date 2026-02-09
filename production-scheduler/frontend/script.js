// Production Scheduler Frontend
const BACKEND_URL = "https://production-scheduler-tvi9.onrender.com";

// Store machine schedule data globally
let globalMachineSchedule = {};
let globalAssignments = [];
let globalOrders = [];  // Store all orders for priority comparison

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
    
    // Store everything globally for use in openProjectView
    globalMachineSchedule = machineSchedule;
    globalAssignments = assignments;
    globalOrders = orders;

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
        const statusColor = "text-white";
        const statusBg = 
          order.progress === 100
            ? "#7B542F"
            : "#B6771D";
        const statusText = 
          order.progress === 100
            ? "Completed"
            : order.status;
        
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

  // Generate week labels
  let weekLabels = '';
  for (let i = 1; i <= displayWeeks; i++) {
    weekLabels += `<div style="flex: 1; text-align: center;">Week${i}</div>`;
  }
  timelineWeekLabels.innerHTML = `<div style="display: grid; grid-template-columns: repeat(${displayWeeks}, 1fr); width: 100%; gap: 0;">${weekLabels}</div>`;

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
  
  // Function to determine if this order has priority (earliest completion_date)
  const getOrderPriority = (currentOrder) => {
    if (!globalOrders || globalOrders.length === 0) return true;
    const currentDate = new Date(currentOrder.completion_date);
    return globalOrders.every(o => new Date(o.completion_date) >= currentDate || o.id === currentOrder.id);
  };
  
  // Check if this is the priority order
  const isPriorityOrder = getOrderPriority(order);
  
  // Function to determine status based on machine availability
  const getProcessStatus = (processName, progress, machineId, currentOrderId) => {
    const stages = {
      'CNC Cutting': { start: 0, end: 20 },
      'CNC Edging': { start: 20, end: 40 },
      'CNC Routing': { start: 40, end: 60 },
      'Assembly': { start: 60, end: 90 },
      'Packing': { start: 90, end: 100 }
    };
    
    const stage = stages[processName];
    if (!stage) return { status: 'Unknown', color: '#9CA3AF', textColor: '#fff' };
    
    if (progress >= stage.end) {
      return { status: 'Completed', color: '#7B542F', textColor: '#fff' }; // Dark brown
    } else if (progress >= stage.start && progress < stage.end) {
      // This order is in this stage - check if machine is available
      if (!machineId || machineId === 'N/A') {
        // Manual station always available
        return { status: 'Ongoing', color: '#FF9D00', textColor: '#fff' };
      }
      
      // Check if a HIGHER PRIORITY order is currently in the same stage
      const currentOrder = globalOrders.find(o => o.id === currentOrderId);
      if (!currentOrder) {
        return { status: 'Ongoing', color: '#FF9D00', textColor: '#fff' };
      }
      
      let higherPriorityInSameStage = false;
      
      for (const otherOrder of (globalOrders || [])) {
        if (otherOrder.id === currentOrderId) continue; // Skip self
        
        const otherProgress = otherOrder.progress || 0;
        // If the other order is currently in the same stage
        if (otherProgress >= stage.start && otherProgress < stage.end) {
          // Check if other order has higher priority (earlier deadline)
          const currentDeadline = new Date(currentOrder.completion_date);
          const otherDeadline = new Date(otherOrder.completion_date);
          
          if (otherDeadline < currentDeadline) {
            higherPriorityInSameStage = true;
            break;
          }
        }
      }
      
      if (higherPriorityInSameStage) {
        return { status: 'Pending', color: '#FFCF71', textColor: '#7B542F' }; // Waiting for machine
      } else {
        return { status: 'Ongoing', color: '#FF9D00', textColor: '#fff' };
      }
    } else {
      return { status: 'Pending', color: '#FFCF71', textColor: '#7B542F' }; // Light cream
    }
  };
  
  // Build rows from assignments
  const assignmentRows = orderAssignments.length > 0 
    ? orderAssignments.map(assignment => {
      const statusInfo = getProcessStatus(assignment.process, order.progress, assignment.machine, order.id);
      return `
      <tr style="background: #FFFBF3;">
        <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.process}</td>
        <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.worker}</td>
        <td class="p-2 text-center" style="border: 1px solid #FFCF71;">
          <span class="px-2 py-1 rounded text-xs font-semibold" style="background: ${statusInfo.color}; color: ${statusInfo.textColor};">
            ${statusInfo.status}
          </span>
        </td>
        <td class="p-2" style="color: #7B542F; border: 1px solid #FFCF71;">${assignment.machine !== 'N/A' ? assignment.machine : 'Manual Station'}</td>
      </tr>
    `}).join('')
    : '<tr style="background: #FFFBF3;"><td colspan="4" class="p-2 text-center" style="color: #7B542F; border: 1px solid #FFCF71;">No assignments available</td></tr>';

  const machineScheduleTable = `
    <table class="w-full text-xs" style="border-collapse: collapse; border: 1px solid #FFCF71;">
      <thead style="background: #FFCF71;">
        <tr>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Process</th>
          <th class="p-2 text-left" style="color: #7B542F; border: 1px solid #FFE4A3;">Assigned Worker</th>
          <th class="p-2 text-center" style="color: #7B542F; border: 1px solid #FFE4A3;">Status</th>
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
    const projectView = document.getElementById("projectView");
    if (!projectView || projectView.style.display === "none") {
      alert("No project view open. Please click 'View Project' on an order first.");
      return;
    }

    try {
      downloadPdfBtn.disabled = true;
      downloadPdfBtn.textContent = "Preparing PDF...";

      // Clone the project view (everything except header buttons)
      const clone = projectView.cloneNode(true);
      clone.style.background = "#ffffff";
      clone.style.padding = "30px";
      clone.style.margin = "0";
      clone.style.boxSizing = "border-box";
      clone.style.width = "1200px";
      clone.style.maxWidth = "1200px";
      clone.style.display = "block";

      // Remove the button container from the clone
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

      // Offscreen render container
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-10000px";
      container.style.top = "0";
      container.style.zIndex = "-1";
      container.style.overflow = "visible";
      container.appendChild(clone);
      document.body.appendChild(container);

      await new Promise((resolve) => setTimeout(resolve, 100));

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

      // Calculate dimensions to fit on page
      const renderWidth = pageWidth - 20;
      const renderHeight = (canvas.height * renderWidth) / canvas.width;
      const x = 10;
      const y = 10;

      let yPos = y;
      pdf.addImage(imgData, "PNG", x, yPos, renderWidth, renderHeight);

      // Add new page if content exceeds page height
      if (renderHeight > pageHeight - 20) {
        let remainingHeight = renderHeight;
        let yOffset = 0;
        let pageNum = 1;

        while (remainingHeight > 0) {
          const canvasHeight = Math.min(remainingHeight, pageHeight - 20);
          const sourceY = (yOffset * canvas.height) / renderHeight;
          const sourceHeight = (canvasHeight * canvas.height) / renderHeight;

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

          if (pageNum > 1) {
            pdf.addPage();
          }
          pdf.addImage(
            tempCanvas.toDataURL("image/png"),
            "PNG",
            x,
            y,
            renderWidth,
            canvasHeight
          );

          yOffset += canvasHeight;
          remainingHeight -= canvasHeight;
          pageNum++;
        }
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
