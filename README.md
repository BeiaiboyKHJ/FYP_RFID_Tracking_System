# Tour Group RFID Tracking/Monitoring & Risk Prediction System

A web-based system for tour organizer to monitor group members at checkpoints using RFID data and manage schedule risks early.

## What it does

- Records member presence at planned checkpoints through RFID scans.
- Lets organisers manage tour groups, members, routes, and checkpoints.
- Estimates walking and vehicle travel speeds.
- Uses a Flask prediction service and trained model to assess late-arrival risk.
- Highlights missing members and late-risk situations for administrators.
- Sends browser notifications for missing-member alerts.

## Architecture

- **Frontend:** React web application in `auth/`.
- **Backend:** Flask API for application logic and prediction.
- **Machine learning:** Models trained in Google Colab to estimate transport speed and checkpoint-delay risk.
- **Tracking:** RFID scan data updates each member’s checkpoint status.

## Workflow

1. The organiser creates a trip, group, route, and checkpoints.
2. Members are identified by RFID at checkpoints.
3. The system evaluates current speed and the remaining time on schedule.
4. When a late risk or missing member is detected, the organiser receives an alert and can adjust the itinerary.

## Project goals

- Improve real-time visibility of tour-group attendance.
- Warn organisers early when the schedule is at risk.
- Support safer, more proactive trip coordination.



## Status

Final Year Project — under active development.
