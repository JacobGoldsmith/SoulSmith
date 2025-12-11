/**
 * SoulSmith Frontend Application
 * Interactive children's story experience
 */

// Configuration
const API_BASE_URL = 'http://localhost:5000';

// State management
const state = {
    currentScreen: 'welcome',
    introConversationId: null,
    storyAgentId: null,
    storyConversationId: null,
    introTranscript: null,
    storyTranscript: null,
    metrics: null,
    // WebRTC state
    peerConnection: null,
    dataChannel: null,
};

// DOM Elements
const screens = {
    welcome: document.getElementById('welcome-screen'),
    intro: document.getElementById('intro-screen'),
    transition: document.getElementById('transition-screen'),
    story: document.getElementById('story-screen'),
    parent: document.getElementById('parent-screen'),
};

const buttons = {
    startAdventure: document.getElementById('btn-start-adventure'),
    endIntro: document.getElementById('btn-end-intro'),
    endStory: document.getElementById('btn-end-story'),
    newAdventure: document.getElementById('btn-new-adventure'),
};

// Screen Navigation
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });
    screens[screenName].classList.add('active');
    state.currentScreen = screenName;
}

function updateStatus(elementId, message, statusClass = '') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = 'status-indicator';
        if (statusClass) {
            element.classList.add(statusClass);
        }
    }
}

function setVisualizerActive(visualizerId, active) {
    const visualizer = document.getElementById(visualizerId);
    if (visualizer) {
        if (active) {
            visualizer.classList.add('active');
        } else {
            visualizer.classList.remove('active');
        }
    }
}

// API Functions
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    return response.json();
}

// ============================================
// INTRO SESSION FUNCTIONS
// ============================================

async function startIntroSession() {
    console.log('Starting intro session...');
    showScreen('intro');
    updateStatus('intro-status', 'Connecting...', '');

    try {
        // Call backend to get WebRTC config
        const response = await apiCall('/start_intro', 'POST');

        if (!response.success) {
            throw new Error(response.error || 'Failed to start intro');
        }

        const { webrtc_config, agent_id } = response;
        state.introConversationId = webrtc_config.conversation_id;

        // TODO: Connect to ElevenLabs WebRTC using config from backend
        // The WebRTC connection would be established here using the signed_url
        //
        // Example WebRTC setup (to be implemented):
        //
        // const pc = new RTCPeerConnection();
        // state.peerConnection = pc;
        //
        // // Get user media (microphone)
        // const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // stream.getTracks().forEach(track => pc.addTrack(track, stream));
        //
        // // Connect to ElevenLabs WebSocket
        // const ws = new WebSocket(webrtc_config.signed_url);
        //
        // ws.onopen = () => {
        //     console.log('WebSocket connected');
        //     updateStatus('intro-status', 'Connected!', 'connected');
        //     setVisualizerActive('intro-visualizer', true);
        // };
        //
        // ws.onmessage = (event) => {
        //     // Handle incoming audio/messages from agent
        //     const data = JSON.parse(event.data);
        //     handleAgentMessage(data);
        // };
        //
        // // Handle ICE candidates, SDP exchange, etc.

        // For now, simulate connection
        setTimeout(() => {
            updateStatus('intro-status', 'Connected!', 'connected');
            setVisualizerActive('intro-visualizer', true);
        }, 1000);

        console.log('Intro session started with agent:', agent_id);

    } catch (error) {
        console.error('Error starting intro session:', error);
        updateStatus('intro-status', 'Connection failed', 'error');
    }
}

async function getIntroTranscript() {
    console.log('Getting intro transcript...');

    try {
        const response = await apiCall('/get_intro_transcript', 'GET');

        if (!response.success) {
            throw new Error(response.error || 'Failed to get transcript');
        }

        state.introTranscript = response.transcript;
        console.log('Intro transcript received:', state.introTranscript);
        return state.introTranscript;

    } catch (error) {
        console.error('Error getting intro transcript:', error);
        throw error;
    }
}

