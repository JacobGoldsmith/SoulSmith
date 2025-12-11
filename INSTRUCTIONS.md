# SoulSmith - Setup & Implementation Guide

## Quick Start

### Prerequisites
- Python 3.8+
- ElevenLabs account with API key and Conversational AI access
- Anthropic API key (for metrics analysis)
- Modern web browser with microphone access

### 1. Environment Setup

```bash
cd /Users/samgoldberg/Documents/Projects/SoulSmith

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` with your API keys:

```
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ADVENTURE_AGENT_ID=your_agent_id_from_elevenlabs
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 3. Start the Server

```bash
python server.py
```

Server runs at: `http://localhost:5000`

---

## ElevenLabs Agent Setup

### Create the Adventure Agent

1. Go to [ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai)
2. Create a new agent with these settings:

**Name**: SoulSmith Adventure Agent

**First Message**:
```
Hi there, young adventurer! I'm your Story Guide. What's your name?
```

**System Prompt**:
```
You are a friendly, warm storyteller for children aged 4-8.
Your conversation has two phases:

PHASE 1 - INTRO (do this first):
1. Greet the child warmly and ask their name
2. Ask what their favorite animal is
3. Ask what their favorite color is
4. Ask what kind of adventure they want (magical forest, space, underwater, etc.)
Keep your responses short and enthusiastic. Use simple language.

PHASE 2 - STORY (after gathering preferences):
After learning about the child, transition into telling them a personalized interactive story:
- Create a story featuring their favorite animal, color, and adventure type
- Make the child the hero of the story
- Use simple, age-appropriate language
- Pause occasionally to ask "What do you think happens next?"
- Keep it positive, magical, and encouraging
- The story should last about 3-5 minutes

When the story reaches a satisfying conclusion, use the end_call tool to end the conversation.
```

**Voice**: Choose a friendly, warm voice appropriate for children

**Tools**: Enable the `end_call` system tool (allows agent to end the conversation)

3. Copy the **Agent ID** and add it to your `.env` file as `ADVENTURE_AGENT_ID`

---

## App Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER FLOW                                │
└─────────────────────────────────────────────────────────────────┘

[Welcome Screen]
      │
      ▼ Click "Start Adventure"
[POST /start_adventure] ──► Get WebSocket signed URL
      │
      ▼
[Adventure Screen] ◄──► WebSocket ◄──► ElevenLabs Agent
      │                              (Asks intro questions,
      │                               then tells personalized story)
      │
      ▼ Agent calls end_call OR user clicks "End Adventure"
[GET /get_transcript] ──► Fetch conversation transcript
      │
      ▼
[GET /metrics] ──► Claude analyzes transcript for metrics
      │
      ▼
[Parent Summary Screen] ──► Display vocabulary, creativity,
                            engagement, comprehension scores
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Serve frontend |
| `/start_adventure` | POST | Get signed URL for agent |
| `/set_conversation_id` | POST | Store conversation ID |
| `/get_transcript` | GET | Fetch conversation transcript |
| `/metrics` | GET | Get Claude-analyzed metrics |
| `/reset` | POST | Reset session |
| `/health` | GET | Health check |
| `/debug/agents` | GET | Check agent configuration |

---

## File Structure

```
SoulSmith/
├── server.py              # Flask backend - API endpoints
├── story_processing.py    # Metrics computation & Claude integration
├── requirements.txt       # Python dependencies
├── .env.example           # Environment template
├── .env                   # Your actual environment variables
├── INSTRUCTIONS.md        # This file
├── FLOW.md               # Detailed technical flow
├── README.md             # Project overview
└── frontend/
    ├── index.html         # UI structure (4 screens)
    ├── styles.css         # Styling (magical theme)
    └── app.js             # Frontend logic & WebSocket handling
```

---

## Troubleshooting

### "Missing required dynamic variables" Error
Your ElevenLabs agent's first message contains a variable like `{{child_name}}`. Remove any `{{variable}}` placeholders from the agent's first message in the ElevenLabs dashboard.

### Conversation Ends Immediately
Check the browser console. If you see WebSocket close code 1008, it's usually the dynamic variables issue above.

### No Audio from Agent
- Check browser console for errors
- Ensure microphone permissions are granted
- Verify the agent has a voice configured in ElevenLabs

### Microphone Access Issues
- Use `localhost` (not `127.0.0.1`) for microphone permissions
- Check browser permissions settings

### Agent Doesn't Ask Questions
Update your agent's System Prompt in ElevenLabs to include the intro questions phase.

---

## Development

### Debug Mode
In `frontend/app.js`:
- `DEBUG = true` - Enables detailed console logging
- `SAVE_AUDIO_FILES = true` - Downloads WAV files of audio for debugging

### Testing Agent Configuration
Visit `http://localhost:5000/debug/agents` to verify your ElevenLabs agent is configured correctly.
