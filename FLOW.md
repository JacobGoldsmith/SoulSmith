# SoulSmith Application Flow

This document explains the complete flow of the SoulSmith application, including all API calls and data transformations.

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
        │                                                                            │
        │                              WebSocket (signed URL)                        │
        └───────────────────────────────────────────────────────────────────────────►│
                         Audio I/O (PCM binary + JSON messages)                      │
                                                                     ┌─────────────────┐
                                                                     │   ElevenLabs    │
                                                                     │   Convai WS     │
                                                                     └─────────────────┘
```

---

## Complete Flow Step-by-Step

### Phase 1: Welcome Screen

**User Action:** Opens app at `http://localhost:5000`

**What Happens:**
1. Flask serves `index.html`, `styles.css`, `app.js` from the `/frontend` directory
2. JavaScript initializes, shows welcome screen
3. App waits for user to click "Start Adventure"

---

### Phase 2: Start Intro Session

**User Action:** Clicks "Start Adventure" button

**Frontend (app.js):**
```javascript
startIntroSession()
└── apiCall('/start_intro', 'POST')
```

**Backend (server.py) - `/start_intro`:**
```python
# 1. Verify intro agent exists (optional)
agent_resp = requests.get(
    f"{ELEVENLABS_BASE_URL}/convai/agents/{INTRO_AGENT_ID}",
    headers=elevenlabs_headers()
)

# 2. Get signed URL for WebSocket connection
token_resp = requests.get(
    f"{ELEVENLABS_BASE_URL}/convai/conversation/get_signed_url?agent_id={INTRO_AGENT_ID}",
    headers=elevenlabs_headers()
)

# 3. Return signed URL to frontend
return {
    "success": True,
    "webrtc_config": {"signed_url": token_data.get("signed_url")},
    "agent_id": INTRO_AGENT_ID
}
```

**ElevenLabs API Calls:**
| Call | Method | Endpoint |
|------|--------|----------|
| Get Agent | GET | `/v1/convai/agents/{agent_id}` |
| Get Signed URL | GET | `/v1/convai/conversation/get_signed_url?agent_id={agent_id}` |

**Frontend receives response, then:**
```javascript
connectToElevenLabs(signed_url, onConversationId, ...)
└── navigator.mediaDevices.getUserMedia({audio: true})  // Get microphone
└── new WebSocket(signed_url)  // Connect using signed URL
└── startAudioCapture()  // Begin sending audio to ElevenLabs
```

**WebSocket Connection:**
```
Browser ◄──── WebSocket ────► ElevenLabs Convai Server
         │
         ├── Sends: JSON {type: "audio", audio: base64_pcm_data}
         ├── Receives: JSON conversation_initiation_metadata (with conversation_id)
         ├── Receives: Binary PCM audio (agent voice) OR JSON {type: "audio", audio: base64}
         ├── Receives: JSON user_transcript (what child said)
         └── Receives: JSON agent_response (what agent said)
```

**When conversation_id is received:**
```javascript
onConversationId(conversationId)
└── apiCall('/set_intro_conversation_id', 'POST', {conversation_id})
```

**Backend stores conversation_id:**
```python
session_data["intro_conversation_id"] = conversation_id
```

---

### Phase 3: Intro Conversation (Live)

**What's Happening:**
- Child speaks into microphone
- Audio is captured, converted to PCM int16, base64 encoded
- Sent to ElevenLabs via WebSocket
- ElevenLabs processes speech, generates agent response
- Agent audio sent back via WebSocket
- Browser plays agent audio through speakers

**Audio Flow:**
```
Child's Voice
     │
     ▼
Microphone (getUserMedia)
     │
     ▼
AudioContext (ScriptProcessor @ 16kHz)
     │
     ▼
Float32 → Int16 PCM conversion
     │
     ▼
Base64 encoding
     │
     ▼
WebSocket send: {type: "audio", audio: base64Data}
     │
     ▼
ElevenLabs STT → LLM → TTS
     │
     ▼
WebSocket receive: Binary PCM data (16-bit @ 16kHz)
     │
     ▼
Int16 PCM → Float32 conversion
     │
     ▼
Audio queue → Web Audio API playback
     │
     ▼
Play through speakers
```

---

### Phase 4: End Intro Session

**User Action:** Clicks "I'm Done Talking" button

