Low-latency prediction tips for this Flask service:

1. Keep the model loaded in memory (already done).
2. Avoid creating new pandas DataFrames for each prediction when possible.
3. Precompute static values like weekday/hour once per request if reused.
4. Use a lightweight request payload and return only necessary fields.
5. Run the Flask service with a production WSGI server such as Gunicorn.
6. Consider caching repeated predictions for identical inputs.
