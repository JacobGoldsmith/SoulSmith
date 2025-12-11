"""
SoulSmith Story Processing Module
Functions to compute metrics from transcripts and build story prompts.
"""

import re
from typing import Dict, List, Any


def build_story_prompt(intro_transcript: Dict) -> str:
    """
    Build a custom story prompt based on the child's intro conversation.
    Extracts key information like name, interests, and adventure preferences.
    """
    messages = intro_transcript.get("messages", [])

    # Extract user messages
    user_messages = [m["text"] for m in messages if m.get("role") == "user"]
    child_responses = "\n".join(user_messages)

    story_prompt = f"""You are a warm, engaging storyteller for children aged 4-8.
You are about to tell an interactive story based on what the child shared with you.

Here is what the child told you during the intro:
---
{child_responses}
---

STORYTELLING GUIDELINES:
1. Create a personalized adventure incorporating the child's interests and preferences
2. Use simple, age-appropriate language
3. Pause occasionally to ask the child questions like "What do you think happens next?"
4. Include the child as the hero of the story
5. Keep the story positive, magical, and encouraging
6. The story should last about 3-5 minutes when told aloud
7. End with a happy, satisfying conclusion

Begin the story with "Once upon a time..." and make it magical!
"""
    return story_prompt


def extract_user_text(transcript: Dict) -> str:
    """Extract all user (child) text from a transcript."""
    messages = transcript.get("messages", [])
    user_texts = [m["text"] for m in messages if m.get("role") == "user"]
    return " ".join(user_texts)


def count_words(text: str) -> int:
    """Count words in text."""
    words = text.split()
    return len(words)


def count_unique_words(text: str) -> int:
    """Count unique words in text (case-insensitive)."""
    words = text.lower().split()
    # Remove punctuation
    words = [re.sub(r'[^\w]', '', w) for w in words]
    words = [w for w in words if w]
    return len(set(words))


def calculate_vocabulary_metrics(text: str) -> Dict:
    """
    Calculate vocabulary-related metrics.
    """
    total_words = count_words(text)
    unique_words = count_unique_words(text)

    # Vocabulary diversity ratio
    diversity_ratio = unique_words / total_words if total_words > 0 else 0

    # Average word length
    words = text.split()
    avg_word_length = sum(len(w) for w in words) / len(words) if words else 0

    return {
        "total_words": total_words,
        "unique_words": unique_words,
        "diversity_ratio": round(diversity_ratio, 2),
        "avg_word_length": round(avg_word_length, 1),
    }


def calculate_engagement_metrics(transcript: Dict) -> Dict:
    """
    Calculate engagement-related metrics from the conversation flow.
    """
    messages = transcript.get("messages", [])

    user_messages = [m for m in messages if m.get("role") == "user"]
    agent_messages = [m for m in messages if m.get("role") == "agent"]

    # Count questions asked by child (ends with ?)
    questions_asked = sum(1 for m in user_messages if m["text"].strip().endswith("?"))

    # Average response length
    user_texts = [m["text"] for m in user_messages]
    avg_response_length = sum(len(t.split()) for t in user_texts) / len(user_texts) if user_texts else 0

    return {
        "total_exchanges": len(messages),
        "child_responses": len(user_messages),
        "questions_asked": questions_asked,
        "avg_response_words": round(avg_response_length, 1),
    }


def calculate_creativity_indicators(text: str) -> Dict:
    """
    Calculate creativity indicators from child's text.
    Uses simple heuristics - can be enhanced with LLM.
    """
    text_lower = text.lower()

    # Imagination keywords
    imagination_words = ["magic", "magical", "unicorn", "dragon", "fairy", "wizard",
                         "castle", "adventure", "imagine", "pretend", "flying", "superhero",
                         "princess", "knight", "treasure", "secret", "rainbow"]

    imagination_count = sum(1 for word in imagination_words if word in text_lower)

    # Descriptive words (adjectives commonly used by children)
    descriptive_words = ["big", "small", "beautiful", "scary", "funny", "happy", "sad",
                         "colorful", "sparkly", "giant", "tiny", "amazing", "wonderful"]

    descriptive_count = sum(1 for word in descriptive_words if word in text_lower)

    # Check for story elements
    has_characters = any(word in text_lower for word in ["friend", "monster", "animal", "pet", "person"])
    has_setting = any(word in text_lower for word in ["forest", "castle", "house", "school", "ocean", "sky", "mountain"])

    return {
        "imagination_keywords": imagination_count,
        "descriptive_words": descriptive_count,
        "includes_characters": has_characters,
        "includes_setting": has_setting,
        "creativity_score": min(10, imagination_count + descriptive_count + (2 if has_characters else 0) + (2 if has_setting else 0)),
    }


