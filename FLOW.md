# SoulSmith Application Flow

Single-agent architecture for interactive children's story experience.

---

## Architecture Overview

```
┌─────────────────┐     HTTP/JSON      ┌─────────────────┐    HTTP REST     ┌─────────────────┐
│                 │ ◄───────────────► │                 │ ◄───────────────► │                 │
│    Frontend     │                    │  Flask Backend  │                    │   ElevenLabs    │
│   (Browser)     │                    │   (Python)      │                    │    REST API     │
│                 │                    │                 │                    │                 │
└─────────────────┘                    └─────────────────┘                    └─────────────────┘
        │                                                                            │
        │                              WebSocket (signed URL)                        │
        └───────────────────────────────────────────────────────────────────────────►│
                         Audio I/O (PCM binary + JSON messages)
```

---

## Flow Step-by-Step

### Phase 1: Welcome
User opens `http://localhost:5000`, clicks "Start Adventure"

### Phase 2: Start Adventure Session

**Frontend:**
```javascript
startAdventure()
└── apiCall('/start_adventure', 'POST')
```

**Backend (`/start_adventure`):**
```python
# Get signed URL for WebSocket
token_resp = requests.get(
    f"{ELEVENLABS_BASE_URL}/convai/conversation/get_signed_url?agent_id={ADVENTURE_AGENT_ID}",
    headers=elevenlabs_headers()
)
return {"success": True, "webrtc_config": {"signed_url": ...}}
```

**Frontend connects:**
```javascript
connectToElevenLabs(signed_url, onConversationId)
├── navigator.mediaDevices.getUserMedia({audio: true})
├── new WebSocket(signed_url)
└── startAudioCapture()
```

### Phase 3: Live Conversation

**Audio Flow:**
```
Child speaks → Microphone → PCM Int16 → Base64 → WebSocket → ElevenLabs
                                                                ↓
Speakers ← Web Audio API ← Float32 ← PCM Int16 ← Binary/Base64 ← Agent response
```

**WebSocket Messages:**
- Send: `{user_audio_chunk: base64_pcm_data}`
- Receive: `conversation_initiation_metadata` (with conversation_id)
- Receive: Binary PCM audio or `{type: "audio", audio_event: {audio: base64}}`
- Receive: `user_transcript`, `agent_response`

### Phase 4: End Adventure

**Triggers:**
- Agent calls `end_call` tool → WebSocket closes with code 1000
- User clicks "End Adventure" button

**Frontend:**
```javascript
endAdventure()
├── stopAudioPlayback()      // Stop audio immediately
├── websocket.close()        // Close connection
├── apiCall('/get_transcript', 'GET')
└── apiCall('/metrics', 'GET')
```

**Backend (`/get_transcript`):**
```python
conv_resp = requests.get(
    f"{ELEVENLABS_BASE_URL}/convai/conversations/{conversation_id}",
    headers=elevenlabs_headers()
)
# Returns transcript with {role, text} messages
```

### Phase 5: Metrics Analysis

**Backend (`/metrics`):**
```python
metrics = compute_metrics(None, transcript)
# Uses Claude to analyze vocabulary, creativity, engagement, comprehension
```

### Phase 6: Parent Summary
Display scores and highlights on parent screen.

---

## API Endpoints

| Endpoint | Method | Purpose | External API |
|----------|--------|---------|--------------|
| `/start_adventure` | POST | Get signed URL | ElevenLabs |
| `/set_conversation_id` | POST | Store conv ID | None |
| `/get_transcript` | GET | Fetch transcript | ElevenLabs |
| `/metrics` | GET | Analyze with Claude | Anthropic |
| `/reset` | POST | Reset session | None |

---

## Session Data

```python
session_data = {
    "conversation_id": "conv_xxx",
    "transcript": {"messages": [...]}
}
```
