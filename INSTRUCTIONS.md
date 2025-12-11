# SoulSmith - Setup & Implementation Guide

## Quick Start

### Prerequisites
- Python 3.8+
- ElevenLabs account with API key
- Modern web browser with microphone access

### 1. Start the Backend

```bash
cd /Users/samgoldberg/Documents/Projects/SoulSmith

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the server
python server.py
```

Server runs at: `http://localhost:5000`

### 2. Start the Frontend

```bash
cd /Users/samgoldberg/Documents/Projects/SoulSmith/frontend

python3 -m http.server 8080
```

Frontend runs at: `http://localhost:8080`

### 3. Open in Browser

Navigate to `http://localhost:8080` and allow microphone access when prompted.

---

## Configuration Required

Edit `server.py` and set these values:

```python
ELEVENLABS_API_KEY = "your_api_key_here"
INTRO_AGENT_ID = "your_intro_agent_id_here"
```

---

## ElevenLabs Setup

### Step 1: Create the Intro Agent (Manual)

1. Go to [ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai)
2. Create a new agent with these settings:
   - **Name**: SoulSmith Intro Agent
   - **First Message**: "Hi there! I'm your story guide. What's your name?"
   - **System Prompt**:
     ```
     You are a friendly, warm guide for children aged 4-8.
     Your job is to learn about the child so you can create a personalized story.

     Ask these questions naturally in conversation:
     1. What is your name?
     2. What kind of adventure do you want? (magical forest, space, underwater, etc.)
     3. What's your favorite animal or character?
     4. Do you want the story to be funny, exciting, or magical?

     Keep responses short and enthusiastic. Use simple language.
     After gathering this information, say goodbye warmly.
     ```
3. Copy the **Agent ID** and paste it into `server.py`

---

## Implementation TODOs

Below are all the API integrations that need to be implemented. Each section includes the endpoint location and the ElevenLabs API to call.

### Backend (server.py)

#### 1. `/start_intro` - Start Intro Session

**Location**: `server.py` lines 30-45

**API Calls Needed**:

```python
# GET Agent (optional, to verify agent exists)
# GET https://api.elevenlabs.io/v1/convai/agents/{INTRO_AGENT_ID}
# Headers: xi-api-key: {ELEVENLABS_API_KEY}

# Get signed URL for WebRTC
# POST https://api.elevenlabs.io/v1/convai/conversation/get_signed_url
# Headers: xi-api-key: {ELEVENLABS_API_KEY}
# Body: { "agent_id": INTRO_AGENT_ID }
```

**Expected Response**:
```json
{
  "signed_url": "wss://...",
  "conversation_id": "conv_xxx"
}
```

---

#### 2. `/get_intro_transcript` - Get Intro Transcript

**Location**: `server.py` lines 55-75

**API Call Needed**:

```python
# GET https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}
# Headers: xi-api-key: {ELEVENLABS_API_KEY}
```

**Expected Response**:
```json
{
  "conversation_id": "conv_xxx",
  "transcript": [
    {"role": "agent", "message": "Hi there!"},
    {"role": "user", "message": "My name is Emma!"}
  ]
}
```

---

#### 3. `/create_story_agent` - Create Dynamic Story Agent

**Location**: `server.py` lines 85-115

**API Call Needed**:

```python
# POST https://api.elevenlabs.io/v1/convai/agents/create
# Headers: xi-api-key: {ELEVENLABS_API_KEY}
# Body:
{
  "name": "SoulSmith Story Agent - {timestamp}",
  "conversation_config": {
    "agent": {
      "prompt": {
        "prompt": story_prompt  # Built from build_story_prompt()
      },
      "first_message": "Once upon a time...",
      "language": "en"
    },
    "tts": {
      "voice_id": "YOUR_VOICE_ID"  # Choose a friendly voice
    }
  }
}
```

**Expected Response**:
```json
{
  "agent_id": "agent_xxx"
}
```

---

#### 4. `/start_story` - Start Story Session

**Location**: `server.py` lines 120-145

**API Call Needed**:

```python
# POST https://api.elevenlabs.io/v1/convai/conversation/get_signed_url
# Headers: xi-api-key: {ELEVENLABS_API_KEY}
# Body: { "agent_id": story_agent_id }
```

---

#### 5. `/get_story_transcript` - Get Story Transcript

**Location**: `server.py` lines 150-175

**API Call Needed**:

```python
# GET https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}
# Headers: xi-api-key: {ELEVENLABS_API_KEY}
```

---

#### 6. `/metrics` - LLM Analysis (Optional Enhancement)

**Location**: `story_processing.py` lines 95-130

**Optional API Calls**:

```python
# OpenAI
# POST https://api.openai.com/v1/chat/completions
# Headers: Authorization: Bearer {OPENAI_API_KEY}

# OR Claude
# POST https://api.anthropic.com/v1/messages
# Headers: x-api-key: {ANTHROPIC_API_KEY}
```

---

### Frontend (app.js)

#### 1. WebRTC Connection for Intro

**Location**: `frontend/app.js` lines 65-95

**Implementation Needed**:

```javascript
// 1. Create RTCPeerConnection
const pc = new RTCPeerConnection();

// 2. Get microphone access
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
stream.getTracks().forEach(track => pc.addTrack(track, stream));

// 3. Connect to ElevenLabs WebSocket
const ws = new WebSocket(webrtc_config.signed_url);

// 4. Handle WebSocket messages (SDP exchange, ICE candidates)
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle offer/answer/ice candidates
};

// 5. Play incoming audio
pc.ontrack = (event) => {
  const audio = new Audio();
  audio.srcObject = event.streams[0];
  audio.play();
};
```

---

#### 2. WebRTC Connection for Story

**Location**: `frontend/app.js` lines 175-205

Same implementation as intro session.

---

## API Reference

### ElevenLabs Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/convai/agents/{id}` | GET | Get agent details |
| `/v1/convai/agents/create` | POST | Create new agent |
| `/v1/convai/conversation/get_signed_url` | POST | Get WebRTC connection URL |
| `/v1/convai/conversations/{id}` | GET | Get conversation transcript |

### Base URL
```
https://api.elevenlabs.io
```

### Authentication Header
```
xi-api-key: {your_api_key}
```

---

## App Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER FLOW                                │
└─────────────────────────────────────────────────────────────────┘

[Welcome Screen]
      │
      ▼ Click "Start Adventure"
[POST /start_intro] ──► Get WebRTC config
      │
      ▼
[Intro Screen] ◄──► WebRTC ◄──► ElevenLabs Intro Agent
      │                         (Child speaks about preferences)
      ▼ Click "I'm Done"
[GET /get_intro_transcript] ──► Extract conversation
      │
      ▼
[POST /create_story_agent] ──► Build prompt from transcript
      │                        Create new ElevenLabs agent
      ▼
[POST /start_story] ──► Get WebRTC config for story agent
      │
      ▼
[Story Screen] ◄──► WebRTC ◄──► ElevenLabs Story Agent
      │                         (Agent tells personalized story)
      ▼ Click "End Story"
[GET /get_story_transcript] ──► Extract story conversation
      │
      ▼
[GET /metrics] ──► Compute vocabulary, creativity, engagement
      │
      ▼
[Parent Summary Screen] ──► Display metrics and highlights
```

---

## File Structure

```
SoulSmith/
├── server.py              # Flask backend - API endpoints
├── story_processing.py    # Metrics computation & prompt building
├── requirements.txt       # Python dependencies
├── INSTRUCTIONS.md        # This file
└── frontend/
    ├── index.html         # UI structure (5 screens)
    ├── styles.css         # Styling (magical theme)
    └── app.js             # Frontend logic & API calls
```

---

## Testing Without ElevenLabs

The app includes placeholder data so you can test the UI flow:

1. Start both servers
2. Click through the screens
3. The backend returns mock transcripts and metrics
4. Verify the UI displays correctly

Once ElevenLabs is integrated, replace the placeholder responses with real API calls.

---

## Troubleshooting

### CORS Errors
The Flask server includes `flask-cors`. If you still get CORS errors, ensure both servers are running.

### Microphone Access
- Use `localhost` (not `127.0.0.1`) for microphone permissions
- Check browser permissions if microphone doesn't work

### WebRTC Issues
- Ensure you're using HTTPS in production
- Check browser console for WebRTC errors

---

## Next Steps After Implementation

1. **Voice Selection**: Choose appropriate ElevenLabs voices for child-friendly interaction
2. **Error Handling**: Add retry logic for API failures
3. **Session Persistence**: Consider adding conversation history
4. **Analytics**: Track usage patterns for improvement
5. **Mobile Support**: Test and optimize for tablets