**Frontend (app.js):**
```javascript
endIntroSession()
├── disconnectFromElevenLabs()  // Close WebSocket, stop audio
├── showScreen('transition')
├── wait(1000)  // Give ElevenLabs time to finalize transcript
└── getIntroTranscript()
    └── apiCall('/get_intro_transcript', 'GET')
```

**Backend (server.py) - `/get_intro_transcript`:**
```python
# 1. Get stored conversation ID
conversation_id = session_data["intro_conversation_id"]

# 2. Fetch conversation with transcript from ElevenLabs
conv_resp = requests.get(
    f"{ELEVENLABS_BASE_URL}/convai/conversations/{conversation_id}",
    headers=elevenlabs_headers()
)
conv_data = conv_resp.json()

# 3. Format transcript
messages = []
for entry in conv_data.get("transcript", []):
    messages.append({
        "role": entry.get("role"),      # "agent" or "user"
        "text": entry.get("message")
    })

# 4. Store and return
session_data["intro_transcript"] = transcript
return {"success": True, "transcript": transcript}
```

**ElevenLabs API Call:**
| Call | Method | Endpoint |
|------|--------|----------|
| Get Conversation | GET | `/v1/convai/conversations/{conversation_id}` |

**Example Transcript Response:**
```json
{
  "conversation_id": "conv_abc123",
  "messages": [
    {"role": "agent", "text": "Hi! What's your name?"},
    {"role": "user", "text": "I'm Emma!"},
    {"role": "agent", "text": "Nice to meet you Emma! What kind of adventure do you want?"},
    {"role": "user", "text": "I want to go to a magical forest with unicorns!"}
  ]
}
```

---

### Phase 5: Create Story Agent

**Frontend (app.js):**
```javascript
createStoryAgent()
└── apiCall('/create_story_agent', 'POST')
```

**Backend (server.py) - `/create_story_agent`:**
```python
# 1. Get stored intro transcript
transcript = session_data["intro_transcript"]

# 2. Build custom story prompt (story_processing.py)
story_prompt = build_story_prompt(transcript)
```

**story_processing.py - `build_story_prompt()`:**
```python
# Extract what the child said
user_messages = [m["text"] for m in messages if m["role"] == "user"]
child_responses = "\n".join(user_messages)

# Build personalized prompt
story_prompt = f"""You are a warm, engaging storyteller for children aged 4-8.

Here is what the child told you during the intro:
---
{child_responses}
---

STORYTELLING GUIDELINES:
1. Create a personalized adventure incorporating the child's interests
2. Use simple, age-appropriate language
3. Pause occasionally to ask "What do you think happens next?"
4. Include the child as the hero of the story
5. Keep the story positive, magical, and encouraging
6. The story should last about 3-5 minutes
7. End with a happy conclusion

Begin with "Once upon a time..." and make it magical!
"""
```

**Backend continues:**
```python
# 3. Create new agent on ElevenLabs with this prompt
create_resp = requests.post(
    f"{ELEVENLABS_BASE_URL}/convai/agents/create",
    headers=elevenlabs_headers(),
    json={
        "name": "SoulSmith Story Agent",
        "conversation_config": {
            "agent": {
                "prompt": {"prompt": story_prompt},
                "first_message": "Once upon a time, in a land not so far away...",
                "language": "en"
            },
            "tts": {"voice_id": "21m00Tcm4TlvDq8ikWAM"}  # Default voice
        }
    }
)
agent_data = create_resp.json()

# 4. Store and return agent ID
session_data["story_agent_id"] = agent_data.get("agent_id")
return {"success": True, "story_agent_id": agent_data.get("agent_id")}
```

**ElevenLabs API Call:**
| Call | Method | Endpoint |
|------|--------|----------|
| Create Agent | POST | `/v1/convai/agents/create` |

---

### Phase 6: Start Story Session

**Frontend (app.js):**
```javascript
startStorySession()
└── apiCall('/start_story', 'POST')
```

**Backend (server.py) - `/start_story`:**
```python
# 1. Get the story agent ID we just created
story_agent_id = session_data["story_agent_id"]

# 2. Get signed URL for this agent
token_resp = requests.get(
    f"{ELEVENLABS_BASE_URL}/convai/conversation/get_signed_url?agent_id={story_agent_id}",
    headers=elevenlabs_headers()
)
token_data = token_resp.json()

# 3. Return signed URL
return {
    "success": True,
    "webrtc_config": {"signed_url": token_data.get("signed_url")},
    "agent_id": story_agent_id
}
```

