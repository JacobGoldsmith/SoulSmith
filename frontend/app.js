/**
 * SoulSmith Frontend Application
 * Interactive children's story experience with a single agent flow
 */

// Configuration
const API_BASE_URL = '';  // Same origin - no CORS needed
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';

// Debug logging
const DEBUG = true;
const SAVE_AUDIO_FILES = false;  // Set to true to download audio files for debugging
let audioFileCounter = 0;

// Audio recording buffers
let sentAudioChunks = [];
let receivedAudioChunks = [];

function log(category, message, data = null) {
    if (!DEBUG) return;
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = `[${timestamp}] [${category}]`;
    if (data) {
        console.log(`${prefix} ${message}`, data);
    } else {
        console.log(`${prefix} ${message}`);
    }
}

// Create WAV file from PCM data (16-bit, 16kHz, mono)
function createWavFile(pcmData) {
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcmData.byteLength;
    const fileSize = 44 + dataSize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // WAV header - "RIFF" chunk
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    view.setUint32(4, fileSize - 8, true);
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));

    // "fmt " sub-chunk
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // "data" sub-chunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, dataSize, true);

    // Copy PCM data
    const wavData = new Uint8Array(buffer);
    wavData.set(new Uint8Array(pcmData), 44);

    return buffer;
}

// Save all accumulated audio from a session
function saveSessionAudio(sessionName) {
    if (!SAVE_AUDIO_FILES) return;

    const timestamp = Date.now();

    // Save sent audio (what user said)
    if (sentAudioChunks.length > 0) {
        const totalSize = sentAudioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const combined = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of sentAudioChunks) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        const wavData = createWavFile(combined.buffer);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sessionName}_SENT_${timestamp}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log('FILE', `Saved SENT audio: ${sentAudioChunks.length} chunks, ${totalSize} bytes`);
    }

    // Save received audio (what agent said)
    if (receivedAudioChunks.length > 0) {
        const totalSize = receivedAudioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const combined = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of receivedAudioChunks) {
            combined.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        const wavData = createWavFile(combined.buffer);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sessionName}_RECEIVED_${timestamp}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log('FILE', `Saved RECEIVED audio: ${receivedAudioChunks.length} chunks, ${totalSize} bytes`);
    }

    // Clear buffers
    sentAudioChunks = [];
    receivedAudioChunks = [];
}

function clearAudioBuffers() {
    sentAudioChunks = [];
    receivedAudioChunks = [];
    log('FILE', 'Audio buffers cleared');
}

// State management
const state = {
    currentScreen: 'welcome',
    conversationId: null,
    transcript: null,
    metrics: null,
    // WebSocket/Audio state
    websocket: null,
    mediaStream: null,
    audioContext: null,
    isRecording: false,
    // Flag to track if session ended by agent (vs user)
    sessionEndedByAgent: false,
    // Flag to prevent double-ending
    isEnding: false,
    // Flag to track if WebSocket connection was established
    connectionEstablished: false,
};

// DOM Elements
const screens = {
    welcome: document.getElementById('welcome-screen'),
    adventure: document.getElementById('adventure-screen'),
    transition: document.getElementById('transition-screen'),
    parent: document.getElementById('parent-screen'),
};

const buttons = {
    startAdventure: document.getElementById('btn-start-adventure'),
    endAdventure: document.getElementById('btn-end-adventure'),
    newAdventure: document.getElementById('btn-new-adventure'),
};

// Screen Navigation
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.remove('active');
    });
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
    state.currentScreen = screenName;
}

function updateStatus(message, statusClass = '') {
    const element = document.getElementById('adventure-status');
    if (element) {
        element.textContent = message;
        element.className = 'status-indicator';
        if (statusClass) {
            element.classList.add(statusClass);
        }
    }
}

function setVisualizerActive(active) {
    const visualizer = document.getElementById('adventure-visualizer');
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
    log('API', `${method} ${endpoint}`, body);

    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    log('API', `Response from ${endpoint}:`, data);
    return data;
}

