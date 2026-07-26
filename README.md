# 🎙️ Arslan.AI — Real-Time Voice Agent

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Groq](https://img.shields.io/badge/Groq-f55036?style=for-the-badge&logo=groq&logoColor=white)
![Llama 3](https://img.shields.io/badge/Llama_3-0466c8?style=for-the-badge)

A lightning-fast, dark-mode real-time voice chat agent built using FastAPI, Groq's ultra-low latency Llama models, and Whisper transcriptions.

## 🌐 Live Demo & Media

- **Live App:** [Deploy on Render](https://render.com) (Update link once deployed)
- **Demo Video:** *Placeholder for Demo Video*

## 📸 Screenshots

| Desktop View | Mobile View |
|:---:|:---:|
| *[Add Desktop Screenshot Placeholder]* | *[Add Mobile Screenshot Placeholder]* |

## ✨ Key Features

- **⚡ Lightning Fast Responses:** Powered by Groq's Llama 3 models for near-instant AI responses.
- **🎤 Real-Time Live Call Mode:** Hands-free, continuous conversation that intelligently detects when you stop speaking.
- **🎧 High-Quality Voice Synthesis:** Utilizes Microsoft Edge TTS to give the AI a natural, conversational voice.
- **⌨️ Seamless Typing Sync:** The AI's responses are dynamically typed out on the screen perfectly synced with its spoken voice.
- **📱 Fully Responsive Design:** Sleek, modern dark-mode neon-green interface that works seamlessly on desktop and mobile.

## 🛠️ Tech Stack Table

| Component | Technology | Purpose |
| --- | --- | --- |
| **Backend** | FastAPI (Python) | High-performance API server and static file hosting |
| **LLM Inference** | Groq API | Lightning-fast text generation using Llama 3 |
| **Transcription (STT)** | Groq Whisper | Converting user voice messages to text |
| **Speech Synthesis (TTS)** | edge-tts | Generating AI spoken audio responses |
| **Frontend** | HTML/CSS/JS (Vanilla) | Custom responsive UI with Web Audio API for silence detection |

## ⚙️ How It Works

1. **Audio Capture:** The browser records user audio (via single message or live call) and sends the blob to the backend.
2. **Transcription:** The FastAPI backend pipes the audio to Groq's Whisper API to transcribe speech into text.
3. **LLM Generation:** The transcript, along with conversation history, is sent to Groq's Llama 3 models to instantly generate a contextual reply.
4. **Speech Synthesis:** The text reply is converted to a high-quality audio stream via `edge-tts`.
5. **Playback & Typing:** The frontend receives the audio, begins playback immediately, and dynamically animates the text onto the screen in sync with the audio.

## 🏗️ Project Architecture

```mermaid
graph TD
    User([User]) -->|Speaks / Types| Frontend[Vanilla HTML/JS Frontend]
    Frontend -->|POST /api/transcribe| Backend[FastAPI Backend]
    Frontend -->|POST /api/chat| Backend
    Frontend -->|POST /api/tts| Backend
    Backend -->|Audio Blob| GroqSTT[Groq Whisper API]
    GroqSTT -->|Transcript| Backend
    Backend -->|Context + Prompt| GroqLLM[Groq Llama 3 Models]
    GroqLLM -->|Text Reply| Backend
    Backend -->|Text Reply| EdgeTTS[Microsoft Edge TTS]
    EdgeTTS -->|Audio Stream| Backend
    Backend -->|Audio Response| Frontend
    Frontend -->|Plays Audio & Types Text| User
```

## 📂 Project Structure

```
├── .env.example
├── README.md
├── main.py
├── render.yaml
├── requirements.txt
└── static/
    ├── app.js
    ├── index.html
    └── style.css
```

## 💻 Local Setup & Installation

### Prerequisites
- Python 3.9+
- A [Groq API Key](https://console.groq.com/keys)

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/Arslan-Codes097/arslan-voice-agent.git
   cd arslan-voice-agent
   ```

2. **Set up virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   Copy `.env.example` to `.env` and add your Groq API key:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and set `GROQ_API_KEY=your_key_here`*

5. **Run the server**
   ```bash
   uvicorn main:app --reload
   ```
   Open `http://localhost:8000` in your browser.

## 🚀 Deployment (Render)

This project is configured for 1-click deployment on [Render](https://render.com).
1. Push this repository to GitHub.
2. Connect your GitHub to Render and create a new **Web Service**.
3. Render will automatically detect the `render.yaml` blueprint.
4. Add the `GROQ_API_KEY` to the environment variables on the Render dashboard.
5. Deploy!

## 👤 Author & Credits

**Arslan**
- GitHub: [@Arslan-Codes097](https://github.com/Arslan-Codes097)
- LinkedIn: [Arslan Babar](https://www.linkedin.com/in/arslan-babar-27516731a/)
- Phone: +92 326 744 1052