**Frontend then connects to ElevenLabs (same as Phase 2):**
```javascript
connectToElevenLabs(signed_url, onConversationId, 'story-status', 'story-visualizer')
```

---

### Phase 7: Story Conversation (Live)

**What's Happening:**
- Story agent immediately starts telling the personalized story
- Agent pauses to ask questions, child can respond
- Same audio flow as Phase 3
- Conversation ID stored via `/set_story_conversation_id`

---

### Phase 8: End Story & Get Transcript

**User Action:** Clicks "End Story" button

**Frontend (app.js):**
```javascript
endStorySession()
├── disconnectFromElevenLabs()
├── showScreen('transition')
├── wait(1000)
└── getStoryTranscript()
    └── apiCall('/get_story_transcript', 'GET')
```

**Backend (server.py) - `/get_story_transcript`:**
```python
# Same pattern as get_intro_transcript
conv_resp = requests.get(
    f"{ELEVENLABS_BASE_URL}/convai/conversations/{session_data['story_conversation_id']}",
    headers=elevenlabs_headers()
)
conv_data = conv_resp.json()
# Format and return transcript
```

---

### Phase 9: Compute Metrics

**Frontend (app.js):**
```javascript
showParentSummary()
└── apiCall('/metrics', 'GET')
```

**Backend (server.py) - `/metrics`:**
```python
intro_transcript = session_data["intro_transcript"]
story_transcript = session_data["story_transcript"]

# Call story_processing module
metrics = compute_metrics(intro_transcript, story_transcript)
return {"success": True, "metrics": metrics}
```

**story_processing.py - `compute_metrics()`:**
```python
def compute_metrics(intro_transcript, story_transcript):
    # 1. Extract all child's text
    combined_text = extract_user_text(intro_transcript) + " " + extract_user_text(story_transcript)

    # 2. Calculate rule-based metrics
    vocabulary = calculate_vocabulary_metrics(combined_text)
    # - total_words, unique_words, diversity_ratio, avg_word_length

    engagement = calculate_engagement_metrics(story_transcript)
    # - total_exchanges, child_responses, questions_asked, avg_response_words

    creativity = calculate_creativity_indicators(combined_text)
    # - imagination_keywords, descriptive_words, creativity_score

    comprehension = calculate_comprehension_metrics(story_transcript)
    # - comprehension_indicators, inference_indicators, comprehension_score

    # 3. Get LLM analysis (Claude)
    llm_analysis = compute_metrics_with_llm(intro_transcript, story_transcript)

    # 4. Generate parent-friendly summary
    summary = generate_parent_summary(vocabulary, engagement, creativity, comprehension)

    return {
        "vocabulary": vocabulary,
        "engagement": engagement,
        "creativity": creativity,
        "comprehension": comprehension,
        "llm_analysis": llm_analysis,
        "summary": summary
    }
```

**story_processing.py - `compute_metrics_with_llm()` (Claude API):**
```python
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

prompt = f"""You are an expert in child language development.
Analyze this conversation...

INTRO CONVERSATION:
{intro_text}

STORY CONVERSATION:
{story_text}

Return JSON with: language_complexity, emotional_expression,
social_awareness, narrative_skills, overall_assessment
"""

message = client.messages.create(
    model="claude-3-haiku-20240307",
    max_tokens=500,
    messages=[{"role": "user", "content": prompt}]
)

llm_metrics = json.loads(message.content[0].text)
```

**Claude API Call:**
| Call | Method | Endpoint |
|------|--------|----------|
| Create Message | SDK | `messages.create(model, messages)` |

---

### Phase 10: Display Parent Summary

**Frontend receives metrics and renders:**
```javascript
renderMetrics(metrics)
// Displays:
// - Overall Score (0-10)
// - Vocabulary Score
// - Creativity Score
// - Engagement Score
// - Session Highlights
// - Encouragement message
// - LLM Analysis insights
```

---

### Phase 11: Reset (New Adventure)

**User Action:** Clicks "New Adventure" button

**Frontend (app.js):**
```javascript
resetSession()
├── disconnectFromElevenLabs()  // Close any open connections
└── apiCall('/reset', 'POST')
```

