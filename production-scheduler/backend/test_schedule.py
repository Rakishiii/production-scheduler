import json
from app import calculate_machine_schedule, load_orders

orders = load_orders()
result = calculate_machine_schedule(orders)
print("Result keys:", list(result.keys()))
if result.get('schedule') and '1' in result['schedule']:
    print("\nSchedule for order 1:")
    sched = result['schedule']['1']
    for process, details in sched.items():
        print(f"  {process}: worker={details.get('worker')}, machine={details.get('machine')}")
print("\nTotal assignments:", len(result.get('assignments', [])))
if result.get('assignments'):
    print("\nFirst 3 assignments:")
    for a in result['assignments'][:3]:
        print(f"  {a}")
