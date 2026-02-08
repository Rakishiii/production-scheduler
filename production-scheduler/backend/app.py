"""Production scheduling backend with Flask."""

import json
import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Simple file-based storage
ORDERS_FILE = "orders.json"


def load_orders():
    """Load orders from JSON file."""
    if os.path.exists(ORDERS_FILE):
        with open(ORDERS_FILE, "r") as f:
            return json.load(f)
    return []


def save_orders(orders):
    """Save orders to JSON file."""
    with open(ORDERS_FILE, "w") as f:
        json.dump(orders, f, indent=2)


def calculate_priority_and_machines(days_until_completion):
    """Determine priority and machine allocation."""
    is_priority = days_until_completion <= 2
    machines = 6 if is_priority else 1
    return is_priority, machines


def calculate_daily_progress(days):
    """Calculate daily progress increment."""
    if days <= 0:
        return 100
    return 100 / days


def calculate_scheduled_dates(completion_date, quantity, orders):
    """Calculate realistic start date based on machine capacity."""
    # Production stages and hours per cabinet
    stages = {
        "CNC Cutting": 2,    # 2 hours per cabinet
        "CNC Edging": 2,     # 2 hours per cabinet  
        "CNC Routing": 2,    # 2 hours per cabinet
        "Assembly": 3,       # 3 hours per cabinet
        "Packing": 1         # 1 hour per cabinet
    }
    
    total_hours = sum(stages.values()) * quantity
    machines_available = 6  # Total machines
    work_hours_per_day = 8  # 8-hour workday
    
    # Calculate machine capacity usage per day from existing orders
    daily_capacity = {}
    for order in orders:
        if order.get("status") != "Completed":
            start = datetime.strptime(order["start_date"], "%Y-%m-%d").date()
            end = datetime.strptime(order["completion_date"], "%Y-%m-%d").date()
            days_span = (end - start).days + 1
            
            for i in range(days_span):
                day = start + timedelta(days=i)
                day_str = day.strftime("%Y-%m-%d")
                daily_capacity[day_str] = daily_capacity.get(day_str, 0) + order["machines"]
    
    # Find earliest available start date
    target_end = datetime.strptime(completion_date, "%Y-%m-%d").date()
    days_needed = max(1, int(total_hours / (machines_available * work_hours_per_day)))
    
    # Work backwards from completion date to find start date
    current_start = target_end - timedelta(days=days_needed)
    current_date = datetime.now().date()
    
    # Ensure start date is not in the past
    if current_start < current_date:
        current_start = current_date
    
    # Check if we have capacity, if not, push start date earlier
    machines_needed = 1
    for i in range(days_needed):
        check_date = (current_start + timedelta(days=i)).strftime("%Y-%m-%d")
        used = daily_capacity.get(check_date, 0)
        if used + machines_needed > machines_available:
            # Need to start earlier
            current_start = current_start - timedelta(days=1)
    
    # Recalculate end date based on actual start
    actual_end = current_start + timedelta(days=days_needed)
    
    # If calculated end is after requested completion, it's delayed
    if actual_end > target_end:
        actual_end = target_end  # Keep requested date, mark as priority
    
    return current_start.strftime("%Y-%m-%d"), actual_end.strftime("%Y-%m-%d")


@app.route("/orders", methods=["GET"])
def get_orders():
    """Get all orders with calculated progress, sorted by due date."""
    orders = load_orders()
    # Optional date override for demo/testing (YYYY-MM-DD)
    date_override = request.args.get("date")
    if date_override:
        try:
            today = datetime.strptime(date_override, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid date override format. Use YYYY-MM-DD."}), 400
    else:
        today = datetime.now().date()

    for order in orders:
        start = datetime.strptime(order["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(order["completion_date"], "%Y-%m-%d").date()
        total_days = (end - start).days
        elapsed_days = (today - start).days

        # Calculate progress
        if elapsed_days >= total_days:
            order["progress"] = 100
        elif elapsed_days <= 0:
            order["progress"] = 0
        else:
            daily_increment = calculate_daily_progress(total_days)
            order["progress"] = min(100, daily_increment * elapsed_days)

        # Determine priority
        days_remaining = (end - today).days
        order["is_priority"] = days_remaining <= 2
        order["machines"] = 6 if order["is_priority"] else 1

    # Sort by earliest due date first (EDD scheduling)
    orders.sort(key=lambda x: x["completion_date"])
    
    return jsonify(orders)


@app.route("/orders", methods=["POST"])
def create_order():
    """Create a new order."""
    payload = request.get_json(silent=True) or {}
    
    # Validate input
    required = ["customer_name", "cabinet_type", "color", "quantity", "completion_date"]
    if not all(payload.get(key) for key in required):
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        qty = int(payload.get("quantity"))
        if qty <= 0:
            raise ValueError("Quantity must be > 0")
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid quantity"}), 400

    # Create order with scheduled dates
    orders = load_orders()
    completion_date = payload["completion_date"]
    
    # Calculate realistic start and end dates based on capacity
    scheduled_start, scheduled_end = calculate_scheduled_dates(
        completion_date, qty, orders
    )
    
    order = {
        "id": len(orders) + 1,
        "customer_name": payload["customer_name"],
        "cabinet_type": payload["cabinet_type"],
        "color": payload["color"],
        "quantity": qty,
        "start_date": scheduled_start,
        "completion_date": scheduled_end,
        "status": "In Progress",
        "progress": 0,
        "is_priority": False,
        "machines": 1
    }

    orders.append(order)
    save_orders(orders)
    return jsonify(order), 201


@app.route("/orders/<int:order_id>", methods=["DELETE"])
def delete_order(order_id):
    """Delete an order."""
    orders = load_orders()
    orders = [o for o in orders if o["id"] != order_id]
    save_orders(orders)
    return jsonify({"success": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