**Backend (server.py) - `/reset`:**
```python
# 1. Delete the dynamically created story agent (cleanup)
if session_data["story_agent_id"]:
    requests.delete(
        f"{ELEVENLABS_BASE_URL}/convai/agents/{session_data['story_agent_id']}",
        headers=elevenlabs_headers()
    )

# 2. Clear all session data
session_data = {
    "intro_conversation_id": None,
    "story_agent_id": None,
    "story_conversation_id": None,
    "intro_transcript": None,
    "story_transcript": None,
}

return {"success": True, "message": "Session reset"}
```

**ElevenLabs API Call:**
| Call | Method | Endpoint |
|------|--------|----------|
| Delete Agent | DELETE | `/v1/convai/agents/{agent_id}` |

---

## API Endpoints Summary

### Backend Endpoints

| Endpoint | Method | Purpose | ElevenLabs API Calls |
|----------|--------|---------|----------------------|
| `/` | GET | Serve frontend index.html | None |
| `/<path>` | GET | Serve frontend static files | None |
| `/start_intro` | POST | Get signed URL for intro agent | GET agents, GET signed_url |
| `/set_intro_conversation_id` | POST | Store conversation ID | None |
| `/get_intro_transcript` | GET | Fetch intro transcript | GET conversations |
| `/create_story_agent` | POST | Create personalized story agent | POST agents/create |
| `/start_story` | POST | Get signed URL for story agent | GET signed_url |
| `/set_story_conversation_id` | POST | Store conversation ID | None |
| `/get_story_transcript` | GET | Fetch story transcript | GET conversations |
| `/metrics` | GET | Compute and return metrics | None (uses Claude) |
| `/reset` | POST | Clean up and reset session | DELETE agents |
| `/health` | GET | Health check | None |

### External API Calls

| Service | HTTP Method | Endpoint | When Called |
|---------|-------------|----------|-------------|
| ElevenLabs | GET | `/v1/convai/agents/{agent_id}` | Start intro (verify agent) |
| ElevenLabs | POST | `/v1/convai/agents/create` | Create story agent |
| ElevenLabs | DELETE | `/v1/convai/agents/{agent_id}` | Reset session |
| ElevenLabs | GET | `/v1/convai/conversation/get_signed_url` | Start intro, Start story |
| ElevenLabs | GET | `/v1/convai/conversations/{id}` | Get transcripts |
| Anthropic | POST | `/v1/messages` | Compute metrics |

---

## Data Flow Diagram

```
                           ┌─────────────────────────────────────────┐
                           │              SESSION DATA               │
                           │                                         │
                           │  intro_conversation_id: "conv_123"      │
                           │  story_agent_id: "agent_456"            │
                           │  story_conversation_id: "conv_789"      │
                           │  intro_transcript: {...}                │
                           │  story_transcript: {...}                │
                           │                                         │
                           └─────────────────────────────────────────┘
                                            ▲
                                            │
    ┌───────────────────────────────────────┼───────────────────────────────────────┐
    │                                       │                                       │
    ▼                                       ▼                                       ▼
┌─────────┐                           ┌─────────┐                           ┌─────────┐
│  Phase  │                           │  Phase  │                           │  Phase  │
│  2-4    │                           │  5-8    │                           │  9-10   │
│         │                           │         │                           │         │
│  INTRO  │ ──────────────────────►   │  STORY  │ ──────────────────────►   │ METRICS │
│         │     intro_transcript      │         │     story_transcript      │         │
└─────────┘                           └─────────┘                           └─────────┘
    │                                       │                                    │
    │                                       │                                    │
    ▼                                       ▼                                    ▼
┌─────────────┐                       ┌─────────────┐                    ┌─────────────┐
│ ElevenLabs  │                       │ ElevenLabs  │                    │   Claude    │
│ Intro Agent │                       │ Story Agent │                    │   Haiku     │
│ (manual)    │                       │ (dynamic)   │                    │             │
└─────────────┘                       └─────────────┘                    └─────────────┘
```

---

## Error Handling

Each phase includes error handling:

1. **API Errors**: Caught and returned as `{"success": false, "error": "message"}`
2. **WebSocket Errors**: Displayed in status indicator, logged to console
3. **Microphone Denied**: Shows "Microphone access denied" error
4. **Missing Data**: Returns 400 error with descriptive message
5. **Claude API Failure**: Falls back to placeholder metrics