async function endIntroSession() {
    console.log('Ending intro session...');

    // TODO: Close WebRTC connection
    // if (state.peerConnection) {
    //     state.peerConnection.close();
    //     state.peerConnection = null;
    // }

    setVisualizerActive('intro-visualizer', false);
    updateStatus('intro-status', 'Session ended', '');

    // Show transition screen
    showScreen('transition');
    document.getElementById('transition-message').textContent = 'Getting your responses...';

    try {
        // Get the transcript
        await getIntroTranscript();

        document.getElementById('transition-message').textContent = 'Creating your personalized story...';

        // Create the story agent
        await createStoryAgent();

        document.getElementById('transition-message').textContent = 'Starting your adventure...';

        // Start the story session
        await startStorySession();

    } catch (error) {
        console.error('Error in transition:', error);
        document.getElementById('transition-message').textContent = 'Something went wrong. Please try again.';
    }
}

// ============================================
// STORY SESSION FUNCTIONS
// ============================================

async function createStoryAgent() {
    console.log('Creating story agent...');

    try {
        const response = await apiCall('/create_story_agent', 'POST', {
            transcript: state.introTranscript
        });

        if (!response.success) {
            throw new Error(response.error || 'Failed to create story agent');
        }

        state.storyAgentId = response.story_agent_id;
        console.log('Story agent created:', state.storyAgentId);
        console.log('Prompt preview:', response.prompt_preview);

        return state.storyAgentId;

    } catch (error) {
        console.error('Error creating story agent:', error);
        throw error;
    }
}

async function startStorySession() {
    console.log('Starting story session...');
    showScreen('story');
    updateStatus('story-status', 'Connecting...', '');

    try {
        const response = await apiCall('/start_story', 'POST');

        if (!response.success) {
            throw new Error(response.error || 'Failed to start story');
        }

        const { webrtc_config, agent_id } = response;
        state.storyConversationId = webrtc_config.conversation_id;

        // TODO: Connect to ElevenLabs WebRTC using config from backend
        // Similar to intro session setup:
        //
        // const pc = new RTCPeerConnection();
        // state.peerConnection = pc;
        //
        // // For story, we primarily receive audio (agent speaks)
        // // but child can still interact
        // const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // stream.getTracks().forEach(track => pc.addTrack(track, stream));
        //
        // const ws = new WebSocket(webrtc_config.signed_url);
        //
        // ws.onopen = () => {
        //     updateStatus('story-status', 'Story starting...', 'connected');
        //     setVisualizerActive('story-visualizer', true);
        // };
        //
        // // Set up audio playback for agent voice
        // pc.ontrack = (event) => {
        //     const audio = new Audio();
        //     audio.srcObject = event.streams[0];
        //     audio.play();
        // };

        // Simulate connection for now
        setTimeout(() => {
            updateStatus('story-status', 'Story in progress...', 'connected');
            setVisualizerActive('story-visualizer', true);
        }, 1000);

        console.log('Story session started with agent:', agent_id);

    } catch (error) {
        console.error('Error starting story session:', error);
        updateStatus('story-status', 'Connection failed', 'error');
    }
}

async function getStoryTranscript() {
    console.log('Getting story transcript...');

    try {
        const response = await apiCall('/get_story_transcript', 'GET');

        if (!response.success) {
            throw new Error(response.error || 'Failed to get transcript');
        }

        state.storyTranscript = response.transcript;
        console.log('Story transcript received:', state.storyTranscript);
        return state.storyTranscript;

    } catch (error) {
        console.error('Error getting story transcript:', error);
        throw error;
    }
}

async function endStorySession() {
    console.log('Ending story session...');

    // TODO: Close WebRTC connection
    // if (state.peerConnection) {
    //     state.peerConnection.close();
    //     state.peerConnection = null;
    // }

    setVisualizerActive('story-visualizer', false);
    updateStatus('story-status', 'Story ended', '');

    // Show transition
    showScreen('transition');
    document.getElementById('transition-message').textContent = 'Analyzing the adventure...';

    try {
        // Get transcript
        await getStoryTranscript();

        document.getElementById('transition-message').textContent = 'Preparing your summary...';

        // Get metrics
        await showParentSummary();

    } catch (error) {
        console.error('Error ending story:', error);
        document.getElementById('transition-message').textContent = 'Something went wrong.';
    }
}

