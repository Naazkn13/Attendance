# Commands to Start Backend

To start the backend server on Linux, run the following commands in your terminal:

```bash
# 1. Navigate to the backend directory
cd /home/nuzhatkhan/biometric-attendance-system/backend

# 2. Activate the virtual environment (if you are using one)
# If your virtual environment is named 'venv':
source venv/bin/activate
# Or if it's named '.venv':
source .venv/bin/activate

# 3. Install dependencies (only required the first time or when requirements.txt changes)
pip install -r requirements.txt

# 4. Start the FastAPI server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend API will be available at `http://127.0.0.1:8000`. You can access the automatic API documentation at `http://127.0.0.1:8000/docs`.
