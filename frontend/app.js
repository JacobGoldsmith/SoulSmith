/**
 * SoulSmith Frontend Application
 * Interactive children's story experience
 */

// Configuration
const API_BASE_URL = '';  // Same origin - no CORS needed
const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/convai/conversation';

// Debug logging helper
const DEBUG = true;
const SAVE_AUDIO_FILES = true;  // Save audio to Downloads folder
let audioFileCounter = 0;

// Audio recording buffers - collect all audio during session
let sentAudioChunks = [];      // Audio we send to ElevenLabs
let receivedAudioChunks = [];  // Audio we receive from ElevenLabs

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

// Save audio data to a downloadable file
function saveAudioFile(audioData, prefix) {
    if (!SAVE_AUDIO_FILES) return;

    audioFileCounter++;
    const filename = `${prefix}_${audioFileCounter}_${Date.now()}.raw`;

    let blob;
    if (audioData instanceof ArrayBuffer) {
        blob = new Blob([audioData], { type: 'application/octet-stream' });
    } else if (typeof audioData === 'string') {
        // Base64 string - decode first
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: 'application/octet-stream' });
    } else {
        blob = new Blob([audioData], { type: 'application/octet-stream' });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log('FILE', `💾 Saved: ${filename} (${blob.size} bytes)`);
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

    // WAV header
    // "RIFF" chunk descriptor
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    view.setUint32(4, fileSize - 8, true);  // File size - 8
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));

    // "fmt " sub-chunk
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    view.setUint32(16, 16, true);           // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);            // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);  // NumChannels
    view.setUint32(24, sampleRate, true);   // SampleRate
    view.setUint32(28, byteRate, true);     // ByteRate
    view.setUint16(32, blockAlign, true);   // BlockAlign
    view.setUint16(34, bitsPerSample, true);// BitsPerSample

    // "data" sub-chunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, dataSize, true);     // Subchunk2Size

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
        log('FILE', `💾 Saved SENT audio: ${sentAudioChunks.length} chunks, ${totalSize} bytes → WAV`);
    } else {
        log('FILE', '⚠️ No sent audio to save');
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
        log('FILE', `💾 Saved RECEIVED audio: ${receivedAudioChunks.length} chunks, ${totalSize} bytes → WAV`);
    } else {
        log('FILE', '⚠️ No received audio to save (agent did not speak)');
    }

    // Clear buffers for next session
    sentAudioChunks = [];
    receivedAudioChunks = [];
}

// Clear audio buffers when starting a new session
function clearAudioBuffers() {
    sentAudioChunks = [];
    receivedAudioChunks = [];
    log('FILE', '🗑️ Audio buffers cleared');
}

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
    log('API', `📡 ${method} ${endpoint}`, body);

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
    const data = await response.json();
    log('API', `📥 Response from ${endpoint}:`, data);
    return data;
}

// ============================================
// ELEVENLABS WEBRTC CONNECTION
// ============================================

async function connectToElevenLabs(signedUrl, onConversationId, statusElementId, visualizerId) {
    return new Promise(async (resolve, reject) => {
        try {
            log('MIC', '📍 Requesting microphone access...');

            // Request microphone access
            state.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });

            log('MIC', '✅ Microphone access granted');

            // Set up audio context for processing
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            log('AUDIO', '✅ AudioContext created at 16kHz');

            // Connect to ElevenLabs WebSocket using signed URL
            log('WS', '📍 Connecting to ElevenLabs WebSocket...');
            log('WS', 'URL:', signedUrl.substring(0, 100) + '...');
            state.websocket = new WebSocket(signedUrl);

            state.websocket.onopen = () => {
                log('WS', '✅ WebSocket CONNECTED to ElevenLabs');
                updateStatus(statusElementId, 'Connected!', 'connected');
                setVisualizerActive(visualizerId, true);

                // Start sending audio
                startAudioCapture();
                resolve();
            };

            state.websocket.onmessage = async (event) => {
                // Handle binary audio data
                if (event.data instanceof Blob) {
                    log('WS-IN', `🔊 Received BINARY audio: ${event.data.size} bytes`);
                    const arrayBuffer = await event.data.arrayBuffer();
                    // Store for later saving
                    receivedAudioChunks.push(arrayBuffer.slice(0));
                    playAudioBuffer(arrayBuffer);
                    return;
                }

                // Handle JSON messages
                try {
                    const data = JSON.parse(event.data);
                    log('WS-IN', `📨 Received: ${data.type}`, data);
                    handleElevenLabsMessage(data, onConversationId);
                } catch (e) {
                    log('WS-IN', '⚠️ Non-JSON message:', event.data);
                }
            };

            state.websocket.onerror = (error) => {
                log('WS', '❌ WebSocket ERROR:', error);
                updateStatus(statusElementId, 'Connection error', 'error');
                reject(error);
            };

            state.websocket.onclose = (event) => {
                log('WS', `🔌 WebSocket CLOSED: code=${event.code}, reason=${event.reason}`);
                log('WS', `Close event details: wasClean=${event.wasClean}`);
                // Log stack trace to see what triggered the close
                console.trace('WebSocket close triggered from:');
                stopAudioCapture();
                setVisualizerActive(visualizerId, false);
            };

        } catch (error) {
            log('MIC', '❌ Microphone access DENIED:', error);
            updateStatus(statusElementId, 'Microphone access denied', 'error');
            reject(error);
        }
    });
}

