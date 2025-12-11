"""
SoulSmith Backend Server
A local hackathon prototype for interactive children's story experiences.
Uses Flask to orchestrate ElevenLabs agent + WebRTC + transcript calls.
"""

import os
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from story_processing import compute_metrics, build_story_prompt

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# In-memory storage for session data (no persistent DB)
session_data = {
    "intro_conversation_id": None,
    "story_agent_id": None,
    "story_conversation_id": None,
    "intro_transcript": None,
    "story_transcript": None,
}

# Configuration - Loaded from .env file
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
INTRO_AGENT_ID = os.getenv("INTRO_AGENT_ID")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")


@app.route("/start_intro", methods=["POST"])
def start_intro():
    """
    Start the intro agent session.
    Returns WebRTC config for the frontend to connect.
    """
    # TODO: Call ElevenLabs "GET AGENT" API for the intro agent
    # GET https://api.elevenlabs.io/v1/convai/agents/{INTRO_AGENT_ID}
    # Headers: xi-api-key: {ELEVENLABS_API_KEY}

    # TODO: Call ElevenLabs "GET WEBRTC" API to start voice session
    # POST https://api.elevenlabs.io/v1/convai/conversation/get_signed_url
    # Headers: xi-api-key: {ELEVENLABS_API_KEY}
    # Body: { "agent_id": INTRO_AGENT_ID }

    # Placeholder response structure
    webrtc_config = {
        "signed_url": "wss://placeholder.elevenlabs.io/...",
        "conversation_id": "placeholder_conversation_id",
    }

    # Store conversation ID for later transcript retrieval
    session_data["intro_conversation_id"] = webrtc_config.get("conversation_id")

    return jsonify({
        "success": True,
        "webrtc_config": webrtc_config,
        "agent_id": INTRO_AGENT_ID,
    })


@app.route("/get_intro_transcript", methods=["GET"])
def get_intro_transcript():
    """
    Get the transcript from the intro conversation.
    """
    conversation_id = session_data.get("intro_conversation_id")

    if not conversation_id:
        return jsonify({"success": False, "error": "No intro conversation found"}), 400

    # TODO: Call ElevenLabs "GET CONVERSATION" API
    # GET https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}
    # Headers: xi-api-key: {ELEVENLABS_API_KEY}

    # Placeholder transcript structure
    transcript = {
        "conversation_id": conversation_id,
        "messages": [
            {"role": "agent", "text": "Hi! What's your name?"},
            {"role": "user", "text": "My name is Emma!"},
            {"role": "agent", "text": "Nice to meet you Emma! What kind of adventure do you want today?"},
            {"role": "user", "text": "I want to go to a magical forest with unicorns!"},
        ]
    }

    # Store transcript for story generation
    session_data["intro_transcript"] = transcript

    return jsonify({
        "success": True,
        "transcript": transcript,
    })


@app.route("/create_story_agent", methods=["POST"])
def create_story_agent():
    """
    Create a new story agent using the intro transcript.
    The agent will tell a personalized story based on the child's responses.
    """
    transcript = session_data.get("intro_transcript")

    if not transcript:
        return jsonify({"success": False, "error": "No intro transcript found"}), 400

    # Build custom story prompt from transcript
    story_prompt = build_story_prompt(transcript)

    # TODO: Call ElevenLabs "CREATE AGENT" API with the custom story prompt
    # POST https://api.elevenlabs.io/v1/convai/agents/create
    # Headers: xi-api-key: {ELEVENLABS_API_KEY}
    # Body: {
    #   "name": "SoulSmith Story Agent",
    #   "conversation_config": {
    #     "agent": {
    #       "prompt": {
    #         "prompt": story_prompt
    #       },
    #       "first_message": "Once upon a time...",
    #       "language": "en"
    #     },
    #     "tts": {
    #       "voice_id": "YOUR_VOICE_ID"
    #     }
    #   }
    # }

    # Placeholder new agent ID
    new_agent_id = "placeholder_story_agent_id"
    session_data["story_agent_id"] = new_agent_id

    return jsonify({
        "success": True,
        "story_agent_id": new_agent_id,
        "prompt_preview": story_prompt[:200] + "...",
    })


@app.route("/start_story", methods=["POST"])
def start_story():
    """
    Start the story agent session.
    Returns WebRTC config for the frontend to connect.
    """
    story_agent_id = session_data.get("story_agent_id")

    if not story_agent_id:
        return jsonify({"success": False, "error": "No story agent created"}), 400

    # TODO: Call ElevenLabs "GET WEBRTC" API for this new story agent
    # POST https://api.elevenlabs.io/v1/convai/conversation/get_signed_url
    # Headers: xi-api-key: {ELEVENLABS_API_KEY}
    # Body: { "agent_id": story_agent_id }

    # Placeholder response structure
    webrtc_config = {
        "signed_url": "wss://placeholder.elevenlabs.io/...",
        "conversation_id": "placeholder_story_conversation_id",
    }

    session_data["story_conversation_id"] = webrtc_config.get("conversation_id")

    return jsonify({
        "success": True,
        "webrtc_config": webrtc_config,
        "agent_id": story_agent_id,
    })


@app.route("/get_story_transcript", methods=["GET"])
def get_story_transcript():
    """
    Get the transcript from the story conversation.
    """
    conversation_id = session_data.get("story_conversation_id")

    if not conversation_id:
        return jsonify({"success": False, "error": "No story conversation found"}), 400

    # TODO: Call ElevenLabs "GET CONVERSATION" API for story session
    # GET https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}
    # Headers: xi-api-key: {ELEVENLABS_API_KEY}

    # Placeholder transcript structure
    transcript = {
        "conversation_id": conversation_id,
        "messages": [
            {"role": "agent", "text": "Once upon a time, in a magical forest..."},
            {"role": "user", "text": "What happened next?"},
            {"role": "agent", "text": "A beautiful unicorn appeared!"},
            {"role": "user", "text": "Wow! Was it friendly?"},
        ]
    }

    session_data["story_transcript"] = transcript

    return jsonify({
        "success": True,
        "transcript": transcript,
    })


@app.route("/metrics", methods=["GET"])
def get_metrics():
    """
    Compute and return metrics from the story transcript.
    """
    intro_transcript = session_data.get("intro_transcript")
    story_transcript = session_data.get("story_transcript")

    if not story_transcript:
        return jsonify({"success": False, "error": "No story transcript found"}), 400

    # Compute metrics using story_processing module
    metrics = compute_metrics(intro_transcript, story_transcript)

    return jsonify({
        "success": True,
        "metrics": metrics,
    })


@app.route("/reset", methods=["POST"])
def reset_session():
    """
    Reset all session data for a new adventure.
    """
    global session_data
    session_data = {
        "intro_conversation_id": None,
        "story_agent_id": None,
        "story_conversation_id": None,
        "intro_transcript": None,
        "story_transcript": None,
    }
    return jsonify({"success": True, "message": "Session reset"})


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "app": "SoulSmith"})


if __name__ == "__main__":
    print("Starting SoulSmith server...")
    print("Make sure to set ELEVENLABS_API_KEY and INTRO_AGENT_ID")
    app.run(debug=True, port=5000)
