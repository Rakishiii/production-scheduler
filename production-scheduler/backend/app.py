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
ATTENDANCE_FILE = os.path.join(BASE_DIR, "attendance.json")
PROCESS_FLOW = [
    {"name": "CNC Cutting", "ratio": 15},
    {"name": "CNC Edging", "ratio": 15},
    {"name": "CNC Routing", "ratio": 15},
    {"name": "Assembly", "ratio": 40},
    {"name": "Quality Assurance", "ratio": 5},
    {"name": "Packing", "ratio": 10},
]
PROCESS_NAMES = [process["name"] for process in PROCESS_FLOW]
PROCESS_RATIO_MAP = {process["name"]: process["ratio"] for process in PROCESS_FLOW}
RESOURCE_CATALOG = [
    {"id": "MO1", "role": "Machine Operator"},
    {"id": "MO2", "role": "Machine Operator"},
    {"id": "MO3", "role": "Machine Operator"},
    {"id": "C1", "role": "Carpenter"},
    {"id": "C2", "role": "Carpenter"},
    {"id": "C3", "role": "Carpenter"},
    {"id": "C4", "role": "Carpenter"},
    {"id": "C5", "role": "Carpenter"},
    {"id": "C6", "role": "Carpenter"},
    {"id": "NSH1", "role": "Non-Skilled Helper"},
    {"id": "NSH2", "role": "Non-Skilled Helper"},
    {"id": "NSH3", "role": "Non-Skilled Helper"},
    {"id": "NSH4", "role": "Non-Skilled Helper"},
    {"id": "NSH5", "role": "Non-Skilled Helper"},
    {"id": "NSH6", "role": "Non-Skilled Helper"},
    {"id": "NSH7", "role": "Non-Skilled Helper"},
    {"id": "NSH8", "role": "Non-Skilled Helper"},
]
RESOURCE_ROLE_MAP = {entry["id"]: entry["role"] for entry in RESOURCE_CATALOG}


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


