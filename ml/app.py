from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import joblib
import os
import sys
import requests
from datetime import datetime
from collections import OrderedDict
from threading import Lock
from dotenv import load_dotenv 
 
load_dotenv()  
 
print(sys.executable)
 
app = Flask(__name__)
CORS(app)
 
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')
 
TELEGRAM_TOKEN = os.getenv('TELEGRAM_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')
 
if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
    print("⚠️ WARNING: Telegram credentials not found in environment variables!")
    print("Set TELEGRAM_TOKEN and TELEGRAM_CHAT_ID in your .env file or environment.")
 
def send_telegram_notification(message):
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("❌ Telegram not configured - skipping notification")
        return {"error": "Telegram not configured"}
    
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        payload = {
            "chat_id": TELEGRAM_CHAT_ID, 
            "text": message,
            "parse_mode": "HTML"  
        }
        response = requests.post(url, json=payload)
        return response.json()
    except Exception as e:
        print(f"Telegram error: {e}")
 
@app.route('/update-member-status', methods=['POST'])
def update_member_status():
    data = request.json
    user_id = data.get('user_id')
    new_status = data.get('status')
    username = data.get('username')
    
    if new_status and new_status.strip().lower() == 'missing':
        message = f"""
🚨 <b>MISSING ALERT</b>
        
👤 Member: <b>{username}</b>
⏰ Time: {datetime.now().strftime('%H:%M:%S')}
📍 Status: <b>MISSING</b>
 
<i>Immediate action required!</i>
        """
        send_telegram_notification(message)
    
    return {"status": "ok"}
 
@app.route('/send-missing-alert', methods=['POST'])
def send_missing_alert():
    data = request.json
    username = data.get('username')
    
    message = f"""
🚨 <b>MISSING PERSON ALERT!</b>
 
👤 <b>{username}</b> has been marked as MISSING
⏰ Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
 
<i>Please take immediate action</i>
    """
    
    send_telegram_notification(message)
    return {"status": "alert sent"}


def load_asset(filename):
    path  = os.path.join(MODELS_DIR, filename)
    asset = joblib.load(path)
    print(f"  Loaded: {filename}")
    return asset

