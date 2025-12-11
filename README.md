# SoulSmith

A dynamic digital story experience for children that questions, listens, and engages kids in personalized interactive adventures, while measuring and communicating progress to parents.

## Features

- **Voice-Powered Storytelling**: Children interact with an AI storyteller using natural speech via ElevenLabs Conversational AI
- **Personalized Adventures**: The agent asks about the child's interests and creates custom stories
- **Parent Metrics Dashboard**: After each session, parents receive metrics on vocabulary, creativity, engagement, and comprehension
- **Claude-Powered Analysis**: Uses Anthropic's Claude API for sophisticated language development insights

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend       │────▶│   Flask Server   │────▶│  ElevenLabs API  │
│   (HTML/JS)      │     │   (Python)       │     │  (Voice AI)      │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                │
                                ▼
                         ┌──────────────────┐
                         │  Anthropic API   │
                         │  (Metrics)       │
                         └──────────────────┘
```

### Flow

1. **Welcome Screen**: User clicks "Start Adventure"
2. **Adventure**: Single voice conversation with the AI agent
   - Agent asks intro questions (name, interests, favorite things)
   - Agent transitions into a personalized interactive story
   - Conversation ends when agent calls `end_call` or user clicks "End Adventure"
3. **Metrics**: Transcript is analyzed by Claude to generate parent-friendly metrics
4. **Parent Summary**: Displays vocabulary, creativity, engagement, and comprehension scores

## Setup

### Prerequisites

- Python 3.8+
- ElevenLabs account with Conversational AI access
- Anthropic API key (for metrics analysis)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/SoulSmith.git
   cd SoulSmith
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Copy the environment template and fill in your keys:
   ```bash
   cp .env.example .env
   ```

5. Configure your `.env` file:
   ```
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   ADVENTURE_AGENT_ID=your_agent_id_from_elevenlabs
   ANTHROPIC_API_KEY=your_anthropic_api_key
   ```

### ElevenLabs Agent Setup

1. Go to [ElevenLabs Conversational AI](https://elevenlabs.io/conversational-ai)
2. Create a new agent with:
   - A friendly, child-appropriate voice
   - A first message that greets the child and asks their name
   - System prompt that instructs the agent to:
     - Ask intro questions (name, age, favorite things)
     - Transition into a personalized story
     - Use the `end_call` tool when the story concludes
3. Copy the Agent ID to your `.env` file

### Running the Server

```bash
python server.py
```

The app will be available at `http://localhost:5000`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/start_adventure` | POST | Get signed URL to start voice session |
| `/set_conversation_id` | POST | Store conversation ID for transcript retrieval |
| `/get_transcript` | GET | Retrieve conversation transcript |
| `/metrics` | GET | Get Claude-analyzed metrics for the session |
| `/reset` | POST | Reset session data |
| `/health` | GET | Health check |
| `/debug/agents` | GET | Check agent configuration |

## Project Structure

```
SoulSmith/
├── server.py              # Flask backend server
├── story_processing.py    # Metrics computation and Claude integration
├── frontend/
│   ├── index.html         # Main HTML structure
│   ├── app.js             # Frontend JavaScript (WebSocket handling)
│   └── styles.css         # Styling
├── .env.example           # Environment variables template
├── requirements.txt       # Python dependencies
└── README.md
```

## Tech Stack

- **Backend**: Flask (Python)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Voice AI**: ElevenLabs Conversational AI (WebSocket)
- **Metrics AI**: Anthropic Claude API
- **Audio**: Web Audio API (16kHz PCM)

## Development

### Debug Mode

Set `DEBUG = true` in `frontend/app.js` to enable detailed console logging.

Set `SAVE_AUDIO_FILES = true` to automatically download WAV files of sent/received audio for debugging.

### Testing the Agent

Visit `/debug/agents` to verify your ElevenLabs agent is configured correctly.

## License

MIT
