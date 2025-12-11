"""
SoulSmith Backend Server
Single agent flow - one conversation for intro + story
"""

import os
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from story_processing import compute_metrics

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ADVENTURE_AGENT_ID = os.getenv("ADVENTURE_AGENT_ID")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

# Session data - simplified for single agent flow
session_data = {
    "conversation_id": None,
    "transcript": None,
}


def elevenlabs_headers():
    return {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}


# Serve frontend
@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('frontend', path)


# ============================================
# API ENDPOINTS - Single Agent Flow
# ============================================

@app.route("/start_adventure", methods=["POST"])
def start_adventure():
    """Start the adventure session with the single agent."""
    try:
        if not ADVENTURE_AGENT_ID:
            return jsonify({"success": False, "error": "ADVENTURE_AGENT_ID not configured"}), 500

        # Verify agent exists
        agent_resp = requests.get(
            f"{ELEVENLABS_BASE_URL}/convai/agents/{ADVENTURE_AGENT_ID}",
            headers=elevenlabs_headers()
        )
        if agent_resp.status_code == 200:
            agent_data = agent_resp.json()
            print(f"Adventure agent found: {agent_data.get('name', 'Unknown')}")
        else:
            print(f"Agent lookup failed: {agent_resp.status_code} - {agent_resp.text}")

        # Get signed URL for WebSocket connection
        token_resp = requests.get(
            f"{ELEVENLABS_BASE_URL}/convai/conversation/get_signed_url?agent_id={ADVENTURE_AGENT_ID}",
            headers=elevenlabs_headers()
        )

        if token_resp.status_code != 200:
            return jsonify({"success": False, "error": f"Failed to get signed URL: {token_resp.text}"}), 500

        token_data = token_resp.json()

        return jsonify({
            "success": True,
            "webrtc_config": {"signed_url": token_data.get("signed_url")},
            "agent_id": ADVENTURE_AGENT_ID,
        })

    except Exception as e:
        print(f"Error starting adventure: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/set_conversation_id", methods=["POST"])
def set_conversation_id():
    """Store the conversation ID for transcript retrieval."""
    data = request.get_json()
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return jsonify({"success": False, "error": "No conversation_id provided"}), 400

    session_data["conversation_id"] = conversation_id
    print(f"Conversation ID set: {conversation_id}")
    return jsonify({"success": True})


@app.route("/get_transcript", methods=["GET"])
def get_transcript():
    """Get the transcript from the conversation."""
    conversation_id = session_data.get("conversation_id")
    if not conversation_id:
        return jsonify({"success": False, "error": "No conversation found"}), 400

    try:
        conv_resp = requests.get(
            f"{ELEVENLABS_BASE_URL}/convai/conversations/{conversation_id}",
            headers=elevenlabs_headers()
        )

        if conv_resp.status_code != 200:
            return jsonify({"success": False, "error": f"Failed to get conversation: {conv_resp.text}"}), 500

        conv_data = conv_resp.json()

        messages = []
        for entry in conv_data.get("transcript", []):
            messages.append({
                "role": entry.get("role"),
                "text": entry.get("message")
            })

        transcript = {"conversation_id": conversation_id, "messages": messages}
        session_data["transcript"] = transcript

        print(f"Transcript retrieved: {len(messages)} messages")
        return jsonify({"success": True, "transcript": transcript})

    except Exception as e:
        print(f"Error getting transcript: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/metrics", methods=["GET"])
def get_metrics():
    """Compute metrics from the conversation transcript using Claude."""
    transcript = session_data.get("transcript")
    if not transcript:
        return jsonify({"success": False, "error": "No transcript found"}), 400

    # compute_metrics expects (intro_transcript, story_transcript) but we have a single transcript
    # Pass None for intro since we have a single combined conversation
    metrics = compute_metrics(None, transcript)
    return jsonify({"success": True, "metrics": metrics})


@app.route("/reset", methods=["POST"])
def reset_session():
    """Reset the session data."""
    global session_data
    session_data = {
        "conversation_id": None,
        "transcript": None,
    }
    print("Session reset")
    return jsonify({"success": True, "message": "Session reset"})


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "healthy", "app": "SoulSmith"})


@app.route("/debug/agents", methods=["GET"])
def debug_agents():
    """Debug endpoint to check agent configuration."""
    results = {}

    if ADVENTURE_AGENT_ID:
        try:
            resp = requests.get(
                f"{ELEVENLABS_BASE_URL}/convai/agents/{ADVENTURE_AGENT_ID}",
                headers=elevenlabs_headers()
            )
            if resp.status_code == 200:
                data = resp.json()
                results["adventure_agent"] = {
                    "id": ADVENTURE_AGENT_ID,
                    "name": data.get("name"),
                    "first_message": data.get("conversation_config", {}).get("agent", {}).get("first_message"),
                    "language": data.get("conversation_config", {}).get("agent", {}).get("language"),
                }
            else:
                results["adventure_agent"] = {"error": f"{resp.status_code}: {resp.text}"}
        except Exception as e:
            results["adventure_agent"] = {"error": str(e)}
    else:
        results["adventure_agent"] = {"error": "ADVENTURE_AGENT_ID not configured"}

    return jsonify(results)


if __name__ == "__main__":
    print("Starting SoulSmith server...")
    print(f"ElevenLabs API Key: {'configured' if ELEVENLABS_API_KEY else 'MISSING'}")
    print(f"Adventure Agent ID: {'configured' if ADVENTURE_AGENT_ID else 'MISSING'}")
    print(f"Anthropic API Key: {'configured' if ANTHROPIC_API_KEY else 'MISSING'}")
    app.run(debug=True, host='0.0.0.0', port=5000)
