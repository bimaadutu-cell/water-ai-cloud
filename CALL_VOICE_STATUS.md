# Voice Call Status

The bot now listens for WhatsApp `call` offers.

- If the installed Baileys socket exposes `acceptCall(callId, from)`, WATER AI attempts to accept the call.
- If that method is unavailable, it safely rejects the call instead of pretending that an audio session exists.
- The current project does **not** include a WebRTC/VoIP media engine, microphone/speaker transport, or PCM audio bridge to Gemini. Therefore this build does not claim to provide a real-time AI voice conversation yet.

A true AI voice call requires a compatible VoIP media layer that can receive/send audio frames and a streaming speech-to-speech/ASR-TTS pipeline.
