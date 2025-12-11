/**
 * SoulSmith Frontend Application
 * Interactive children's story experience
 */

// Configuration
const API_BASE_URL = '';  // Same origin - no CORS needed
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';

// State management
const state = {
    currentScreen: 'welcome',
    introConversationId: null,
    storyAgentId: null,
    storyConversationId: null,
    introTranscript: null,
    storyTranscript: null,
    metrics: null,
    // WebSocket/Audio state
    websocket: null,
    mediaStream: null,
    audioContext: null,
    mediaRecorder: null,
    isRecording: false,
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
// ELEVENLABS WEBRTC CONNECTION
// ============================================

async function connectToElevenLabs(signedUrl, onConversationId, statusElementId, visualizerId) {
    return new Promise(async (resolve, reject) => {
        try {
            // Request microphone access
            state.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });

            // Set up audio context for processing
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            // Connect to ElevenLabs WebSocket using signed URL
            state.websocket = new WebSocket(signedUrl);

            state.websocket.onopen = () => {
                console.log('WebSocket connected to ElevenLabs');
                updateStatus(statusElementId, 'Connected!', 'connected');
                setVisualizerActive(visualizerId, true);

                // Start sending audio
                startAudioCapture();
                resolve();
            };

            state.websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleElevenLabsMessage(data, onConversationId);
            };

            state.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                updateStatus(statusElementId, 'Connection error', 'error');
                reject(error);
            };

            state.websocket.onclose = (event) => {
                console.log('WebSocket closed:', event.code, event.reason);
                stopAudioCapture();
                setVisualizerActive(visualizerId, false);
            };

        } catch (error) {
            console.error('Error connecting to ElevenLabs:', error);
            updateStatus(statusElementId, 'Microphone access denied', 'error');
            reject(error);
        }
    });
}

function handleElevenLabsMessage(data, onConversationId) {
    console.log('ElevenLabs message:', data.type);

    switch (data.type) {
        case 'conversation_initiation_metadata':
            // Received conversation ID
            if (data.conversation_id && onConversationId) {
                onConversationId(data.conversation_id);
            }
            break;

        case 'audio':
            // Received audio from agent - play it
            if (data.audio) {
                playAudioChunk(data.audio);
            }
            break;

        case 'transcript':
            // Received transcript update
            console.log('Transcript:', data.text);
            break;

        case 'agent_response':
            // Agent finished speaking
            console.log('Agent said:', data.text);
            break;

        case 'user_transcript':
            // User speech transcribed
            console.log('User said:', data.text);
            break;

        case 'interruption':
            // User interrupted agent
            console.log('Conversation interrupted');
            break;

        case 'error':
            console.error('ElevenLabs error:', data.message);
            break;

        default:
            console.log('Unknown message type:', data.type);
    }
}

function startAudioCapture() {
    if (!state.mediaStream || !state.websocket) return;

    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    const processor = state.audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            const inputData = event.inputBuffer.getChannelData(0);

            // Convert float32 to int16
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }

            // Send audio data as base64
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)));
            state.websocket.send(JSON.stringify({
                type: 'audio',
                audio: base64Audio
            }));
        }
    };

    source.connect(processor);
    processor.connect(state.audioContext.destination);
    state.isRecording = true;
    console.log('Audio capture started');
}

function stopAudioCapture() {
    state.isRecording = false;

    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
        state.mediaStream = null;
    }

    if (state.audioContext && state.audioContext.state !== 'closed') {
        state.audioContext.close();
        state.audioContext = null;
    }

    console.log('Audio capture stopped');
}

function playAudioChunk(base64Audio) {
    // Decode base64 audio and play it
    const audioData = atob(base64Audio);
    const arrayBuffer = new ArrayBuffer(audioData.length);
    const view = new Uint8Array(arrayBuffer);

    for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
    }

    // Create audio context for playback if needed
    const playbackContext = new (window.AudioContext || window.webkitAudioContext)();

    playbackContext.decodeAudioData(arrayBuffer)
        .then(audioBuffer => {
            const source = playbackContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(playbackContext.destination);
            source.start();
        })
        .catch(err => {
            console.error('Error playing audio:', err);
        });
}

function disconnectFromElevenLabs() {
    if (state.websocket) {
        state.websocket.close();
        state.websocket = null;
    }
    stopAudioCapture();
}

// ============================================
// INTRO SESSION FUNCTIONS
// ============================================

async function startIntroSession() {
    console.log('Starting intro session...');
    showScreen('intro');
    updateStatus('intro-status', 'Connecting...', '');

    try {
        // Call backend to get WebRTC token
        const response = await apiCall('/start_intro', 'POST');

        if (!response.success) {
            throw new Error(response.error || 'Failed to start intro');
        }

        const { webrtc_config, agent_id } = response;

        // Connect to ElevenLabs
        await connectToElevenLabs(
            webrtc_config.signed_url,
            (conversationId) => {
                // Store conversation ID when received
                state.introConversationId = conversationId;
                apiCall('/set_intro_conversation_id', 'POST', { conversation_id: conversationId });
            },
            'intro-status',
            'intro-visualizer'
        );

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

    // Close WebSocket connection
    disconnectFromElevenLabs();

    setVisualizerActive('intro-visualizer', false);
    updateStatus('intro-status', 'Session ended', '');

    // Show transition screen
    showScreen('transition');
    document.getElementById('transition-message').textContent = 'Getting your responses...';

    try {
        // Wait a moment for transcript to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

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

        // Connect to ElevenLabs
        await connectToElevenLabs(
            webrtc_config.signed_url,
            (conversationId) => {
                // Store conversation ID when received
                state.storyConversationId = conversationId;
                apiCall('/set_story_conversation_id', 'POST', { conversation_id: conversationId });
            },
            'story-status',
            'story-visualizer'
        );

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

    // Close WebSocket connection
    disconnectFromElevenLabs();

    setVisualizerActive('story-visualizer', false);
    updateStatus('story-status', 'Story ended', '');

    // Show transition
    showScreen('transition');
    document.getElementById('transition-message').textContent = 'Analyzing the adventure...';

    try {
        // Wait a moment for transcript to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

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

    // Close any open connections
    disconnectFromElevenLabs();

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