function handleElevenLabsMessage(data, onConversationId) {
    console.log('ElevenLabs message:', data.type);

    switch (data.type) {
        case 'conversation_initiation_metadata':
            // Received conversation ID (nested in conversation_initiation_metadata_event)
            const convId = data.conversation_initiation_metadata_event?.conversation_id || data.conversation_id;
            if (convId && onConversationId) {
                console.log('Conversation ID:', convId);
                onConversationId(convId);
            }
            break;

        case 'audio':
            // Received audio from agent - play it (data is in audio_event)
            log('WS-IN', '🎵 Audio event received:', data.audio_event);
            const audioData = data.audio_event?.audio_base_64 || data.audio_event?.audio || data.audio;
            if (audioData) {
                log('WS-IN', `Playing audio chunk, length: ${audioData.length}`);
                // Decode and store for later saving
                const binaryString = atob(audioData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                receivedAudioChunks.push(bytes.buffer);
                playAudioChunk(audioData);
            } else {
                log('WS-IN', '⚠️ No audio data found in:', Object.keys(data.audio_event || {}));
            }
            break;

        case 'transcript':
            // Received transcript update
            console.log('Transcript:', data.transcript_event?.text || data.text);
            break;

        case 'agent_response':
            // Agent finished speaking
            console.log('Agent said:', data.agent_response_event?.agent_response || data.text);
            break;

        case 'user_transcript':
            // User speech transcribed
            console.log('User said:', data.user_transcription_event?.user_transcript || data.text);
            break;

        case 'interruption':
            // User interrupted agent
            console.log('Conversation interrupted');
            break;

        case 'ping':
            // Ping from server - ignore
            break;

        case 'error':
            console.error('ElevenLabs error:', data.error_event?.message || data.message);
            break;

        default:
            console.log('Unknown message type:', data.type, data);
    }
}

let audioChunksSent = 0;

function startAudioCapture() {
    if (!state.mediaStream || !state.websocket) {
        log('MIC', '❌ Cannot start capture - missing mediaStream or websocket');
        return;
    }

    audioChunksSent = 0;
    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    const processor = state.audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
        if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
            const inputData = event.inputBuffer.getChannelData(0);

            // Check if there's actual audio (not silence)
            const maxAmplitude = Math.max(...inputData.map(Math.abs));

            // Convert float32 to int16
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }

            // Send audio data as base64 (ElevenLabs format)
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)));
            state.websocket.send(JSON.stringify({
                user_audio_chunk: base64Audio
            }));

            // Store chunk for later saving
            sentAudioChunks.push(int16Data.buffer.slice(0));

            audioChunksSent++;
            // Log every 50 chunks (~3 seconds) to avoid spam
            if (audioChunksSent % 50 === 0) {
                log('WS-OUT', `🎤 Sent ${audioChunksSent} audio chunks (amplitude: ${maxAmplitude.toFixed(3)})`);
            }
            // Log first chunk
            if (audioChunksSent === 1) {
                log('WS-OUT', `🎤 First audio chunk sent (${base64Audio.length} chars, amplitude: ${maxAmplitude.toFixed(3)})`);
            }
        }
    };

    source.connect(processor);
    processor.connect(state.audioContext.destination);
    state.isRecording = true;
    log('MIC', '✅ Audio capture STARTED - now sending audio to ElevenLabs');
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

// Audio playback queue and context
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
    log('PLAY', `🔊 Processing audio buffer: ${arrayBuffer.byteLength} bytes`);

    // ElevenLabs sends PCM 16-bit audio at 16kHz
    const ctx = getPlaybackContext();

    // Convert ArrayBuffer to Int16Array (PCM data)
    const int16Data = new Int16Array(arrayBuffer);
    log('PLAY', `Converted to Int16Array: ${int16Data.length} samples`);

    // Convert Int16 to Float32 for Web Audio API
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768.0;
    }

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, float32Data.length, 16000);
    audioBuffer.getChannelData(0).set(float32Data);

    // Queue the audio
    audioQueue.push(audioBuffer);
    log('PLAY', `Queued audio. Queue length: ${audioQueue.length}, isPlaying: ${isPlaying}`);

    // Play if not already playing
    if (!isPlaying) {
        playNextInQueue();
    }
}

