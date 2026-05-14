from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import joblib 
import sys
import os
print(sys.executable)
from tensorflow.keras.models import load_model # To load your LSTM

app = Flask(__name__)
CORS(app)

# 1. Load your trained AI assets
# Make sure these files are in the same folder as app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = None
scaler = None

try:
    model = load_model(os.path.join(BASE_DIR, 'fyp_lstm_model.h5'))
    scaler = joblib.load(os.path.join(BASE_DIR, 'scaler.pkl'))
    print("AI Model and Scaler loaded successfully!")
except FileNotFoundError:
    print("Error: scaler.pkl file not found. Please ensure it is in the same directory as app.py.")
except Exception as e:
    print(f"Error loading AI assets: {e}")

@app.route('/predict', methods=['POST'])
def predict():
    if model is None or scaler is None:
        return jsonify({"error": "AI model or scaler not loaded. Please check server logs."}), 500

    try:
        data = request.json
        items = data.get('items', [])
        predictions = []

        for item in items:
            # 2. Extract features from React (must match training order)
            # Example: [distance, age, mass, height, shoe, deadline]
            raw_features = np.array([[
                item.get('distance', 0),
                item.get('age', 25),
                item.get('mass', 70),
                item.get('height', 1.7),
                item.get('shoe', 40),
                item.get('deadline', 60)
            ]])

            # 3. Scale the data (Crucial for LSTM)
            scaled_features = scaler.transform(raw_features)

            # 4. Reshape for LSTM (Samples, Time_Steps, Features)
            # Assuming your model takes 1 time step
            lstm_input = scaled_features.reshape((scaled_features.shape[0], 1, scaled_features.shape[1]))

            # 5. Run Prediction
            prediction_score = float(model.predict(lstm_input)[0][0])
            
            # 6. Interpret Results
            # If your model predicts 'Delay Minutes', calculate risk based on deadline
            # If your model predicts 'Probability', use it directly
            risk_percent = int(prediction_score * 100) 
            is_late = risk_percent > 50  # Risk threshold

            predictions.append({
                "id": item.get('id'),
                "label": item.get('label'),
                "is_late": bool(is_late),
                "risk": risk_percent,
                "info": f"Predicted risk based on {item.get('transport_mode')} mode"
            })
            
        return jsonify({"predictions": predictions})
    except Exception as e:
        print(f"Prediction Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)