def format_minutes(minutes):
    if minutes < 0:
        return "Deadline passed"
    h = int(minutes // 60)
    m = int(minutes % 60)
    if h > 0:
        return f"{h}h {m}m"
    return f"{m}m"

# --- Model placeholders ---
walk_speed_model     = None
walk_speed_scaler    = None
walk_late_model      = None
vehicle_speed_model  = None
vehicle_speed_scaler = None

prediction_cache = OrderedDict()
prediction_cache_lock = Lock()
MAX_CACHE_SIZE = 512

try:
    print(f"Loading from: {MODELS_DIR}")
    print(f"Files found: {os.listdir(MODELS_DIR)}")
    walk_speed_model     = load_asset('gait_speed_virtual_sensor.pkl')
    walk_speed_scaler    = load_asset('gait_scaler.pkl')
    walk_late_model      = load_asset('rfid_random_forest.pkl')
    # Vehicle SPEED model (km/h) -- trained on Gradient Boosting,
    # verified leak-free: features = [distance(km), rating,
    # rating_weather, car_or_bus, day, hour]
    vehicle_speed_model  = load_asset('vehicle_speed_gb_model.pkl')
    vehicle_speed_scaler = load_asset('vehicle_speed_scaler.pkl')
    print("All AI assets loaded successfully!")
except Exception as e:
    print(f"Error loading AI assets: {e}")


def _build_prediction_cache_key(kind, item):
    transport = str(item.get('transport_mode', 'walking')).strip().lower()
    if kind == 'walk':
        return (
            kind,
            transport,
            round(float(item.get('distance', 0)), 2),
            round(float(item.get('deadline', 60)), 2),
            int(item.get('age', 25)),
            round(float(item.get('mass', 70)), 2),
            round(float(item.get('height', 1.7)), 2),
            int(item.get('shoe', 40)),
            str(item.get('gender', 'm')).lower(),
        )

    now = datetime.now()
    return (
        kind,
        transport,
        round(float(item.get('distance', 0)), 2),
        round(float(item.get('deadline', 60)), 2),
        now.weekday(),
        now.hour,
        1 if transport == 'bus' else 0,
    )


def get_cached_prediction(kind, item, predictor):
    key = _build_prediction_cache_key(kind, item)

    with prediction_cache_lock:
        if key in prediction_cache:
            prediction_cache.move_to_end(key)
            return prediction_cache[key]

    result = predictor(item)

    with prediction_cache_lock:
        prediction_cache[key] = result
        prediction_cache.move_to_end(key)
        if len(prediction_cache) > MAX_CACHE_SIZE:
            prediction_cache.popitem(last=False)

    return result


def predict_walking(item):
    gender = 1 if str(item.get('gender', 'm')).lower() in ['f', 'female', '1'] else 0

    bio_input = np.array([[
        float(item.get('age', 25)),
        float(item.get('mass', 70)),
        float(item.get('height', 1.7)),
        float(item.get('shoe', 40)),
    ]], dtype=float)

    bio_scaled = walk_speed_scaler.transform(bio_input)

    stage1_input = np.array([[
        float(gender),
        float(bio_scaled[0][0]),
        float(bio_scaled[0][1]),
        float(bio_scaled[0][2]),
        float(bio_scaled[0][3]),
    ]], dtype=float)

    predicted_speed_ms = float(walk_speed_model.predict(stage1_input)[0])

    distance_m   = float(item.get('distance', 500))
    deadline_min = float(item.get('deadline', 60))

    if deadline_min <= 0:
        return 1.0, predicted_speed_ms, 9999

    if predicted_speed_ms > 0:
        time_needed_min = (distance_m / predicted_speed_ms) / 60
    else:
        time_needed_min = 9999

    risk_ratio   = time_needed_min / max(deadline_min, 1)
    is_late_prob = min(risk_ratio, 1.0)

    return is_late_prob, predicted_speed_ms, time_needed_min


def predict_vehicle(item):
    """
    Mirrors predict_walking's pattern: predict SPEED first, then derive
    time_needed = distance / speed, then risk = time_needed / deadline.

    UNIT NOTES (verified against training data via df.describe(), do
    not change without re-checking):
      - Frontend sends `distance` in METERS.
      - The model was trained on `distance` in KILOMETERS.
      - The model predicts `speed` in KM/H.
    So distance is converted m -> km before scaling/predicting, and the
    resulting time is computed in hours then converted to minutes.
    """
    now        = datetime.now()
    transport  = item.get('transport_mode', 'vehicle').lower()
    car_or_bus = 1 if transport == 'bus' else 0

    distance_m   = float(item.get('distance', 0))
    deadline_min = float(item.get('deadline', 60))

    if deadline_min <= 0:
        return 1.0, 9999, 9999

    distance_km = distance_m / 1000.0

    # Feature order MUST match scaler.feature_names_in_ exactly:
    # ['distance', 'rating', 'rating_weather', 'car_or_bus', 'day', 'hour']
    raw = np.array([[
        float(distance_km),
        3.0,
        3.0,
        float(car_or_bus),
        float(now.weekday()),
        float(now.hour),
    ]], dtype=float)

    scaled = vehicle_speed_scaler.transform(raw)
    predicted_speed_kmh = float(vehicle_speed_model.predict(scaled)[0])

    if predicted_speed_kmh > 0:
        # distance_km / speed_kmh -> hours -> minutes
        time_needed_min = (distance_km / predicted_speed_kmh) * 60
    else:
        time_needed_min = 9999

    risk_ratio   = time_needed_min / max(deadline_min, 1)
    is_late_prob = min(risk_ratio, 1.0)

    return is_late_prob, predicted_speed_kmh, time_needed_min


@app.route('/predict', methods=['POST'])
def predict():
    all_loaded = all(x is not None for x in [
        walk_speed_model, walk_speed_scaler, walk_late_model,
        vehicle_speed_model, vehicle_speed_scaler
    ])

    if not all_loaded:
        return jsonify({"error": "Models not loaded"}), 500

    try:
        data  = request.json
        items = data.get('items', [])

        seen, unique_items = set(), []
        for item in items:
            if item.get('id') not in seen:
                seen.add(item.get('id'))
                unique_items.append(item)

        predictions = []

        for item in unique_items:
            transport    = item.get('transport_mode', 'walking').strip().lower()
            deadline_min = item.get('deadline', 60)
            distance_m   = item.get('distance', 0)

            try:
                if transport == 'walk':
                    is_late_prob, speed, time_needed = get_cached_prediction('walk', item, predict_walking)

                    info = (
                        f"Needs : {format_minutes(time_needed)} | "
                    )

                    time_needed_min = time_needed

                else:
                    is_late_prob, predicted_speed_kmh, time_needed = get_cached_prediction('vehicle', item, predict_vehicle)

                    info = (
                        f"Speed: {predicted_speed_kmh:.1f} km/h | "
                        f"Needs: {format_minutes(time_needed)} | "
                        f"Distance: {distance_m:.0f}m"
                    )

                    time_needed_min = time_needed

                risk_percent = min(int(is_late_prob * 100), 100)
                is_late      = risk_percent > 50

                predictions.append({
                    "id": item.get('id'),
                    "label": item.get('label'),
                    "is_late": bool(is_late),
                    "risk": risk_percent,
                    "info": info,
                    "time_needed_min": float(time_needed_min),
                    "deadline_min": float(deadline_min),
                })

            except Exception as e:
                predictions.append({
                    "id": item.get('id'),
                    "label": item.get('label'),
                    "is_late": None,
                    "risk": None,
                    "info": f"Prediction failed: {str(e)}"
                })

        return jsonify({"predictions": predictions})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5000, debug=True)