function playNextInQueue() {
    if (audioQueue.length === 0) {
        isPlaying = false;
        log('PLAY', '📭 Queue empty, stopping playback');
        return;
    }

    isPlaying = true;
    const ctx = getPlaybackContext();
    const audioBuffer = audioQueue.shift();

    log('PLAY', `▶️ Playing audio: ${audioBuffer.duration.toFixed(2)}s, ${audioQueue.length} remaining in queue`);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.onended = () => {
        playNextInQueue();
    };
    source.start();
}

function playAudioChunk(base64Audio) {
    log('PLAY', `🎵 Decoding base64 audio chunk: ${base64Audio.length} chars`);

    // Decode base64 audio and play it
    const audioData = atob(base64Audio);
    const arrayBuffer = new ArrayBuffer(audioData.length);
    const view = new Uint8Array(arrayBuffer);

    for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
    }

    log('PLAY', `Decoded to ${arrayBuffer.byteLength} bytes, sending to playAudioBuffer`);
    // Use the same playback system
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
// INTRO SESSION FUNCTIONS
// ============================================

async function startIntroSession() {
    log('SESSION', '🚀 ========== STARTING INTRO SESSION ==========');
    clearAudioBuffers();  // Clear any previous audio
    showScreen('intro');
    updateStatus('intro-status', 'Connecting...', '');

    try {
        // Call backend to get WebRTC token
        const response = await apiCall('/start_intro', 'POST');

        if (!response.success) {
            throw new Error(response.error || 'Failed to start intro');
        }

        const { webrtc_config, agent_id } = response;
        log('SESSION', `Got signed URL for agent: ${agent_id}`);

        // Connect to ElevenLabs
        await connectToElevenLabs(
            webrtc_config.signed_url,
            (conversationId) => {
                // Store conversation ID when received
                log('SESSION', `Received conversation ID: ${conversationId}`);
                state.introConversationId = conversationId;
                apiCall('/set_intro_conversation_id', 'POST', { conversation_id: conversationId });
            },
            'intro-status',
            'intro-visualizer'
        );

        log('SESSION', `✅ Intro session READY - agent: ${agent_id}`);
        log('SESSION', '💡 The agent should now speak its first_message (if configured)');
        log('SESSION', '💡 Speak into your microphone - audio is being sent to ElevenLabs');

    } catch (error) {
        log('SESSION', '❌ Error starting intro session:', error);
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
    log('SESSION', '🛑 ========== ENDING INTRO SESSION ==========');

    // Save audio files before disconnecting
    saveSessionAudio('INTRO');

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
    log('SESSION', '🚀 ========== STARTING STORY SESSION ==========');
    clearAudioBuffers();  // Clear any previous audio
    showScreen('story');
    updateStatus('story-status', 'Connecting...', '');

    try {
        const response = await apiCall('/start_story', 'POST');

        if (!response.success) {
            throw new Error(response.error || 'Failed to start story');
        }

        const { webrtc_config, agent_id } = response;
        log('SESSION', `Got signed URL for story agent: ${agent_id}`);

        // Connect to ElevenLabs
        await connectToElevenLabs(
            webrtc_config.signed_url,
            (conversationId) => {
                // Store conversation ID when received
                log('SESSION', `Received story conversation ID: ${conversationId}`);
                state.storyConversationId = conversationId;
                apiCall('/set_story_conversation_id', 'POST', { conversation_id: conversationId });
            },
            'story-status',
            'story-visualizer'
        );

        log('SESSION', `✅ Story session READY - agent: ${agent_id}`);
        log('SESSION', '💡 The storyteller agent should now speak its first_message');

    } catch (error) {
        log('SESSION', '❌ Error starting story session:', error);
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
    log('SESSION', '🛑 ========== ENDING STORY SESSION ==========');

    // Save audio files before disconnecting
    saveSessionAudio('STORY');

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

document.addEventListener('DOMContentLoaded', async () => {
    log('INIT', '🎮 SoulSmith app initialized');

    // Check agent configurations on startup
    try {
        const debugResp = await fetch('/debug/agents');
        const agents = await debugResp.json();
        log('INIT', '📋 Agent configurations:', agents);

        if (agents.intro_agent) {
            if (!agents.intro_agent.first_message) {
                log('INIT', '⚠️ WARNING: Intro agent has NO first_message - it will wait for user to speak first!');
            } else {
                log('INIT', `✅ Intro agent first_message: "${agents.intro_agent.first_message.substring(0, 50)}..."`);
            }
        }

        if (agents.adventure_agent) {
            if (!agents.adventure_agent.first_message) {
                log('INIT', '⚠️ WARNING: Adventure agent has NO first_message - it will wait for user to speak first!');
            } else {
                log('INIT', `✅ Adventure agent first_message: "${agents.adventure_agent.first_message.substring(0, 50)}..."`);
            }
        }
    } catch (e) {
        log('INIT', '⚠️ Could not check agent configs:', e.message);
    }

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
