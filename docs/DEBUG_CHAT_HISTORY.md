# Debugging Chat History (Local Mode)

## Issue
Chat history does not persist as expected for the local user.

## How to Test

### 1. Restart Backend
```bash
# Stop the current backend (Ctrl+C) and restart with logging:
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Test with Browser Console Open
1. Open `http://localhost:3000/chat`
2. Open browser console (F12 -> Console tab)
3. Send a test message
4. Check console output

### 3. Check Backend Logs
Look for log messages like:
```
INFO:backend.senti_next.storage:Saving chat message: user_id=local, role=user, content_length=...
INFO:backend.senti_next.storage:Successfully saved chat message for user_id=local
INFO:backend.senti_next.storage:Loading chat history for user_id=local, limit=20
INFO:backend.senti_next.storage:Loaded X messages for user_id=local
```

### 4. Check Browser Console
Look for messages like:
```
Loading chat history from: http://localhost:8000/api/chat/history
Chat history response status: 200
Loaded chat history: X messages
Received chat response, backend should have saved messages
```

## Expected Behavior
- `user_id` is `local`
- Messages are saved and loaded for the same local user
- A new local run sees the existing chat history in the same database

## Current Database State
Run this to inspect current messages:
```bash
cd apps/api && python3 -c "
import os
from dotenv import load_dotenv
from pathlib import Path
from sqlalchemy import create_engine, text

load_dotenv(Path('../.env.local'))
engine = create_engine(os.getenv('DATABASE_URL'))
with engine.connect() as conn:
    result = conn.execute(text('''
        SELECT user_id, COUNT(*) as count
        FROM chat_messages
        GROUP BY user_id
    ''')).fetchall()
    for row in result:
        print(f'{row[0]}: {row[1]} messages')
"
```

## What to Report
Please share:
1. The `user_id` shown in backend logs when sending a message
2. The `user_id` shown in backend logs when loading history
3. Any error messages in console or backend logs