// ============================================
// METRICS & PARENT SUMMARY
// ============================================

async function showParentSummary() {
    console.log('Fetching metrics...');

    try {
        const response = await apiCall('/metrics', 'GET');

        if (!response.success) {
            throw new Error(response.error || 'Failed to get metrics');
        }

        state.metrics = response.metrics;
        console.log('Metrics received:', state.metrics);

        // Render metrics
        renderMetrics(state.metrics);

        // Show parent screen
        showScreen('parent');

    } catch (error) {
        console.error('Error getting metrics:', error);
        // Show parent screen with error state
        renderMetricsError();
        showScreen('parent');
    }
}

function renderMetrics(metrics) {
    const container = document.getElementById('metrics-container');
    const highlightsContainer = document.getElementById('highlights-container');

    const summary = metrics.summary;

    // Render metric cards
    container.innerHTML = `
        <div class="metric-card">
            <span class="metric-value">${summary.overall_score}/10</span>
            <span class="metric-label">Overall Score</span>
        </div>
        <div class="metric-card secondary">
            <span class="metric-value">${summary.vocabulary_score}/10</span>
            <span class="metric-label">Vocabulary</span>
        </div>
        <div class="metric-card accent">
            <span class="metric-value">${summary.creativity_score}/10</span>
            <span class="metric-label">Creativity</span>
        </div>
        <div class="metric-card">
            <span class="metric-value">${summary.engagement_score}/10</span>
            <span class="metric-label">Engagement</span>
        </div>
    `;

    // Render highlights
    const highlightsList = summary.highlights
        .map(h => `<li>${h}</li>`)
        .join('');

    highlightsContainer.innerHTML = `
        <h3>Session Highlights</h3>
        <ul>${highlightsList}</ul>
        <p class="encouragement">${summary.encouragement}</p>
    `;
}

function renderMetricsError() {
    const container = document.getElementById('metrics-container');
    const highlightsContainer = document.getElementById('highlights-container');

    container.innerHTML = `
        <div class="metric-card" style="grid-column: span 2;">
            <span class="metric-label">Could not load metrics. Please try again.</span>
        </div>
    `;

    highlightsContainer.innerHTML = '';
}

// ============================================
// RESET & NEW ADVENTURE
// ============================================

async function resetSession() {
    console.log('Resetting session...');

    try {
        await apiCall('/reset', 'POST');
    } catch (error) {
        console.error('Error resetting session:', error);
    }

    // Reset local state
    state.introConversationId = null;
    state.storyAgentId = null;
    state.storyConversationId = null;
    state.introTranscript = null;
    state.storyTranscript = null;
    state.metrics = null;

    // Close any open connections
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }

    // Return to welcome screen
    showScreen('welcome');
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('SoulSmith app initialized');

    // Start Adventure button
    buttons.startAdventure.addEventListener('click', () => {
        startIntroSession();
    });

    // End Intro button
    buttons.endIntro.addEventListener('click', () => {
        endIntroSession();
    });

    // End Story button
    buttons.endStory.addEventListener('click', () => {
        endStorySession();
    });

    // New Adventure button
    buttons.newAdventure.addEventListener('click', () => {
        resetSession();
    });
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Helper to handle agent messages during WebRTC session
function handleAgentMessage(data) {
    // TODO: Implement message handling based on ElevenLabs WebRTC protocol
    // This would handle:
    // - Audio chunks from agent
    // - Transcript updates
    // - Conversation state changes
    console.log('Agent message:', data);
}

// Helper to send audio to agent
function sendAudioToAgent(audioData) {
    // TODO: Send audio through WebRTC data channel
    // if (state.dataChannel && state.dataChannel.readyState === 'open') {
    //     state.dataChannel.send(audioData);
    // }
}
