# Photo Pixel RPG / CameraQuest

MVP hackathon build: upload photos, generate a deterministic backend campaign, and play a connected pixel RPG in Phaser.

## Fast start

```bash
cd /mnt/c/Users/joshu/PROJECTS/HACKATHONS/Photo-Pixel-RPG
./run_mvp.sh
```

Open http://127.0.0.1:5173

## Manual start

Backend:

```bash
cd /mnt/c/Users/joshu/PROJECTS/HACKATHONS/Photo-Pixel-RPG/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```

Frontend, in another terminal:

```bash
cd /mnt/c/Users/joshu/PROJECTS/HACKATHONS/Photo-Pixel-RPG/frontend
npm install
npm run dev -- --port 5173
```

## Demo flow

1. Open the app.
2. Click Play Demo Campaign for instant play, or upload 1-3 images and click Generate My Campaign.
3. Move with WASD or arrows.
4. Bump enemies/bosses to fight.
5. Walk into the portal after clearing the boss.

The backend is intentionally deterministic for demo reliability. If the backend is down, the frontend falls back to local campaign generation.
