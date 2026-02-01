# Debugging Chat History Per Account

## Issue
Chat history doesn't appear to be working per account - messages may not be isolated by user.

## How to Test

### 1. Restart Backend
```bash
# Stop the current backend (Ctrl+C) and restart with logging:
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Test with Browser Console Open
1. Open http://localhost:3000/chat
2. Open browser console (F12 → Console tab)
3. Send a test message
4. Check the console output

### 3. Check Backend Logs
Look for these log messages in the terminal where backend is running:
```
INFO:backend.main:Resolved user_id: <USER_ID> from JWT ...
INFO:backend.senti_next.storage:Saving chat message: user_id=<USER_ID>, role=user, content_length=...
INFO:backend.senti_next.storage:Successfully saved chat message for user_id=<USER_ID>
INFO:backend.senti_next.storage:Loading chat history for user_id=<USER_ID>, limit=20
INFO:backend.senti_next.storage:Loaded X messages for user_id=<USER_ID>
```

### 4. Check Browser Console
Look for these log messages:
```
Loading chat history from: http://localhost:8000/api/chat/history
Chat history response status: 200
Loaded chat history: X messages
Received chat response, backend should have saved messages
```

## Expected Behavior

### If Logged In with Clerk:
- `user_id` should be something like `user_2ABC123XYZ456` (Clerk user ID)
- Messages should be saved/loaded with this ID
- Each Clerk account should have separate chat history

### If Not Logged In (Auth Disabled):
- `user_id` should be `local`
- All messages go to the same "local" user

## Current Database State

Run this to see current messages:
```bash
cd backend && python3 -c "
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
1. The `user_id` shown in backend logs when you send a message
2. The `user_id` shown in backend logs when you load history
3. Whether you're logged in with Clerk or not
4. Any error messages in console or backend logs
