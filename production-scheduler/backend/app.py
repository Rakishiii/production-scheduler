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


@app.route("/orders", methods=["GET"])
def get_orders():
    """Get all orders with calculated progress."""
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

    # Create order
    orders = load_orders()
    today = datetime.now().strftime("%Y-%m-%d")
    completion_date = payload["completion_date"]
    
    order = {
        "id": len(orders) + 1,
        "customer_name": payload["customer_name"],
        "cabinet_type": payload["cabinet_type"],
        "color": payload["color"],
        "quantity": qty,
        "start_date": today,
        "completion_date": completion_date,
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
    app.run(debug=True)