// ============================================
// ELEVENLABS WEBSOCKET CONNECTION
// ============================================

async function connectToElevenLabs(signedUrl, onConversationId) {
    return new Promise(async (resolve, reject) => {
        try {
            log('MIC', 'Requesting microphone access...');

            // Request microphone access
            state.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });

            log('MIC', 'Microphone access granted');

            // Set up audio context
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            // Connect to ElevenLabs WebSocket
            log('WS', 'Connecting to ElevenLabs...');
            state.websocket = new WebSocket(signedUrl);

            state.websocket.onopen = () => {
                log('WS', 'WebSocket CONNECTED');
                state.connectionEstablished = true;
                updateStatus('Connected!', 'connected');
                setVisualizerActive(true);
                startAudioCapture();
                resolve();
            };

            state.websocket.onmessage = async (event) => {
                // Handle binary audio data
                if (event.data instanceof Blob) {
                    const arrayBuffer = await event.data.arrayBuffer();
                    receivedAudioChunks.push(arrayBuffer.slice(0));
                    playAudioBuffer(arrayBuffer);
                    return;
                }

                // Handle JSON messages
                try {
                    const data = JSON.parse(event.data);
                    handleElevenLabsMessage(data, onConversationId);
                } catch (e) {
                    log('WS', 'Non-JSON message:', event.data);
                }
            };

            state.websocket.onerror = (error) => {
                log('WS', 'WebSocket ERROR:', error);
                updateStatus('Connection error', 'error');
                reject(error);
            };

            state.websocket.onclose = (event) => {
                log('WS', `WebSocket CLOSED: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
                stopAudioCapture();
                setVisualizerActive(false);

                // Only trigger auto-end if:
                // 1. Connection was established (we got past the handshake)
                // 2. We have a conversation ID (session was valid)
                // 3. Session hasn't been ended yet
                // 4. We're still on the adventure screen
                // 5. Close was clean (code 1000) - indicates agent ended via end_call
                const shouldAutoEnd = state.connectionEstablished &&
                                      state.conversationId &&
                                      !state.isEnding &&
                                      state.currentScreen === 'adventure' &&
                                      event.code === 1000;

                if (shouldAutoEnd) {
                    log('WS', 'Agent ended the conversation via end_call - triggering end flow');
                    state.sessionEndedByAgent = true;
                    endAdventure();
                } else if (!state.isEnding && state.currentScreen === 'adventure') {
                    log('WS', `Connection closed unexpectedly (code ${event.code}) - not triggering auto-end`);
                }
            };

        } catch (error) {
            log('MIC', 'Microphone access DENIED:', error);
            updateStatus('Microphone access denied', 'error');
            reject(error);
        }
    });
}

function handleElevenLabsMessage(data, onConversationId) {
    switch (data.type) {
        case 'conversation_initiation_metadata':
            const convId = data.conversation_initiation_metadata_event?.conversation_id || data.conversation_id;
            if (convId && onConversationId) {
                log('WS', `Conversation ID: ${convId}`);
                onConversationId(convId);
            }
            break;

        case 'audio':
            const audioData = data.audio_event?.audio_base_64 || data.audio_event?.audio || data.audio;
            if (audioData) {
                const binaryString = atob(audioData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                receivedAudioChunks.push(bytes.buffer);
                playAudioChunk(audioData);
            }
            break;

        case 'agent_response':
            log('AGENT', 'Agent said:', data.agent_response_event?.agent_response || data.text);
            break;

        case 'user_transcript':
            log('USER', 'User said:', data.user_transcription_event?.user_transcript || data.text);
            break;

        case 'interruption':
            log('WS', 'Conversation interrupted');
            break;

        case 'ping':
            // Ignore pings
            break;

        case 'error':
            log('WS', 'ElevenLabs error:', data.error_event?.message || data.message);
            break;

        default:
            log('WS', 'Unknown message type:', data.type);
    }
}

let audioChunksSent = 0;

function startAudioCapture() {
    if (!state.mediaStream || !state.websocket) {
        log('MIC', 'Cannot start capture - missing mediaStream or websocket');
        return;
    }

    audioChunksSent = 0;
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

            // Send audio as base64
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)));
            state.websocket.send(JSON.stringify({ user_audio_chunk: base64Audio }));

            // Store for debugging
            sentAudioChunks.push(int16Data.buffer.slice(0));

            audioChunksSent++;
            if (audioChunksSent % 50 === 0) {
                log('MIC', `Sent ${audioChunksSent} audio chunks`);
            }
        }
    };

    source.connect(processor);
    processor.connect(state.audioContext.destination);
    state.isRecording = true;
    log('MIC', 'Audio capture STARTED');
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

    log('MIC', 'Audio capture stopped');
}

// Audio playback
let playbackContext = null;
let audioQueue = [];
let isPlaying = false;

function getPlaybackContext() {
    if (!playbackContext || playbackContext.state === 'closed') {
        playbackContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000
        });
    }
    return playbackContext;
}

async function playAudioBuffer(arrayBuffer) {
    const ctx = getPlaybackContext();

    // Convert PCM Int16 to Float32
    const int16Data = new Int16Array(arrayBuffer);
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
    }

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, float32Data.length, 16000);
    audioBuffer.getChannelData(0).set(float32Data);

    // Queue and play
    audioQueue.push(audioBuffer);
    if (!isPlaying) {
        playNextInQueue();
    }
}

// Track current audio source for stopping
let currentAudioSource = null;

function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        currentAudioSource = null;
        return;
    }

    isPlaying = true;
    const ctx = getPlaybackContext();
    const audioBuffer = audioQueue.shift();

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => playNextInQueue();
    currentAudioSource = source;
    source.start();
}

function stopAudioPlayback() {
    // Clear the queue
    audioQueue = [];
    isPlaying = false;

    // Stop current playing audio
    if (currentAudioSource) {
        try {
            currentAudioSource.stop();
        } catch (e) {
            // Ignore if already stopped
        }
        currentAudioSource = null;
    }

    // Close playback context
    if (playbackContext && playbackContext.state !== 'closed') {
        playbackContext.close();
        playbackContext = null;
    }

    log('PLAY', 'Audio playback stopped and queue cleared');
}

function playAudioChunk(base64Audio) {
    const audioData = atob(base64Audio);
    const arrayBuffer = new ArrayBuffer(audioData.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
    }
    playAudioBuffer(arrayBuffer);
}

function disconnectFromElevenLabs() {
    if (state.websocket) {
        state.websocket.close();
        state.websocket = null;
    }
    stopAudioCapture();
}

// ============================================
// ADVENTURE SESSION (Single Agent Flow)
// ============================================

async function startAdventure() {
    log('SESSION', '========== STARTING ADVENTURE ==========');
    clearAudioBuffers();
    state.isEnding = false;
    state.sessionEndedByAgent = false;
    state.connectionEstablished = false;
    state.conversationId = null;

    showScreen('adventure');
    updateStatus('Connecting...', '');

    try {
        // Call backend to start adventure and get signed URL
        const response = await apiCall('/start_adventure', 'POST');

        if (!response.success) {
            throw new Error(response.error || 'Failed to start adventure');
        }

        const { webrtc_config, agent_id } = response;
        log('SESSION', `Got signed URL for agent: ${agent_id}`);

        // Connect to ElevenLabs
        await connectToElevenLabs(
            webrtc_config.signed_url,
            (conversationId) => {
                log('SESSION', `Conversation ID: ${conversationId}`);
                state.conversationId = conversationId;
                apiCall('/set_conversation_id', 'POST', { conversation_id: conversationId });
            }
        );

        log('SESSION', 'Adventure session READY');

    } catch (error) {
        log('SESSION', 'Error starting adventure:', error);
        updateStatus('Connection failed', 'error');
    }
}

async function endAdventure() {
    // Prevent double-ending
    if (state.isEnding) {
        log('SESSION', 'Already ending session, skipping...');
        return;
    }
    state.isEnding = true;

    log('SESSION', '========== ENDING ADVENTURE ==========');
    log('SESSION', `Ended by: ${state.sessionEndedByAgent ? 'Agent' : 'User'}`);

    // Stop all audio immediately
    stopAudioPlayback();

    // Save audio files
    saveSessionAudio('ADVENTURE');

    // Close WebSocket if still open
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.close();
    }
    state.websocket = null;
    stopAudioCapture();
    setVisualizerActive(false);
    updateStatus('Adventure ended', '');

    // Show transition screen
    showScreen('transition');
    document.getElementById('transition-title').textContent = 'Processing...';
    document.getElementById('transition-message').textContent = 'Analyzing your adventure...';

    try {
        // Wait for transcript to be ready
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Get the transcript
        document.getElementById('transition-message').textContent = 'Getting conversation transcript...';
        await getTranscript();

        // Get metrics from Claude
        document.getElementById('transition-message').textContent = 'Preparing your summary...';
        await showParentSummary();

    } catch (error) {
        log('SESSION', 'Error ending adventure:', error);
        document.getElementById('transition-message').textContent = 'Something went wrong. Please try again.';
        // Still show parent screen after a delay
        setTimeout(() => {
            renderMetricsError();
            showScreen('parent');
        }, 2000);
    }
}

async function getTranscript() {
    log('API', 'Getting transcript...');

    try {
        const response = await apiCall('/get_transcript', 'GET');

        if (!response.success) {
            throw new Error(response.error || 'Failed to get transcript');
        }

        state.transcript = response.transcript;
        log('API', 'Transcript received:', state.transcript);
        return state.transcript;

    } catch (error) {
        log('API', 'Error getting transcript:', error);
        throw error;
    }
}

// ============================================
// METRICS & PARENT SUMMARY
// ============================================

async function showParentSummary() {
    log('API', 'Fetching metrics...');

    try {
        const response = await apiCall('/metrics', 'GET');

        if (!response.success) {
            throw new Error(response.error || 'Failed to get metrics');
        }

        state.metrics = response.metrics;
        log('API', 'Metrics received:', state.metrics);

        renderMetrics(state.metrics);
        showScreen('parent');

    } catch (error) {
        log('API', 'Error getting metrics:', error);
        renderMetricsError();
        showScreen('parent');
    }
}

function renderMetrics(metrics) {
    const container = document.getElementById('metrics-container');
    const highlightsContainer = document.getElementById('highlights-container');

    const summary = metrics.summary;

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
    log('SESSION', 'Resetting session...');

    disconnectFromElevenLabs();

    try {
        await apiCall('/reset', 'POST');
    } catch (error) {
        log('SESSION', 'Error resetting:', error);
    }

    // Reset local state
    state.conversationId = null;
    state.transcript = null;
    state.metrics = null;
    state.isEnding = false;
    state.sessionEndedByAgent = false;
    state.connectionEstablished = false;

    showScreen('welcome');
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    log('INIT', 'SoulSmith app initialized');

    // Check agent configuration on startup
    try {
        const debugResp = await fetch('/debug/agents');
        const agents = await debugResp.json();
        log('INIT', 'Agent configurations:', agents);

        if (agents.adventure_agent) {
            if (!agents.adventure_agent.first_message) {
                log('INIT', 'WARNING: Adventure agent has NO first_message');
            } else {
                log('INIT', `Adventure agent first_message: "${agents.adventure_agent.first_message.substring(0, 50)}..."`);
            }
        }
    } catch (e) {
        log('INIT', 'Could not check agent configs:', e.message);
    }

    // Start Adventure button
    if (buttons.startAdventure) {
        buttons.startAdventure.addEventListener('click', () => {
            startAdventure();
        });
    }

    // End Adventure button
    if (buttons.endAdventure) {
        buttons.endAdventure.addEventListener('click', () => {
            endAdventure();
        });
    }

    // New Adventure button
    if (buttons.newAdventure) {
        buttons.newAdventure.addEventListener('click', () => {
            resetSession();
        });
    }
});
