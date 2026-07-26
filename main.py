import io
import os
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from groq import Groq
from gtts import gTTS
from pydantic import BaseModel

# Load GROQ_API_KEY from a local .env file when running on your own machine.
# On Render, this same variable is set in the dashboard instead of a file.
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is missing. Add it to your .env file or Render environment variables.")

groq_client = Groq(api_key=GROQ_API_KEY)

# System prompt kept short and spoken-language friendly, since replies
# may be read aloud by the TTS engine rather than only displayed as text.
SYSTEM_PROMPT = (
    "You are Arslan.AI, a helpful and friendly voice assistant. "
    "Keep replies natural, clear, and conversational since they may be spoken aloud. "
    "Avoid markdown, bullet points, or special formatting in your responses."
)

app = FastAPI(title="Arslan.AI Voice Agent")

# Permissive CORS so the frontend works whether it's served by this same
# app (Render) or opened separately during local development/testing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request / response models ----------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    model: str = "openai/gpt-oss-120b"
    history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str


class TTSRequest(BaseModel):
    text: str


# ---------- Endpoint 1: text in, AI text reply out ----------
# Used by both the typed-chat flow and the voice flow (after transcription).

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in request.history:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": request.message})

    try:
        completion = groq_client.chat.completions.create(
            model=request.model,
            messages=messages,
            temperature=0.7,
            max_tokens=512,
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {error}")

    reply_text = completion.choices[0].message.content
    return ChatResponse(reply=reply_text)


# ---------- Endpoint 2: recorded audio in, transcript out ----------
# Used for single voice messages and for every turn of a live call.

@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio upload.")

    try:
        transcription = groq_client.audio.transcriptions.create(
            file=(audio.filename or "speech.webm", audio_bytes),
            model="whisper-large-v3-turbo",
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Transcription failed: {error}")

    return {"text": transcription.text}


# ---------- Endpoint 3: text in, spoken MP3 out ----------
# Only called when "Voice Reply" is enabled, or automatically during a live call.

@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    clean_text = request.text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="No text provided for speech synthesis.")

    try:
        tts = gTTS(text=clean_text, lang="en")
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        return StreamingResponse(audio_buffer, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {str(e)}")


# Serve the frontend (index.html, style.css, app.js) as static files.
# Registered last so it never intercepts the /api/* routes above.
if os.path.isdir("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
