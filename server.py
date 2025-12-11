"""
SoulSmith Backend Server
A local hackathon prototype for interactive children's story experiences.
Uses Flask to orchestrate ElevenLabs agent + WebRTC + transcript calls.
"""

import os
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from elevenlabs import ElevenLabs
from story_processing import compute_metrics, build_story_prompt

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type"]}})

# Configuration - Loaded from .env file
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
INTRO_AGENT_ID = os.getenv("INTRO_AGENT_ID")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Initialize ElevenLabs client
elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

# In-memory storage for session data (no persistent DB)
session_data = {
    "intro_conversation_id": None,
    "story_agent_id": None,
    "story_conversation_id": None,
    "intro_transcript": None,
    "story_transcript": None,
}

# Default voice ID for story agent (Rachel - friendly female voice)
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"


@app.route("/start_intro", methods=["POST"])
def start_intro():
    """
    Start the intro agent session.
    Returns WebRTC config for the frontend to connect.
    """
    try:
        # Verify the intro agent exists
        agent = elevenlabs_client.conversational_ai.agents.get(agent_id=INTRO_AGENT_ID)
        print(f"Found intro agent: {agent.name}")

        # Get WebRTC token for connection
        webrtc_response = elevenlabs_client.conversational_ai.conversations.get_webrtc_token(
            agent_id=INTRO_AGENT_ID
        )

        webrtc_config = {
            "token": webrtc_response.token,
        }

        return jsonify({
            "success": True,
            "webrtc_config": webrtc_config,
            "agent_id": INTRO_AGENT_ID,
        })

    except Exception as e:
        print(f"Error starting intro: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/set_intro_conversation_id", methods=["POST"])
def set_intro_conversation_id():
    """
    Store the conversation ID after WebRTC connection is established.
    Called by frontend once connected.
    """
    data = request.get_json()
    conversation_id = data.get("conversation_id")

    if not conversation_id:
        return jsonify({"success": False, "error": "No conversation_id provided"}), 400

    session_data["intro_conversation_id"] = conversation_id
    return jsonify({"success": True})


@app.route("/get_intro_transcript", methods=["GET"])
def get_intro_transcript():
    """
    Get the transcript from the intro conversation.
    """
    conversation_id = session_data.get("intro_conversation_id")

    if not conversation_id:
        return jsonify({"success": False, "error": "No intro conversation found"}), 400

    try:
        # Get conversation details including transcript
        conversation = elevenlabs_client.conversational_ai.conversations.get(
            conversation_id=conversation_id
        )

        # Format transcript from conversation
        messages = []
        if conversation.transcript:
            for entry in conversation.transcript:
                messages.append({
                    "role": entry.role,
                    "text": entry.message
                })

        transcript = {
            "conversation_id": conversation_id,
            "messages": messages
        }

        # Store transcript for story generation
        session_data["intro_transcript"] = transcript

        return jsonify({
            "success": True,
            "transcript": transcript,
        })

    except Exception as e:
        print(f"Error getting intro transcript: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


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

    try:
        # Create a new agent with the personalized story prompt
        new_agent = elevenlabs_client.conversational_ai.agents.create(
            name=f"SoulSmith Story Agent",
            conversation_config={
                "agent": {
                    "prompt": {
                        "prompt": story_prompt
                    },
                    "first_message": "Once upon a time, in a land not so far away...",
                    "language": "en"
                },
                "tts": {
                    "voice_id": DEFAULT_VOICE_ID
                }
            }
        )

        session_data["story_agent_id"] = new_agent.agent_id

        return jsonify({
            "success": True,
            "story_agent_id": new_agent.agent_id,
            "prompt_preview": story_prompt[:200] + "...",
        })

    except Exception as e:
        print(f"Error creating story agent: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/start_story", methods=["POST"])
def start_story():
    """
    Start the story agent session.
    Returns WebRTC config for the frontend to connect.
    """
    story_agent_id = session_data.get("story_agent_id")

    if not story_agent_id:
        return jsonify({"success": False, "error": "No story agent created"}), 400

    try:
        # Get WebRTC token for connection
        webrtc_response = elevenlabs_client.conversational_ai.conversations.get_webrtc_token(
            agent_id=story_agent_id
        )

        webrtc_config = {
            "token": webrtc_response.token,
        }

        return jsonify({
            "success": True,
            "webrtc_config": webrtc_config,
            "agent_id": story_agent_id,
        })

    except Exception as e:
        print(f"Error starting story: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/set_story_conversation_id", methods=["POST"])
def set_story_conversation_id():
    """
    Store the story conversation ID after WebRTC connection is established.
    Called by frontend once connected.
    """
    data = request.get_json()
    conversation_id = data.get("conversation_id")

    if not conversation_id:
        return jsonify({"success": False, "error": "No conversation_id provided"}), 400

    session_data["story_conversation_id"] = conversation_id
    return jsonify({"success": True})


@app.route("/get_story_transcript", methods=["GET"])
def get_story_transcript():
    """
    Get the transcript from the story conversation.
    """
    conversation_id = session_data.get("story_conversation_id")

    if not conversation_id:
        return jsonify({"success": False, "error": "No story conversation found"}), 400

    try:
        # Get conversation details including transcript
        conversation = elevenlabs_client.conversational_ai.conversations.get(
            conversation_id=conversation_id
        )

        # Format transcript from conversation
        messages = []
        if conversation.transcript:
            for entry in conversation.transcript:
                messages.append({
                    "role": entry.role,
                    "text": entry.message
                })

        transcript = {
            "conversation_id": conversation_id,
            "messages": messages
        }

        session_data["story_transcript"] = transcript

        return jsonify({
            "success": True,
            "transcript": transcript,
        })

    except Exception as e:
        print(f"Error getting story transcript: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


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

    # Optionally delete the dynamically created story agent
    story_agent_id = session_data.get("story_agent_id")
    if story_agent_id:
        try:
            elevenlabs_client.conversational_ai.agents.delete(agent_id=story_agent_id)
            print(f"Deleted story agent: {story_agent_id}")
        except Exception as e:
            print(f"Error deleting story agent: {e}")

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
    return jsonify({
        "status": "healthy",
        "app": "SoulSmith",
        "elevenlabs_configured": bool(ELEVENLABS_API_KEY),
        "intro_agent_configured": bool(INTRO_AGENT_ID),
    })


if __name__ == "__main__":
    print("Starting SoulSmith server...")
    print(f"ElevenLabs API Key: {'configured' if ELEVENLABS_API_KEY else 'MISSING'}")
    print(f"Intro Agent ID: {'configured' if INTRO_AGENT_ID else 'MISSING'}")
    app.run(debug=True, port=5000)
