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


def calculate_machine_schedule(orders):
    """Calculate resource allocation (workers and machines) for each order."""
    # Define available resources
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
    
    # Process definitions with required worker types
    processes = [
        {"name": "CNC Cutting", "machine": "M01", "worker_type": "CNC Operator", "hours_per_cabinet": 2},
        {"name": "CNC Edging", "machine": "M02", "worker_type": "CNC Operator", "hours_per_cabinet": 2},
        {"name": "CNC Routing", "machine": "M03", "worker_type": "CNC Operator", "hours_per_cabinet": 2},
        {"name": "Assembly", "machine": None, "worker_type": "Carpenter", "hours_per_cabinet": 3},
        {"name": "Packing", "machine": None, "worker_type": "Helper", "hours_per_cabinet": 1}
    ]
    
    work_hours_per_day = 8
    
    # Sort orders by priority (HIGH first) and completion date
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
        
        # Schedule through each process in sequence
        for process in processes:
            process_name = process["name"]
            machine_id = process["machine"]
            worker_type = process["worker_type"]
            hours_needed = process["hours_per_cabinet"] * quantity
            days_needed = max(1, int(hours_needed / work_hours_per_day))
            
            # Find first available worker of required type
            available_worker = None
            earliest_worker_date = None
            for worker_id, worker in workers.items():
                if worker["type"] == worker_type:
                    if earliest_worker_date is None or worker["available_until"] < earliest_worker_date:
                        earliest_worker_date = worker["available_until"]
                        available_worker = worker_id
            
            # Determine start date based on worker and machine availability
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
            
            # Store schedule info
            order_schedule[process_name] = {
                "start": start_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d"),
                "days": days_needed,
                "worker": available_worker,
                "machine": machine_id if machine_id else "N/A"
            }
            
            # Add to assignments list for display
            assignments.append({
                "order": order_name,
                "process": process_name,
                "worker": available_worker,
                "machine": machine_id if machine_id else "N/A"
            })
            
            # Update resource availability
            workers[available_worker]["available_until"] = end_date
            if machine_id:
                machines[machine_id]["available_until"] = end_date
        
        schedule[str(order_id)] = order_schedule
    
    return {"schedule": schedule, "assignments": assignments}


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

        # Determine priority (HIGH/MEDIUM/LOW)
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

    # Sort by earliest due date first (EDD scheduling)
    orders.sort(key=lambda x: x["completion_date"])
    
    # Calculate machine schedule with resource allocation
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
    
    # Validate input
    required = ["customer_name", "cabinet_type", "color", "quantity", "completion_date"]
    if not all(payload.get(key) for key in required):
        return jsonify({"error": "Missing required fields"}), 400
    
    try:
        qty = int(payload.get("quantity"))
        if qty < 3 or qty > 50:
            raise ValueError("Quantity must be between 3 and 50")
    except (TypeError, ValueError) as e:
        return jsonify({"error": str(e)}), 400

    # Create order with scheduled dates
    orders = load_orders()
    today = datetime.now().date()
    completion_date = payload["completion_date"]
    
    # Calculate priority based on completion date
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