def calculate_comprehension_metrics(story_transcript: Dict) -> Dict:
    """
    Calculate comprehension and inference metrics from story interaction.
    """
    messages = story_transcript.get("messages", [])
    user_messages = [m["text"] for m in messages if m.get("role") == "user"]

    # Check for comprehension indicators
    comprehension_phrases = ["because", "so that", "that's why", "i think", "maybe"]
    inference_phrases = ["what if", "i wonder", "could be", "might be", "probably"]

    user_text = " ".join(user_messages).lower()

    comprehension_indicators = sum(1 for phrase in comprehension_phrases if phrase in user_text)
    inference_indicators = sum(1 for phrase in inference_phrases if phrase in user_text)

    # Check for relevant responses (responses that relate to story content)
    relevant_responses = len([m for m in user_messages if len(m.split()) > 2])

    return {
        "comprehension_indicators": comprehension_indicators,
        "inference_indicators": inference_indicators,
        "relevant_responses": relevant_responses,
        "comprehension_score": min(10, comprehension_indicators * 2 + inference_indicators * 2),
    }


def compute_metrics_with_llm(intro_transcript: Dict, story_transcript: Dict) -> Dict:
    """
    Use an LLM to compute more sophisticated metrics.

    TODO: Call OpenAI/Claude API with transcript to compute metrics

    Example API call structure:

    # TODO: Call OpenAI API
    # POST https://api.openai.com/v1/chat/completions
    # Headers: Authorization: Bearer {OPENAI_API_KEY}
    # Body: {
    #   "model": "gpt-4",
    #   "messages": [
    #     {"role": "system", "content": "You are an expert in child language development..."},
    #     {"role": "user", "content": f"Analyze this child's conversation: {transcript}"}
    #   ]
    # }

    # TODO: Alternatively, call Claude API
    # POST https://api.anthropic.com/v1/messages
    # Headers: x-api-key: {ANTHROPIC_API_KEY}
    # Body: {
    #   "model": "claude-3-sonnet-20240229",
    #   "messages": [
    #     {"role": "user", "content": f"Analyze this child's language..."}
    #   ]
    # }
    """

    # Placeholder LLM analysis results
    llm_metrics = {
        "language_complexity": "age-appropriate",
        "emotional_expression": "positive and engaged",
        "social_awareness": "developing well",
        "narrative_skills": "shows creativity",
        "overall_assessment": "The child demonstrates healthy language development with good imagination and engagement.",
    }

    return llm_metrics


def compute_metrics(intro_transcript: Dict, story_transcript: Dict) -> Dict:
    """
    Main function to compute all metrics from transcripts.
    Combines rule-based metrics with optional LLM analysis.
    """
    # Extract child's text from both transcripts
    intro_text = extract_user_text(intro_transcript) if intro_transcript else ""
    story_text = extract_user_text(story_transcript)
    combined_text = intro_text + " " + story_text

    # Calculate all metric categories
    vocabulary = calculate_vocabulary_metrics(combined_text)
    engagement = calculate_engagement_metrics(story_transcript)
    creativity = calculate_creativity_indicators(combined_text)
    comprehension = calculate_comprehension_metrics(story_transcript)

    # Optional: Get LLM-based analysis
    llm_analysis = compute_metrics_with_llm(intro_transcript, story_transcript)

    # Compile summary
    summary = generate_parent_summary(vocabulary, engagement, creativity, comprehension)

    return {
        "vocabulary": vocabulary,
        "engagement": engagement,
        "creativity": creativity,
        "comprehension": comprehension,
        "llm_analysis": llm_analysis,
        "summary": summary,
    }


def generate_parent_summary(vocabulary: Dict, engagement: Dict, creativity: Dict, comprehension: Dict) -> Dict:
    """
    Generate a parent-friendly summary of the metrics.
    """
    # Calculate overall scores
    vocab_score = min(10, vocabulary["diversity_ratio"] * 10 + vocabulary["unique_words"] / 5)
    engage_score = min(10, engagement["child_responses"] + engagement["questions_asked"] * 2)
    create_score = creativity["creativity_score"]
    compreh_score = comprehension["comprehension_score"]

    overall_score = (vocab_score + engage_score + create_score + compreh_score) / 4

    return {
        "overall_score": round(overall_score, 1),
        "vocabulary_score": round(vocab_score, 1),
        "engagement_score": round(engage_score, 1),
        "creativity_score": round(create_score, 1),
        "comprehension_score": round(compreh_score, 1),
        "highlights": [
            f"Used {vocabulary['unique_words']} unique words",
            f"Asked {engagement['questions_asked']} questions during the story",
            f"Showed {creativity['imagination_keywords']} imaginative ideas",
        ],
        "encouragement": "Great job exploring stories together! Keep reading and imagining.",
    }
