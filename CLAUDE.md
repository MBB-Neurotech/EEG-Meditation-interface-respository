# MBB Neurotech Meditation Project

A React web app + Python backend for running a live EEG meditation study using an OpenBCI Ganglion board.

## What this does

Participants sit down, go through a 4-slide onboarding (welcome, privacy, instructions, meditation), then do a 15-minute guided meditation while wearing the Ganglion EEG headset. A moderator watches live brain activity on the EEG monitor page.

## Project structure

```
neurotech-interface/   ← React frontend (Vite + React 19 + Tailwind v4)
  src/
    pages/
      SlideshowPage.jsx   ← 4-slide participant onboarding (route: /)
      EEGPage.jsx         ← live EEG monitor for moderators (route: /data)
    slides/
      Slide1Welcome.jsx
      Slide2Privacy.jsx
      Slide3Instructions.jsx
      Slide4Meditation.jsx   ← video placeholder for guided meditation

bridge/                ← Python WebSocket server
  main.py              ← reads from Ganglion, streams to browser over WebSocket
  requirements.txt
```

## Hardware

**OpenBCI Ganglion** — 4-channel EEG board, 200 Hz, connects via USB dongle.
- The dongle shows up as `/dev/tty.usbmodem11` on Mac (may differ on other machines — run `ls /dev/tty.*` to find it)
- The Ganglion board needs its own power (battery) — LED should blink when on, go solid when connected

## How to run

### 1. Start the frontend
```bash
npm install
npm run dev
```
Opens at http://localhost:5173

### 2. Start the Python bridge

**Option A — via OpenBCI GUI (recommended, board stays in GUI)**
1. Open OpenBCI GUI, connect the Ganglion
2. Networking widget → Protocol: LSL → Stream 1 Data Type: TimeSeries → Start LSL Stream
3. Then run:
```bash
pip3 install -r bridge/requirements.txt
python3 bridge/main.py --lsl
```

**Option B — direct connection (close OpenBCI GUI first)**
```bash
python3 bridge/main.py --port /dev/tty.usbmodem11
```

**Option C — demo mode (no hardware needed)**
```bash
python3 bridge/main.py --demo
```

### 3. In the browser
Go to http://localhost:5173/data and press **Connect Device**.

## Data flow

```
Ganglion board → (BLE) → USB dongle → brainflow/LSL → bridge/main.py
  → WebSocket (ws://localhost:8765) → EEGPage.jsx → canvas waveforms
```

The bridge sends JSON every ~50ms:
```json
{ "type": "eeg", "channels": [[ch1 samples], [ch2], [ch3], [ch4]], "timestamp": 1234567890 }
```

EEGPage buffers 400 samples per channel and renders them on canvas via requestAnimationFrame.

## Key things to know

- The Ganglion has **4 channels** (not 8 — ignore any references to EMOTIV or 8-channel setups)
- EEG values are normalized by dividing by `EEG_SCALE = 150` (μV) for canvas rendering
- The wellness metrics and band power in the sidebar are currently static placeholders — not computed from real data yet
- The video on Slide 4 is a placeholder — needs a real guided meditation video embedded
