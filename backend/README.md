# CameraQuest backend MVP

Deterministic FastAPI mock backend for the hackathon demo. It accepts photos and returns validated campaign JSON; no external AI key required.

Run:

```bash
cd /mnt/c/Users/joshu/PROJECTS/HACKATHONS/Photo-Pixel-RPG/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```
