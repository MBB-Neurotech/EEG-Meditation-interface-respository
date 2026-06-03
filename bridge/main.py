#!/usr/bin/env python3
"""
OpenBCI Ganglion → WebSocket bridge for neurotech-interface.

Usage:
  python3 main.py --lsl             # read from OpenBCI GUI LSL stream (recommended)
  python3 main.py --demo            # synthetic data, no hardware needed
  python3 main.py --port /dev/tty.usbmodem11  # connect directly (close OpenBCI GUI first)
"""

import asyncio
import json
import argparse
import time
import collections

import numpy as np
import websockets

WS_PORT         = 8765
CHUNK_INTERVAL  = 0.05    # seconds between raw sends (~50 ms)
BAND_INTERVAL   = 0.25    # seconds between band-power computation (250 ms)
WINDOW_SECS     = 2.0     # rolling window for band powers
SAMPLE_RATE     = 200     # Hz (Ganglion)
ARTIFACT_THRESH = 150.0   # µV peak-to-peak — marks signal as artefact
FLAT_THRESH     = 0.5     # µV — signal considered flat/disconnected
N_CHANNELS      = 4

CLIENTS: set = set()


class BandPowerEngine:
    """Rolling buffer + BrainFlow band-power computation."""

    def __init__(self, n_channels: int, sample_rate: int, window_secs: float):
        self.n_channels  = n_channels
        self.sample_rate = sample_rate
        self.window_size = int(window_secs * sample_rate)
        self.buffers = [collections.deque(maxlen=self.window_size) for _ in range(n_channels)]

    def push(self, channels_data):
        """channels_data: list[list], shape [n_channels][n_samples_in_chunk]"""
        for ch, samples in enumerate(channels_data):
            if ch < self.n_channels:
                self.buffers[ch].extend(samples)

    def _quality(self) -> str:
        for buf in self.buffers:
            if len(buf) < self.window_size // 2:
                return 'poor'
            arr = np.asarray(buf, dtype=np.float64)
            pp = float(arr.max() - arr.min())
            if pp > ARTIFACT_THRESH or pp < FLAT_THRESH:
                return 'poor'
        return 'good'

    def compute(self, apply_filters: bool):
        """Return (bands_dict, quality_str). bands_dict is None only when buffer is too short."""
        from brainflow.data_filter import DataFilter
        quality = self._quality()
        if any(len(buf) < self.window_size // 2 for buf in self.buffers):
            return None, quality
        data = np.array([list(b) for b in self.buffers], dtype=np.float64)
        try:
            avg, _ = DataFilter.get_avg_band_powers(
                data.copy(), list(range(self.n_channels)), self.sample_rate, apply_filters
            )
            # avg order: [delta, theta, alpha, beta, gamma]
            total = float(np.sum(avg)) + 1e-10
            return {
                'delta': float(avg[0] / total),
                'theta': float(avg[1] / total),
                'alpha': float(avg[2] / total),
                'beta':  float(avg[3] / total),
                'gamma': float(avg[4] / total),
            }, quality
        except Exception:
            return None, quality


# ── LSL mode ───────────────────────────────────────────────────────────────
async def broadcast_loop_lsl():
    from pylsl import StreamInlet, resolve_streams

    print("Searching for any LSL stream...")
    all_streams = resolve_streams(wait_time=5.0)
    if not all_streams:
        print("[ERROR] No LSL streams found.")
        print("  • In OpenBCI GUI → Networking → LSL → TimeSeries → Start LSL Stream")
        return

    print(f"Found {len(all_streams)} stream(s):")
    for s in all_streams:
        print(f"  • {s.name()}  type={s.type()}  channels={s.channel_count()}")

    inlet = StreamInlet(all_streams[0])
    info  = inlet.info()
    n_ch  = info.channel_count()
    lsl_rate = max(1, int(info.nominal_srate())) or SAMPLE_RATE
    print(f"\nUsing: {info.name()}  |  {n_ch} channels  |  {lsl_rate} Hz")
    print(f"WebSocket server → ws://localhost:{WS_PORT}\n")

    engine         = BandPowerEngine(min(n_ch, N_CHANNELS), lsl_rate, WINDOW_SECS)
    last_band_t    = 0.0
    cached_bands   = None
    cached_quality = 'poor'

    while True:
        # pull_chunk: samples shape = list of [ch0, ch1, ...] per sample
        samples, _ = inlet.pull_chunk(timeout=0.0, max_samples=64)
        if samples:
            # Transpose: per-sample rows → per-channel lists
            channels = [list(col) for col in zip(*samples)]
            engine.push(channels)

            now = time.time()
            if now - last_band_t >= BAND_INTERVAL:
                # LSL stream is already filtered by OpenBCI GUI
                cached_bands, cached_quality = engine.compute(apply_filters=False)
                last_band_t = now

            if CLIENTS:
                msg = {
                    'type':           'eeg',
                    'channels':       channels,
                    'signal_quality': cached_quality,
                    'timestamp':      time.time(),
                }
                if cached_bands is not None:
                    msg['bands'] = cached_bands
                websockets.broadcast(CLIENTS, json.dumps(msg))

        await asyncio.sleep(CHUNK_INTERVAL)


# ── BrainFlow mode (direct or demo) ───────────────────────────────────────
async def broadcast_loop_brainflow(serial_port: str, demo: bool):
    from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds

    BoardShim.disable_board_logger()
    params = BrainFlowInputParams()

    if demo:
        board_id = BoardIds.SYNTHETIC_BOARD.value
    else:
        board_id = BoardIds.GANGLION_BOARD.value
        params.serial_port = serial_port

    board = BoardShim(board_id, params)
    try:
        board.prepare_session()
    except Exception as e:
        print(f"\n[ERROR] Could not connect to board: {e}")
        print("  • Close OpenBCI GUI first, then try again")
        print("  • Or run with --lsl to read from OpenBCI GUI")
        print("  • Or run with --demo to use synthetic data")
        return

    board.start_stream()
    eeg_channels = BoardShim.get_eeg_channels(board_id)
    sample_rate  = BoardShim.get_sampling_rate(board_id)

    print(f"{'[DEMO] ' if demo else ''}Streaming at {sample_rate} Hz")
    print(f"WebSocket server → ws://localhost:{WS_PORT}\n")

    engine         = BandPowerEngine(len(eeg_channels), sample_rate, WINDOW_SECS)
    last_band_t    = 0.0
    cached_bands   = None
    cached_quality = 'poor'

    try:
        while True:
            data = board.get_board_data()
            if data.shape[1] > 0:
                eeg = data[eeg_channels, :]  # shape (n_eeg, n_samples)
                engine.push(eeg.tolist())

                now = time.time()
                if now - last_band_t >= BAND_INTERVAL:
                    # Direct board data is raw — apply BrainFlow filters
                    cached_bands, cached_quality = engine.compute(apply_filters=True)
                    last_band_t = now

                if CLIENTS:
                    msg = {
                        'type':           'eeg',
                        'channels':       eeg.tolist(),
                        'signal_quality': cached_quality,
                        'timestamp':      time.time(),
                    }
                    if cached_bands is not None:
                        msg['bands'] = cached_bands
                    websockets.broadcast(CLIENTS, json.dumps(msg))

            await asyncio.sleep(CHUNK_INTERVAL)
    finally:
        board.stop_stream()
        board.release_session()


# ── WebSocket handler ──────────────────────────────────────────────────────
async def handler(websocket):
    CLIENTS.add(websocket)
    print(f"Browser connected    (total: {len(CLIENTS)})")
    try:
        await websocket.wait_closed()
    finally:
        CLIENTS.discard(websocket)
        print(f"Browser disconnected (total: {len(CLIENTS)})")


# ── Entry point ────────────────────────────────────────────────────────────
async def main(args):
    if args.lsl:
        loop = broadcast_loop_lsl()
    else:
        loop = broadcast_loop_brainflow(args.port, args.demo)

    async with websockets.serve(handler, "localhost", WS_PORT):
        await loop


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OpenBCI Ganglion → WebSocket bridge")
    parser.add_argument("--lsl",  action="store_true", help="Read from OpenBCI GUI LSL stream")
    parser.add_argument("--demo", action="store_true", help="Synthetic data — no hardware")
    parser.add_argument("--port", default="/dev/tty.usbmodem11",
                        help="Serial port for direct BrainFlow connection")
    args = parser.parse_args()

    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        print("\nShutdown.")
