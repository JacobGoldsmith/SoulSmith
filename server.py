"""
SoulSmith Backend Server
"""

import os
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from story_processing import compute_metrics, build_story_prompt

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
INTRO_AGENT_ID = os.getenv("INTRO_AGENT_ID")
ADVENTURE_AGENT_ID = os.getenv("ADVENTURE_AGENT_ID")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

# Session data
session_data = {
    "intro_conversation_id": None,
    "story_agent_id": None,
    "story_conversation_id": None,
    "intro_transcript": None,
    "story_transcript": None,
}

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"


def elevenlabs_headers():
    return {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}


# Serve frontend
@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('frontend', path)


# API endpoints
@app.route("/start_intro", methods=["POST"])
def start_intro():
    try:
        # Get agent info (optional verification)
        agent_resp = requests.get(
            f"{ELEVENLABS_BASE_URL}/convai/agents/{INTRO_AGENT_ID}",
            headers=elevenlabs_headers()
        )
        if agent_resp.status_code == 200:
            agent_data = agent_resp.json()
            print(f"Found intro agent: {agent_data.get('name', 'Unknown')}")
        else:
            print(f"Agent lookup failed: {agent_resp.status_code} - {agent_resp.text}")

        # Get signed URL for WebRTC
        token_resp = requests.get(
            f"{ELEVENLABS_BASE_URL}/convai/conversation/get_signed_url?agent_id={INTRO_AGENT_ID}",
            headers=elevenlabs_headers()
        )

        if token_resp.status_code != 200:
            return jsonify({"success": False, "error": f"Failed to get signed URL: {token_resp.text}"}), 500

        token_data = token_resp.json()

        return jsonify({
            "success": True,
            "webrtc_config": {"signed_url": token_data.get("signed_url")},
            "agent_id": INTRO_AGENT_ID,
        })
    except Exception as e:
        print(f"Error starting intro: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/set_intro_conversation_id", methods=["POST"])
def set_intro_conversation_id():
    data = request.get_json()
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return jsonify({"success": False, "error": "No conversation_id provided"}), 400
    session_data["intro_conversation_id"] = conversation_id
    return jsonify({"success": True})


@app.route("/get_intro_transcript", methods=["GET"])
def get_intro_transcript():
    conversation_id = session_data.get("intro_conversation_id")
    if not conversation_id:
        return jsonify({"success": False, "error": "No intro conversation found"}), 400

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
        session_data["intro_transcript"] = transcript
        return jsonify({"success": True, "transcript": transcript})
    except Exception as e:
        print(f"Error getting intro transcript: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/create_story_agent", methods=["POST"])
def create_story_agent():
    """Use the pre-configured adventure agent instead of creating a new one."""
    transcript = session_data.get("intro_transcript")

    # Build prompt for logging/debugging purposes
    story_prompt = build_story_prompt(transcript) if transcript else "No transcript available"

    # Use the pre-configured adventure agent
    session_data["story_agent_id"] = ADVENTURE_AGENT_ID

    return jsonify({
        "success": True,
        "story_agent_id": ADVENTURE_AGENT_ID,
        "prompt_preview": story_prompt[:200] + "...",
    })


@app.route("/start_story", methods=["POST"])
def start_story():
    story_agent_id = session_data.get("story_agent_id")
    if not story_agent_id:
        return jsonify({"success": False, "error": "No story agent created"}), 400

    try:
        # First, verify the agent exists and log its config
        agent_resp = requests.get(
            f"{ELEVENLABS_BASE_URL}/convai/agents/{story_agent_id}",
            headers=elevenlabs_headers()
        )
        if agent_resp.status_code == 200:
            agent_data = agent_resp.json()
            print(f"Adventure agent found: {agent_data.get('name', 'Unknown')}")
            print(f"Agent config: {agent_data.get('conversation_config', {})}")
        else:
            print(f"Warning: Could not fetch agent info: {agent_resp.status_code} - {agent_resp.text}")

        # Get signed URL
        token_resp = requests.get(
            f"{ELEVENLABS_BASE_URL}/convai/conversation/get_signed_url?agent_id={story_agent_id}",
            headers=elevenlabs_headers()
        )

        if token_resp.status_code != 200:
            return jsonify({"success": False, "error": f"Failed to get signed URL: {token_resp.text}"}), 500

        token_data = token_resp.json()
        print(f"Got signed URL for agent: {story_agent_id}")

        return jsonify({
            "success": True,
            "webrtc_config": {"signed_url": token_data.get("signed_url")},
            "agent_id": story_agent_id,
        })
    except Exception as e:
        print(f"Error starting story: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/set_story_conversation_id", methods=["POST"])
def set_story_conversation_id():
    data = request.get_json()
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return jsonify({"success": False, "error": "No conversation_id provided"}), 400
    session_data["story_conversation_id"] = conversation_id
    return jsonify({"success": True})


@app.route("/get_story_transcript", methods=["GET"])
def get_story_transcript():
    conversation_id = session_data.get("story_conversation_id")
    if not conversation_id:
        return jsonify({"success": False, "error": "No story conversation found"}), 400

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
        session_data["story_transcript"] = transcript
        return jsonify({"success": True, "transcript": transcript})
    except Exception as e:
        print(f"Error getting story transcript: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/metrics", methods=["GET"])
def get_metrics():
    intro_transcript = session_data.get("intro_transcript")
    story_transcript = session_data.get("story_transcript")
    if not story_transcript:
        return jsonify({"success": False, "error": "No story transcript found"}), 400

    metrics = compute_metrics(intro_transcript, story_transcript)
    return jsonify({"success": True, "metrics": metrics})


@app.route("/reset", methods=["POST"])
def reset_session():
    global session_data
    # No need to delete agents - we're using pre-configured agents now
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
    return jsonify({"status": "healthy", "app": "SoulSmith"})


@app.route("/debug/agents", methods=["GET"])
def debug_agents():
    """Debug endpoint to check agent configurations."""
    results = {}

    # Check intro agent
    if INTRO_AGENT_ID:
        try:
            resp = requests.get(
                f"{ELEVENLABS_BASE_URL}/convai/agents/{INTRO_AGENT_ID}",
                headers=elevenlabs_headers()
            )
            if resp.status_code == 200:
                data = resp.json()
                results["intro_agent"] = {
                    "id": INTRO_AGENT_ID,
                    "name": data.get("name"),
                    "first_message": data.get("conversation_config", {}).get("agent", {}).get("first_message"),
                    "language": data.get("conversation_config", {}).get("agent", {}).get("language"),
                }
            else:
                results["intro_agent"] = {"error": f"{resp.status_code}: {resp.text}"}
        except Exception as e:
            results["intro_agent"] = {"error": str(e)}

    # Check adventure agent
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

    return jsonify(results)


if __name__ == "__main__":
    print("Starting SoulSmith server...")
    print(f"ElevenLabs API Key: {'configured' if ELEVENLABS_API_KEY else 'MISSING'}")
    print(f"Intro Agent ID: {'configured' if INTRO_AGENT_ID else 'MISSING'}")
    print(f"Adventure Agent ID: {'configured' if ADVENTURE_AGENT_ID else 'MISSING'}")
    app.run(debug=True, host='0.0.0.0', port=5000)
