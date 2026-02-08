// Frontend logic for the cabinet optimizer
// Replace YOUR-BACKEND-URL after deployment (e.g., https://your-api.example.com)

const BACKEND_URL = "http://127.0.0.1:5000"; // Local Flask server

const cabinetTypeSelect = document.getElementById("cabinetType");
const quantityInput = document.getElementById("quantity");
const calculateBtn = document.getElementById("calculateBtn");
const resultBox = document.getElementById("result");
const calculatorPanel = document.getElementById("calculatorPanel");
const closePanelBtn = document.getElementById("closePanel");
const dashboardCards = document.querySelectorAll(".dashboard-card");

function showMessage(message, isError = false) {
  resultBox.innerHTML = `<p class="${
    isError ? "text-red-600" : "text-slate-700"
  }">${message}</p>`;
}

async function calculate() {
  const type = cabinetTypeSelect.value;
  const quantity = Number.parseInt(quantityInput.value, 10);

  if (!type) {
    showMessage("Please select a cabinet type.", true);
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showMessage("Please enter a valid quantity greater than 0.", true);
    return;
  }

  showMessage("Calculating...");

  try {
    const response = await fetch(`${BACKEND_URL}/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, quantity }),
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.error || "Something went wrong.", true);
      return;
    }

    showMessage(
      `Required workers: <strong>${data.workers}</strong><br />` +
        `Estimated production days: <strong>${data.days}</strong>`
    );
  } catch (error) {
    showMessage("Unable to reach the backend. Check the URL and server.", true);
  }
}

calculateBtn.addEventListener("click", calculate);

dashboardCards.forEach((card) => {
  card.addEventListener("click", () => {
    if (card.dataset.target === "calculatorPanel") {
      calculatorPanel.classList.remove("hidden");
      calculatorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

closePanelBtn.addEventListener("click", () => {
  calculatorPanel.classList.add("hidden");
});