def load_attendance():
    """Load attendance records from JSON file."""
    if os.path.exists(ATTENDANCE_FILE):
        with open(ATTENDANCE_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    return []


def save_attendance(records):
    """Save attendance records to JSON file."""
    with open(ATTENDANCE_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)


def build_absence_index(attendance_records):
    """Build date -> set(resource_id) index for absent resources."""
    absence = {}
    for record in attendance_records or []:
        date_str = str(record.get("date", "")).strip()
        resource = str(record.get("resource", "")).strip().upper()
        if not date_str or not resource:
            continue
        absence.setdefault(date_str, set()).add(resource)
    return absence


def is_absent_on(absence_index, resource_id, on_date):
    """Check if a resource is absent on the given date."""
    date_key = on_date.strftime("%Y-%m-%d")
    return resource_id in absence_index.get(date_key, set())


def next_available_day(resource_id, start_date, absence_index):
    """Move forward until a non-absence day for this resource."""
    day = start_date
    while is_absent_on(absence_index, resource_id, day):
        day = day + timedelta(days=1)
    return day


def has_absence_during_stage(resource_id, start_date, days_needed, absence_index):
    """Check whether resource is absent on any day in the stage window."""
    span = max(1, int(days_needed))
    for offset in range(span):
        day = start_date + timedelta(days=offset)
        if is_absent_on(absence_index, resource_id, day):
            return True
    return False


def completed_processes_from_progress(progress):
    """Derive completed process list from a numeric progress value."""
    numeric = max(0, min(100, int(round(float(progress or 0)))))
    completed = []
    cumulative = 0
    for process in PROCESS_FLOW:
        cumulative += process["ratio"]
        if numeric >= cumulative:
            completed.append(process["name"])
        else:
            break
    return completed


def calculate_progress_from_completed(completed_processes):
    """Calculate progress as the sum of sequentially completed process ratios."""
    completed_set = set(completed_processes or [])
    progress = 0
    for process in PROCESS_FLOW:
        if process["name"] in completed_set:
            progress += process["ratio"]
        else:
            break
    return min(100, progress)


def clamp_percent(value, lower=0, upper=99):
    """Clamp a numeric percentage value into a safe range."""
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0
    return max(lower, min(upper, numeric))


def get_next_pending_process(completed_processes):
    """Return the next process that has not been completed yet."""
    completed_set = set(completed_processes or [])
    return next((name for name in PROCESS_NAMES if name not in completed_set), None)


def normalize_order_state(order):
    """Normalize manual completion fields and keep progress/status consistent."""
    raw_completed = order.get("completed_processes")
    if not isinstance(raw_completed, list):
        was_completed = str(order.get("status", "")).strip().lower() == "completed"
        had_full_progress = (order.get("progress") or 0) >= 100
        raw_completed = PROCESS_NAMES[:] if (was_completed or had_full_progress) else []

    allowed = set(PROCESS_NAMES)
    completed_set = set(
        name for name in raw_completed
        if isinstance(name, str) and name in allowed
    )

    completed = []
    for process in PROCESS_FLOW:
        if process["name"] in completed_set:
            completed.append(process["name"])
        else:
            break

    next_process = get_next_pending_process(completed)
    completed_progress = calculate_progress_from_completed(completed)
    raw_active_progress = order.get("active_process_progress", 0)

    if next_process is None:
        active_progress = 0
        progress = 100
    else:
        active_progress = clamp_percent(raw_active_progress)

        # One-time compatibility path for legacy orders that only had numeric progress.
        if (not isinstance(order.get("active_process_progress"), (int, float))
                and (order.get("progress") or 0) > completed_progress):
            stage_ratio = PROCESS_RATIO_MAP.get(next_process, 0)
            if stage_ratio > 0:
                inferred = ((float(order.get("progress", 0)) - completed_progress) / stage_ratio) * 100
                active_progress = clamp_percent(inferred)

        stage_ratio = PROCESS_RATIO_MAP.get(next_process, 0)
        progress = completed_progress + (stage_ratio * (active_progress / 100.0))
        progress = round(max(0, min(99, progress)), 2)

    order["completed_processes"] = completed
    order["active_process_progress"] = int(round(active_progress))
    order["progress"] = progress
    order["status"] = "Completed" if next_process is None else "In Progress"
    return order


def calculate_priority_and_machines(days_until_completion):
    """Determine priority and machine allocation."""
    is_priority = days_until_completion <= 2
    machines = 6 if is_priority else 1
    return is_priority, machines


def apply_priority_settings(order, today):
    """Update priority and machine allocation based on due date and completion state."""
    end = datetime.strptime(order["completion_date"], "%Y-%m-%d").date()
    if order["status"] == "Completed":
        order["priority"] = "LOW"
        order["machines"] = 0
        return

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


def calculate_daily_progress(days):
    """Calculate daily progress increment."""
    if days <= 0:
        return 100
    return 100 / days


def calculate_machine_schedule(orders, attendance_records=None):
    """Calculate resource allocation (workers and machines) for each order."""
    absence_index = build_absence_index(attendance_records or [])

    # Resource pools initialized as available today.
    machines = {
        "MO1": {"name": "MO1 CNC Cutting", "process": "CNC Cutting", "available_until": datetime.now().date()},
        "MO2": {"name": "MO2 CNC Edging", "process": "CNC Edging", "available_until": datetime.now().date()},
        "MO3": {"name": "MO3 CNC Routing", "process": "CNC Routing", "available_until": datetime.now().date()}
    }
    
    workers = {
        # Dedicated machine operators.
        "MO1": {"name": "MO1", "type": "MO1 Operator", "available_until": datetime.now().date()},
        "MO2": {"name": "MO2", "type": "MO2 Operator", "available_until": datetime.now().date()},
        "MO3": {"name": "MO3", "type": "MO3 Operator", "available_until": datetime.now().date()},
        # Carpenters.
        "C1": {"name": "C1", "type": "Carpenter", "available_until": datetime.now().date()},
        "C2": {"name": "C2", "type": "Carpenter", "available_until": datetime.now().date()},
        "C3": {"name": "C3", "type": "Carpenter", "available_until": datetime.now().date()},
        "C4": {"name": "C4", "type": "Carpenter", "available_until": datetime.now().date()},
        "C5": {"name": "C5", "type": "Carpenter", "available_until": datetime.now().date()},
        "C6": {"name": "C6", "type": "Carpenter", "available_until": datetime.now().date()},
        # Non-skilled helpers.
        "NSH1": {"name": "NSH1", "type": "Helper", "available_until": datetime.now().date()},
        "NSH2": {"name": "NSH2", "type": "Helper", "available_until": datetime.now().date()},
        "NSH3": {"name": "NSH3", "type": "Helper", "available_until": datetime.now().date()},
        "NSH4": {"name": "NSH4", "type": "Helper", "available_until": datetime.now().date()},
        "NSH5": {"name": "NSH5", "type": "Helper", "available_until": datetime.now().date()},
        "NSH6": {"name": "NSH6", "type": "Helper", "available_until": datetime.now().date()},
        "NSH7": {"name": "NSH7", "type": "Helper", "available_until": datetime.now().date()},
        "NSH8": {"name": "NSH8", "type": "Helper", "available_until": datetime.now().date()},
    }
    
    # Process template: machine binding, labor type, and per-cabinet hours.
    processes = [
        {"name": "CNC Cutting", "machine": "MO1", "worker_type": "MO1 Operator", "hours_per_cabinet": 1.5},
        {"name": "CNC Edging", "machine": "MO2", "worker_type": "MO2 Operator", "hours_per_cabinet": 1.5},
        {"name": "CNC Routing", "machine": "MO3", "worker_type": "MO3 Operator", "hours_per_cabinet": 1.5},
        {"name": "Assembly", "machine": None, "worker_type": "Carpenter", "hours_per_cabinet": 4},
        {"name": "Quality Assurance", "machine": None, "worker_type": "Carpenter", "hours_per_cabinet": 0.5},
        {"name": "Packing", "machine": None, "worker_type": "Helper", "hours_per_cabinet": 1}
    ]
    
    work_hours_per_day = 7
    
    # Dispatch rule: priority first, then earliest due date.
    sorted_orders = sorted(orders, key=lambda x: (
        {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(x.get("priority", "LOW"), 2),
        x.get("completion_date", "")
    ))
    
    schedule = {}
    assignments = []

    def find_worker_start(worker_id, earliest_start, machine_id, days_needed):
        """Return the earliest valid start for a worker, honoring machine lock and absences."""
        worker = workers[worker_id]
        candidate_start = max(earliest_start, worker["available_until"])
        if machine_id:
            machine = machines[machine_id]
            candidate_start = max(candidate_start, machine["available_until"])
        candidate_start = next_available_day(worker_id, candidate_start, absence_index)
        while has_absence_during_stage(worker_id, candidate_start, days_needed, absence_index):
            candidate_start = next_available_day(
                worker_id,
                candidate_start + timedelta(days=1),
                absence_index
            )
        return candidate_start
    
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
            
            available_workers = []
            if process_name == "Assembly":
                # Assembly needs a team: 2 carpenters + 1 helper (duration unchanged).
                role_requirements = [("Carpenter", 2), ("Helper", 1)]
                selected_workers = []
                team_start = order_start

                for role_name, required_count in role_requirements:
                    role_candidates = []
                    for worker_id, worker in workers.items():
                        if worker["type"] != role_name or worker_id in selected_workers:
                            continue
                        candidate_start = find_worker_start(worker_id, order_start, None, days_needed)
                        role_candidates.append((candidate_start, worker_id))

                    role_candidates.sort(key=lambda item: (item[0], item[1]))
                    chosen = role_candidates[:required_count]
                    if len(chosen) < required_count:
                        selected_workers = []
                        break

                    selected_workers.extend(worker_id for _, worker_id in chosen)
                    latest_role_start = max(start_date for start_date, _ in chosen)
                    if latest_role_start > team_start:
                        team_start = latest_role_start

                if not selected_workers:
                    continue

                # Align the team start so every selected worker is available for the full stage span.
                while True:
                    adjusted = False
                    for worker_id in selected_workers:
                        candidate_start = find_worker_start(worker_id, team_start, None, days_needed)
                        if candidate_start > team_start:
                            team_start = candidate_start
                            adjusted = True
                    if not adjusted:
                        break

                available_workers = selected_workers
                start_date = team_start
            else:
                # Select the earliest-available worker for the required role.
                available_worker = None
                best_start_date = None
                for worker_id, worker in workers.items():
                    if worker["type"] == worker_type:
                        if machine_id and worker_id != machine_id:
                            continue

                        candidate_start = find_worker_start(worker_id, order_start, machine_id, days_needed)
                        if best_start_date is None or candidate_start < best_start_date:
                            best_start_date = candidate_start
                            available_worker = worker_id

                if available_worker is None:
                    continue

                available_workers = [available_worker]
                start_date = best_start_date
            
            end_date = start_date + timedelta(days=days_needed)
            
            # Store stage dates for schedule visualization.
            order_schedule[process_name] = {
                "start": start_date.strftime("%Y-%m-%d"),
                "end": end_date.strftime("%Y-%m-%d"),
                "days": days_needed,
                "worker": ", ".join(available_workers),
                "machine": machine_id if machine_id else "N/A"
            }
            
            # Store flattened rows for frontend assignment table.
            assignments.append({
                "order": order_name,
                "process": process_name,
                "worker": ", ".join(available_workers),
                "machine": machine_id if machine_id else "N/A"
            })
            
            # Reserve resources until this stage completes.
            for worker_id in available_workers:
                workers[worker_id]["available_until"] = end_date
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
    work_hours_per_day = 7  # 8:00-16:00 with 12:00-13:00 break
    
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
    """Get all orders with manual progress state, sorted by due date."""
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
        normalize_order_state(order)
        apply_priority_settings(order, today)

    # Return orders in earliest-due-date order.
    orders.sort(key=lambda x: x["completion_date"])
    
    # Build schedule and assignment payloads for the frontend.
    attendance_records = load_attendance()
    result = calculate_machine_schedule(orders, attendance_records)
    
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
    required = ["customer_name", "cabinet_type", "color", "quantity", "completion_date", "start_date"]
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
    start_date = payload["start_date"]
    
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
        "start_date": start_date,
        "completion_date": completion_date,
        "status": "In Progress",
        "progress": payload.get("progress", 0),
        "completed_processes": payload.get("completed_processes", []),
        "active_process_progress": payload.get("active_process_progress", 0),
        "priority": priority,
        "machines": machines
    }
    normalize_order_state(order)
    apply_priority_settings(order, today)

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


@app.route("/orders/<int:order_id>/complete-process", methods=["POST"])
def complete_process(order_id):
    """Mark the next pending process as completed for an order."""
    payload = request.get_json(silent=True) or {}
    process_name = payload.get("process")
    if process_name not in PROCESS_NAMES:
        return jsonify({"error": "Invalid process name."}), 400

    orders = load_orders()
    order = next((item for item in orders if item.get("id") == order_id), None)
    if not order:
        return jsonify({"error": "Order not found."}), 404

    normalize_order_state(order)
    if order["status"] == "Completed":
        return jsonify(order)

    next_process = get_next_pending_process(order.get("completed_processes", []))
    if process_name != next_process:
        return jsonify({"error": f"Only the current task can be completed now: {next_process}."}), 409

    order.setdefault("completed_processes", []).append(process_name)
    order["active_process_progress"] = 0
    normalize_order_state(order)

    apply_priority_settings(order, datetime.now().date())

    save_orders(orders)
    return jsonify(order)


@app.route("/orders/<int:order_id>/update-process-progress", methods=["POST"])
def update_process_progress(order_id):
    """Update partial completion percent for the current process of an order."""
    payload = request.get_json(silent=True) or {}
    process_name = payload.get("process")
    percent = payload.get("percent")

    if process_name not in PROCESS_NAMES:
        return jsonify({"error": "Invalid process name."}), 400

    try:
        numeric_percent = float(percent)
    except (TypeError, ValueError):
        return jsonify({"error": "Progress percent must be a number between 0 and 99."}), 400
    if numeric_percent < 0 or numeric_percent > 99:
        return jsonify({"error": "Progress percent must be between 0 and 99."}), 400

    orders = load_orders()
    order = next((item for item in orders if item.get("id") == order_id), None)
    if not order:
        return jsonify({"error": "Order not found."}), 404

    normalize_order_state(order)
    if order["status"] == "Completed":
        return jsonify({"error": "Order is already completed."}), 409

    next_process = get_next_pending_process(order.get("completed_processes", []))
    if process_name != next_process:
        return jsonify({"error": f"Only the current task can be updated now: {next_process}."}), 409

    order["active_process_progress"] = int(round(clamp_percent(numeric_percent)))
    normalize_order_state(order)
    apply_priority_settings(order, datetime.now().date())
    save_orders(orders)
    return jsonify(order)


@app.route("/attendance", methods=["GET"])
def get_attendance():
    """Return attendance records and available resources."""
    records = load_attendance()
    records = sorted(records, key=lambda x: (x.get("date", ""), x.get("resource", "")))
    return jsonify({"attendance": records, "resources": RESOURCE_CATALOG})


@app.route("/attendance", methods=["POST"])
def create_attendance():
    """Mark a resource absent for a specific day."""
    payload = request.get_json(silent=True) or {}
    date_str = str(payload.get("date", "")).strip()
    resource = str(payload.get("resource", "")).strip().upper()
    reason = str(payload.get("reason", "")).strip()

    if not date_str or not resource:
        return jsonify({"error": "Both date and resource are required."}), 400
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400

    if resource not in RESOURCE_ROLE_MAP:
        return jsonify({"error": "Invalid resource ID."}), 400

    records = load_attendance()
    if any(item.get("date") == date_str and str(item.get("resource", "")).upper() == resource for item in records):
        return jsonify({"error": "This resource is already marked absent on that date."}), 409

    next_id = max([int(item.get("id", 0)) for item in records] + [0]) + 1
    record = {
        "id": next_id,
        "date": date_str,
        "resource": resource,
        "role": RESOURCE_ROLE_MAP[resource],
        "reason": reason,
    }
    records.append(record)
    save_attendance(records)
    return jsonify(record), 201


@app.route("/attendance/<int:record_id>", methods=["DELETE"])
def delete_attendance(record_id):
    """Delete an attendance absence record by ID."""
    records = load_attendance()
    filtered = [item for item in records if int(item.get("id", 0)) != record_id]
    if len(filtered) == len(records):
        return jsonify({"error": "Attendance record not found."}), 404
    save_attendance(filtered)
    return jsonify({"success": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
