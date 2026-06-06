from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import pandas as pd
import joblib
import os
import sys
import requests
from datetime import datetime
from dotenv import load_dotenv 
 
load_dotenv()  
 
print(sys.executable)
 
app = Flask(__name__)
CORS(app)
 
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, 'models')
 

TELEGRAM_TOKEN = os.getenv('TELEGRAM_TOKEN')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID')
 
# Warn if not set
if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
    print("⚠️ WARNING: Telegram credentials not found in environment variables!")
    print("Set TELEGRAM_TOKEN and TELEGRAM_CHAT_ID in your .env file or environment.")
 
def send_telegram_notification(message):
    """Send alert to Telegram when someone is marked Missing"""
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
walk_speed_model  = None   # gait_speed_virtual_sensor.pkl  (GBR)
walk_speed_scaler = None   # gait_scaler.pkl
walk_late_model   = None   # rfid_random_forest.pkl
vehicle_model     = None   # travel_time_rf_model.pkl
vehicle_scaler    = None   # travel_time_scaler.pkl

try:
    print(f"Loading from: {MODELS_DIR}")
    print(f"Files found: {os.listdir(MODELS_DIR)}")
    walk_speed_model  = load_asset('gait_speed_virtual_sensor.pkl')
    walk_speed_scaler = load_asset('gait_scaler.pkl')
    walk_late_model   = load_asset('rfid_random_forest.pkl')
    vehicle_model     = load_asset('travel_time_rf_model.pkl')
    vehicle_scaler    = load_asset('travel_time_scaler.pkl')
    print("All AI assets loaded successfully!")
except FileNotFoundError as e:
    print(f"Error: Required file not found — {e}")
except Exception as e:
    print(f"Error loading AI assets: {e}")


def predict_walking(item):
    gender = 1 if str(item.get('gender', 'm')).lower() in ['f', 'female', '1'] else 0

    bio_raw = pd.DataFrame([{
        'age':       item.get('age', 25),
        'body mass': item.get('mass', 70),
        'body size': item.get('height', 1.7),
        'shoe size': item.get('shoe', 40),
    }])
    bio_scaled    = walk_speed_scaler.transform(bio_raw)
    bio_scaled_df = pd.DataFrame(bio_scaled, columns=bio_raw.columns)

    stage1_input = pd.DataFrame([{
        'gender':    gender,
        'age':       bio_scaled_df['age'].iloc[0],
        'body mass': bio_scaled_df['body mass'].iloc[0],
        'body size': bio_scaled_df['body size'].iloc[0],
        'shoe size': bio_scaled_df['shoe size'].iloc[0],
    }])

    predicted_speed_ms = float(walk_speed_model.predict(stage1_input)[0])

    distance_m   = item.get('distance', 500)
    deadline_min = item.get('deadline', 60)

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
    now        = datetime.now()
    transport  = item.get('transport_mode', 'vehicle').lower()
    car_or_bus = 1 if transport == 'bus' else 0

    distance_m   = item.get('distance', 0)
    deadline_min = item.get('deadline', 60)

    if deadline_min <= 0:
        return 1.0, 9999

    raw = pd.DataFrame([{
        'distance':       distance_m,
        'rating':         3,             # neutral road quality
        'rating_weather': 3,             # neutral weather
        'car_or_bus':     car_or_bus,
        'day':            now.weekday(), # 0=Monday, 6=Sunday
        'hour':           now.hour,
    }])

    scaled         = vehicle_scaler.transform(raw) 
    predicted_time = float(vehicle_model.predict(scaled)[0])  # minutes

    risk_ratio   = predicted_time / max(deadline_min, 1)
    is_late_prob = min(risk_ratio, 1.0)

    return is_late_prob, predicted_time


@app.route('/predict', methods=['POST'])
def predict():
    all_loaded = all(x is not None for x in [
        walk_speed_model, walk_speed_scaler, walk_late_model,
        vehicle_model, vehicle_scaler
    ])
    if not all_loaded:
        return jsonify({"error": "One or more models not loaded. Check server logs."}), 503

    try:
        data  = request.json
        items = data.get('items', [])
        print(f"AI received {len(items)} members for prediction.")

        # Deduplicate by id
        seen, unique_items = set(), []
        for item in items:
            if item.get('id') not in seen:
                seen.add(item.get('id'))
                unique_items.append(item)
        print(f"After dedup: {len(unique_items)} unique members.")

        predictions = []
        for item in unique_items:
            transport    = item.get('transport_mode', 'walking').strip().lower()
            deadline_min = item.get('deadline', 60)
            distance_m   = item.get('distance', 0)

            try:
                if transport == 'walk':
                    is_late_prob, speed, time_needed = predict_walking(item)
                    info = (
                        f"Speed : {speed:.2f} m/s | "
                        f"Needs : {format_minutes(time_needed)} | "
                    )
                else:
                    is_late_prob, predicted_time = predict_vehicle(item)
                    info = (
                        f"Estimate travel time:{format_minutes(predicted_time)}   | "
                        f"Distance : {distance_m:.0f}m"
                    )

                risk_percent = min(int(is_late_prob * 100), 100)
                is_late      = risk_percent > 50

                predictions.append({
                    "id":      item.get('id'),
                    "label":   item.get('label'),
                    "is_late": bool(is_late),
                    "risk":    risk_percent,
                    "info":    info
                })

            except Exception as e:
                print(f"  Skipping id={item.get('id')}: {e}")
                predictions.append({
                    "id":      item.get('id'),
                    "label":   item.get('label'),
                    "is_late": None,
                    "risk":    None,
                    "info":    f"Prediction failed: {str(e)}"
                })

        return jsonify({"predictions": predictions})

    except Exception as e:
        print(f"Prediction Error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5000, debug=True)