# CameraQuest frontend

Fast hackathon demo for Photo-Pixel-RPG / RealityRPG.

## Run

```bash
cd /mnt/c/Users/joshu/PROJECTS/HACKATHONS/Photo-Pixel-RPG/frontend
npm install
npm run dev
```

Open the Vite URL, usually http://127.0.0.1:5173.

## Demo flow

1. Click `Load demo campaign` for an instant playable 3-level campaign, or choose 3 photos and click `Generate campaign`.
2. Move with WASD or arrow keys.
3. Collect glowing quest items.
4. Bump enemies/bosses to defeat them.
5. Enter the portal to advance through the photo-level chain.

The current build uses mocked level JSON and generated Phaser textures so the demo is reliable without a backend or image-generation API. The UI is designed to match the planned pipeline: uploaded photos -> scene analysis -> pixel RPG conversion -> connected campaign.
