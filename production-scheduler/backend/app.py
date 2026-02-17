"""Production scheduling backend with Flask."""

import json
import os
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Persist orders in a local JSON file.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ORDERS_FILE = os.path.join(BASE_DIR, "orders.json")


def load_orders():
    """Load orders from JSON file."""
    if os.path.exists(ORDERS_FILE):
        with open(ORDERS_FILE, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    return []


def save_orders(orders):
    """Save orders to JSON file."""
    with open(ORDERS_FILE, "w", encoding="utf-8") as f:
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


def calculate_machine_schedule(orders):
    """Calculate resource allocation (workers and machines) for each order."""
    # Resource pools initialized as available today.
    machines = {
        "M01": {"name": "M01 CNC Cutting", "process": "CNC Cutting", "available_until": datetime.now().date()},
        "M02": {"name": "M02 CNC Edging", "process": "CNC Edging", "available_until": datetime.now().date()},
        "M03": {"name": "M03 CNC Routing", "process": "CNC Routing", "available_until": datetime.now().date()}
    }
    
    workers = {
        "W01": {"name": "W01", "type": "CNC Operator", "available_until": datetime.now().date()},
        "W02": {"name": "W02", "type": "CNC Operator", "available_until": datetime.now().date()},
        "W03": {"name": "W03", "type": "CNC Operator", "available_until": datetime.now().date()},
        "W04": {"name": "W04", "type": "Carpenter", "available_until": datetime.now().date()},
        "W05": {"name": "W05", "type": "Carpenter", "available_until": datetime.now().date()},
        "W06": {"name": "W06", "type": "Carpenter", "available_until": datetime.now().date()},
        "W07": {"name": "W07", "type": "Carpenter", "available_until": datetime.now().date()},
        "W08": {"name": "W08", "type": "Carpenter", "available_until": datetime.now().date()},
        "W09": {"name": "W09", "type": "Carpenter", "available_until": datetime.now().date()},
        "W10": {"name": "W10", "type": "Helper", "available_until": datetime.now().date()},
        "W11": {"name": "W11", "type": "Helper", "available_until": datetime.now().date()},
        "W12": {"name": "W12", "type": "Helper", "available_until": datetime.now().date()},
        "W13": {"name": "W13", "type": "Helper", "available_until": datetime.now().date()},
        "W14": {"name": "W14", "type": "Helper", "available_until": datetime.now().date()},
        "W15": {"name": "W15", "type": "Helper", "available_until": datetime.now().date()},
        "W16": {"name": "W16", "type": "Helper", "available_until": datetime.now().date()},
        "W17": {"name": "W17", "type": "Helper", "available_until": datetime.now().date()}
    }
    
    # Process template: machine binding, labor type, and per-cabinet hours.
    processes = [
        {"name": "CNC Cutting", "machine": "M01", "worker_type": "CNC Operator", "hours_per_cabinet": 1.5},
        {"name": "CNC Edging", "machine": "M02", "worker_type": "CNC Operator", "hours_per_cabinet": 1.5},
        {"name": "CNC Routing", "machine": "M03", "worker_type": "CNC Operator", "hours_per_cabinet": 1.5},
        {"name": "Assembly", "machine": None, "worker_type": "Carpenter", "hours_per_cabinet": 4},
        {"name": "Quality Assurance", "machine": None, "worker_type": "Carpenter", "hours_per_cabinet": 0.5},
        {"name": "Packing", "machine": None, "worker_type": "Helper", "hours_per_cabinet": 1}
    ]
    
    work_hours_per_day = 8
    
    # Dispatch rule: priority first, then earliest due date.
    sorted_orders = sorted(orders, key=lambda x: (
        {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(x.get("priority", "LOW"), 2),
        x.get("completion_date", "")
    ))
    
    schedule = {}
    assignments = []
    
    for order in sorted_orders:
        order_id = order["id"]
        order_name = f"O-{order_id}"
        quantity = order.get("quantity", 1)
        order_start = datetime.strptime(order["start_date"], "%Y-%m-%d").date()
        
        order_schedule = {}
        
        # Enforce fixed process sequence for each order.
        for process in processes:
            process_name = process["name"]
            machine_id = process["machine"]
            worker_type = process["worker_type"]
            hours_needed = process["hours_per_cabinet"] * quantity
            days_needed = max(1, int(hours_needed / work_hours_per_day))
            
            # Select the earliest-available worker for the required role.
            available_worker = None
            earliest_worker_date = None
            for worker_id, worker in workers.items():
                if worker["type"] == worker_type:
                    if earliest_worker_date is None or worker["available_until"] < earliest_worker_date:
                        earliest_worker_date = worker["available_until"]
                        available_worker = worker_id
            
            # Stage start is constrained by order, worker, and machine availability.
            if machine_id:
                machine = machines[machine_id]
                start_date = max(
                    order_start,
                    workers[available_worker]["available_until"],
                    machine["available_until"]
                )
            else:
                start_date = max(
                    order_start,
                    workers[available_worker]["available_until"]
                )
            
            end_date = start_date + timedelta(days=days_needed)
            
            # Store stage dates for schedule visualization.
            order_schedule[process_name] = {
                "start": start_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d"),
                "days": days_needed,
                "worker": available_worker,
                "machine": machine_id if machine_id else "N/A"
            }
            
            # Store flattened rows for frontend assignment table.
            assignments.append({
                "order": order_name,
                "process": process_name,
                "worker": available_worker,
                "machine": machine_id if machine_id else "N/A"
            })
            
            # Reserve resources until this stage completes.
            workers[available_worker]["available_until"] = end_date
            if machine_id:
                machines[machine_id]["available_until"] = end_date
        
        schedule[str(order_id)] = order_schedule
    
    return {"schedule": schedule, "assignments": assignments}


def calculate_scheduled_dates(completion_date, quantity, orders):
    """Calculate realistic start date based on machine capacity."""
    # Standard process hours per cabinet.
    stages = {
        "CNC Cutting": 1.5,          # 15%
        "CNC Edging": 1.5,           # 15%
        "CNC Routing": 1.5,          # 15%
        "Assembly": 4,               # 40%
        "Quality Assurance": 0.5,    # 5%
        "Packing": 1                 # 10%
    }
    
    total_hours = sum(stages.values()) * quantity
    machines_available = 6  # Total machines
    work_hours_per_day = 8  # 8-hour workday
    
    # Build daily machine-load map from active orders.
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
    
    # Compute candidate start from the requested due date.
    target_end = datetime.strptime(completion_date, "%Y-%m-%d").date()
    days_needed = max(1, int(total_hours / (machines_available * work_hours_per_day)))
    
    # Back-schedule from requested completion.
    current_start = target_end - timedelta(days=days_needed)
    current_date = datetime.now().date()
    
    # Prevent scheduling in the past.
    if current_start < current_date:
        current_start = current_date
    
    # Shift start earlier when daily machine capacity is exceeded.
    machines_needed = 1
    for i in range(days_needed):
        check_date = (current_start + timedelta(days=i)).strftime("%Y-%m-%d")
        used = daily_capacity.get(check_date, 0)
        if used + machines_needed > machines_available:
            current_start = current_start - timedelta(days=1)
    
    # Recompute end date after start-date adjustments.
    actual_end = current_start + timedelta(days=days_needed)
    
    # Clamp end date to requested completion.
    if actual_end > target_end:
        actual_end = target_end
    
    return current_start.strftime("%Y-%m-%d"), actual_end.strftime("%Y-%m-%d")


@app.route("/orders", methods=["GET"])
def get_orders():
    """Get all orders with calculated progress, sorted by due date."""
    orders = load_orders()
    # Optional reference date override for deterministic runs (YYYY-MM-DD).
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
        status_text = str(order.get("status", "")).strip().lower()

        # Completed orders remain pinned at 100%.
        if status_text == "completed":
            order["progress"] = 100
        else:
            # Active orders derive progress from elapsed schedule days.
            if elapsed_days >= total_days:
                order["progress"] = 100
            elif elapsed_days <= 0:
                order["progress"] = 0
            else:
                daily_increment = calculate_daily_progress(total_days)
                order["progress"] = min(100, daily_increment * elapsed_days)

        if (order.get("progress") or 0) >= 100:
            order["status"] = "Completed"
        else:
            order["status"] = "In Progress"

        # Recompute urgency class from days remaining.
        if order["status"] == "Completed":
            order["priority"] = "LOW"
            order["machines"] = 0
        else:
            days_remaining = (end - today).days
            if days_remaining <= 7:
                order["priority"] = "HIGH"
                order["machines"] = 6
            elif days_remaining <= 21:
                order["priority"] = "MEDIUM"
                order["machines"] = 3
            else:
                order["priority"] = "LOW"
                order["machines"] = 1

    # Return orders in earliest-due-date order.
    orders.sort(key=lambda x: x["completion_date"])
    
    # Build schedule and assignment payloads for the frontend.
    result = calculate_machine_schedule(orders)
    
    return jsonify({
        "orders": orders,
        "machine_schedule": result["schedule"],
        "assignments": result["assignments"]
    })


@app.route("/orders", methods=["POST"])
def create_order():
    """Create a new order."""
    payload = request.get_json(silent=True) or {}
    
    # Validate required fields and quantity limits.
    required = ["customer_name", "cabinet_type", "color", "quantity", "completion_date"]
    if not all(payload.get(key) for key in required):
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        qty = int(payload.get("quantity"))
        if qty < 3 or qty > 50:
            raise ValueError("Quantity must be between 3 and 50")
    except (TypeError, ValueError) as e:
        return jsonify({"error": str(e)}), 400

    # Create and persist a new order record.
    orders = load_orders()
    today = datetime.now().date()
    completion_date = payload["completion_date"]
    
    # Initialize urgency and machine count from due-date distance.
    end_date = datetime.strptime(completion_date, "%Y-%m-%d").date()
    days_remaining = (end_date - today).days
    
    if days_remaining <= 7:
        priority = "HIGH"
        machines = 6
    elif days_remaining <= 21:
        priority = "MEDIUM"
        machines = 3
    else:
        priority = "LOW"
        machines = 1
    
    order = {
        "id": len(orders) + 1,
        "customer_name": payload["customer_name"],
        "cabinet_type": payload["cabinet_type"],
        "color": payload["color"],
        "quantity": qty,
        "start_date": today.strftime("%Y-%m-%d"),
        "completion_date": completion_date,
        "status": "In Progress",
        "progress": 0,
        "priority": priority,
        "machines": machines
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
