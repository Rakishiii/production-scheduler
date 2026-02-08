"""Flask API for cabinet production optimization."""

from __future__ import annotations

import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from formulas import calculate

app = Flask(__name__)
CORS(app)  # Enable CORS for local and deployed frontends


@app.route("/calculate", methods=["POST"])
def calculate_endpoint():
    """Calculate workers and days for a cabinet order."""

    payload = request.get_json(silent=True) or {}
    cabinet_type = str(payload.get("type", "")).strip().lower()
    quantity = payload.get("quantity")

    if not cabinet_type:
        return jsonify({"error": "Missing 'type' in request body."}), 400

    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        return jsonify({"error": "'quantity' must be an integer."}), 400

    if quantity <= 0:
        return jsonify({"error": "'quantity' must be greater than 0."}), 400

    try:
        result = calculate(cabinet_type, quantity)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"workers": result.workers, "days": result.days})


if __name__ == "__main__":
    # Runs locally on http://127.0.0.1:5000
    # Set USE_HTTPS=1 to enable a self-signed HTTPS cert for local testing.
    use_https = os.getenv("USE_HTTPS") == "1"
    ssl_context = "adhoc" if use_https else None
    app.run(debug=True, ssl_context=ssl_context)
