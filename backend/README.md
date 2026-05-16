# CameraQuest backend MVP

Deterministic FastAPI mock backend for the hackathon demo. It accepts photos and returns validated campaign JSON. Gemini generation is optional and enabled when `GEMINI_API_KEY` is set.

Run:

```bash
cd /mnt/c/Users/joshu/PROJECTS/HACKATHONS/Photo-Pixel-RPG/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY=your_google_api_key_here   # optional
uvicorn app:app --host 127.0.0.1 --port 8000
```

You can copy `backend/.env.example` to `.env` for local reference, but set the key in your shell/hosted environment (do not commit real keys).

Health check:

```bash
curl http://127.0.0.1:8000/health
```
